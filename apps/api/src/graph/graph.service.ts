import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const WORKSPACE_GRAPH_NODE_LIMIT = 500;

type GraphNodeType = 'document' | 'tag';
type GraphEdgeType = 'shares_tag' | 'similar_content' | 'has_tag';

interface GraphNodeRow {
  id: string;
  nodeType: GraphNodeType;
  refId: string;
  label: string;
}

interface GraphEdgeRow {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: GraphEdgeType;
  weight: number;
}

@Injectable()
export class GraphService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureNode(workspaceId: string, nodeType: GraphNodeType, refId: string, label: string) {
    return this.prisma.graphNode.upsert({
      where: { workspaceId_nodeType_refId: { workspaceId, nodeType, refId } },
      create: { workspaceId, nodeType, refId, label },
      update: { label },
    });
  }

  // relateByTags is the only caller and always passes (documentNode.id, tagNode.id) in that
  // order — getRelatedDocuments/getEgoGraph rely on sourceNodeId always being the document
  // side, so this must NOT normalize/sort the pair. The composite unique constraint alone
  // (no OR query) is enough for an atomic upsert, closing the find-then-create/update race
  // that used to allow duplicate edges or lost weight increments under concurrent ingestion.
  private async ensureEdge(workspaceId: string, sourceNodeId: string, targetNodeId: string, edgeType: GraphEdgeType) {
    return this.prisma.graphEdge.upsert({
      where: { workspaceId_edgeType_sourceNodeId_targetNodeId: { workspaceId, edgeType, sourceNodeId, targetNodeId } },
      create: { workspaceId, sourceNodeId, targetNodeId, edgeType, weight: 1 },
      update: { weight: { increment: 1 } },
    });
  }

  /** Materializes this document as a node, and each of its tags as tag nodes, connected by
   * `has_tag` edges. Two documents become "related" transitively through a shared tag node
   * (a star topology) rather than via a direct document-document edge — this scales as
   * N edges per tag instead of N·(N-1)/2 for a naive all-pairs approach, and makes tags
   * first-class hubs in the visualized graph. */
  async relateByTags(workspaceId: string, documentId: string) {
    const myTagLinks = await this.prisma.documentTag.findMany({
      where: { documentId },
      include: { tag: true },
    });
    if (myTagLinks.length === 0) return;

    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const documentNode = await this.ensureNode(workspaceId, 'document', documentId, document.title);

    for (const link of myTagLinks) {
      const tagNode = await this.ensureNode(workspaceId, 'tag', link.tagId, link.tag.name);
      await this.ensureEdge(workspaceId, documentNode.id, tagNode.id, 'has_tag');
    }
  }

  /** Flat list for the existing "Related documents" panel: documents that share at least
   * one tag with `documentId`, found by a 2-hop traversal through tag nodes. */
  async getRelatedDocuments(workspaceId: string, documentId: string) {
    const node = await this.prisma.graphNode.findFirst({
      where: { workspaceId, nodeType: 'document', refId: documentId },
    });
    if (!node) return [];

    const tagEdges = await this.prisma.graphEdge.findMany({
      where: { workspaceId, edgeType: 'has_tag', sourceNodeId: node.id },
    });
    const tagNodeIds = tagEdges.map((e) => e.targetNodeId);
    if (tagNodeIds.length === 0) return [];

    const siblingEdges = await this.prisma.graphEdge.findMany({
      where: { workspaceId, edgeType: 'has_tag', targetNodeId: { in: tagNodeIds }, sourceNodeId: { not: node.id } },
    });
    const siblingNodeIds = [...new Set(siblingEdges.map((e) => e.sourceNodeId))];
    if (siblingNodeIds.length === 0) return [];

    const siblingNodes = await this.prisma.graphNode.findMany({ where: { id: { in: siblingNodeIds } } });
    return siblingNodes.map((n) => ({ documentId: n.refId, title: n.label }));
  }

  /** Ego-graph (nodes+edges) for the document detail page's mini graph: the document
   * itself, its tag nodes, and any sibling documents sharing those tags. */
  async getEgoGraph(workspaceId: string, documentId: string) {
    const node = await this.prisma.graphNode.findFirst({
      where: { workspaceId, nodeType: 'document', refId: documentId },
    });
    if (!node) return this.toGraphDto([], [], 0, false);

    const tagEdges = await this.prisma.graphEdge.findMany({
      where: { workspaceId, edgeType: 'has_tag', sourceNodeId: node.id },
    });
    const tagNodeIds = tagEdges.map((e) => e.targetNodeId);

    const siblingEdges = tagNodeIds.length
      ? await this.prisma.graphEdge.findMany({ where: { workspaceId, edgeType: 'has_tag', targetNodeId: { in: tagNodeIds } } })
      : [];

    const nodeIds = new Set<string>([node.id, ...tagNodeIds, ...siblingEdges.map((e) => e.sourceNodeId)]);
    const nodes = await this.prisma.graphNode.findMany({ where: { id: { in: [...nodeIds] } } });
    const edges = [...tagEdges, ...siblingEdges];

    return this.toGraphDto(nodes, edges, nodes.length, false);
  }

  /** Full workspace graph for the standalone Graph page, capped at
   * WORKSPACE_GRAPH_NODE_LIMIT nodes: all tag nodes are always included (there are
   * typically far fewer tags than documents), document nodes fill the remaining budget,
   * most-recently-created first. */
  async getWorkspaceGraph(workspaceId: string) {
    const totalNodeCount = await this.prisma.graphNode.count({ where: { workspaceId } });

    const tagNodes = await this.prisma.graphNode.findMany({ where: { workspaceId, nodeType: 'tag' } });
    const remaining = Math.max(WORKSPACE_GRAPH_NODE_LIMIT - tagNodes.length, 0);
    const documentNodes = await this.prisma.graphNode.findMany({
      where: { workspaceId, nodeType: 'document' },
      orderBy: { createdAt: 'desc' },
      take: remaining,
    });

    const nodes = [...tagNodes, ...documentNodes];
    const nodeIds = nodes.map((n) => n.id);
    const edges = nodeIds.length
      ? await this.prisma.graphEdge.findMany({
          where: { workspaceId, sourceNodeId: { in: nodeIds }, targetNodeId: { in: nodeIds } },
        })
      : [];

    return this.toGraphDto(nodes, edges, totalNodeCount, totalNodeCount > nodes.length);
  }

  private async toGraphDto(nodes: GraphNodeRow[], edges: GraphEdgeRow[], totalNodeCount: number, truncated: boolean) {
    const tagIds = nodes.filter((n) => n.nodeType === 'tag').map((n) => n.refId);
    const tags = tagIds.length ? await this.prisma.tag.findMany({ where: { id: { in: tagIds } } }) : [];
    const colorByTagId = new Map(tags.map((t) => [t.id, t.color]));

    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        nodeType: n.nodeType,
        refId: n.refId,
        label: n.label,
        color: n.nodeType === 'tag' ? (colorByTagId.get(n.refId) ?? null) : null,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        edgeType: e.edgeType,
        weight: e.weight,
      })),
      totalNodeCount,
      truncated,
    };
  }
}
