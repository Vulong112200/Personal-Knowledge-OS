import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { foldDiacritics } from '../ingestion/extract-keywords';

const WORKSPACE_GRAPH_NODE_LIMIT = 500;

// Matches [[Title]] and [[Title|alias]] — the target is the part before any pipe.
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

type GraphNodeType = 'document' | 'tag';
type GraphEdgeType = 'shares_tag' | 'similar_content' | 'has_tag' | 'links_to';

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

    if (myTagLinks.length === 0) {
      // Reprocessed into zero tags — still drop any stale has_tag edges from a previous run,
      // otherwise this document keeps showing as "related" via tags it no longer has.
      const existingNode = await this.prisma.graphNode.findFirst({
        where: { workspaceId, nodeType: 'document', refId: documentId },
      });
      if (existingNode) {
        await this.prisma.graphEdge.deleteMany({
          where: { workspaceId, edgeType: 'has_tag', sourceNodeId: existingNode.id },
        });
      }
      return;
    }

    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const documentNode = await this.ensureNode(workspaceId, 'document', documentId, document.title);

    // Idempotent reprocess: drop this document's existing has_tag edges first, so re-running
    // ingestion re-creates them at weight 1 rather than incrementing weight on every run
    // (which made has_tag weight meaningless) and leaves no edges to tags it no longer has.
    await this.prisma.graphEdge.deleteMany({
      where: { workspaceId, edgeType: 'has_tag', sourceNodeId: documentNode.id },
    });

    for (const link of myTagLinks) {
      const tagNode = await this.ensureNode(workspaceId, 'tag', link.tagId, link.tag.name);
      await this.ensureEdge(workspaceId, documentNode.id, tagNode.id, 'has_tag');
    }
  }

  /** Parse [[wiki-links]] from a document's content and materialize real document→document
   * `links_to` edges to the referenced documents (resolved by title, diacritics-insensitive).
   * Idempotent on reprocess: this document's prior outgoing links_to edges are cleared first.
   * Unresolved links (no document with that title) are simply skipped — no placeholder node. */
  async relateByLinks(workspaceId: string, documentId: string, content: string) {
    const existingNode = await this.prisma.graphNode.findFirst({
      where: { workspaceId, nodeType: 'document', refId: documentId },
    });
    // Clear this document's prior outgoing links so an edit that removes a link removes its edge.
    if (existingNode) {
      await this.prisma.graphEdge.deleteMany({
        where: { workspaceId, edgeType: 'links_to', sourceNodeId: existingNode.id },
      });
    }

    const targetTitles = this.parseWikiLinks(content);
    if (targetTitles.length === 0) return;

    // Resolve titles → documents within the workspace by a diacritics-folded, lowercased key
    // (matches how tags/search fold accents), so [[Bao cao]] links to "Báo cáo".
    const docs = await this.prisma.document.findMany({
      where: { workspaceId },
      select: { id: true, title: true },
    });
    const byFolded = new Map(docs.map((d) => [foldDiacritics(d.title.trim().toLowerCase()), d]));

    const self = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const sourceNode = await this.ensureNode(workspaceId, 'document', documentId, self.title);

    const linked = new Set<string>();
    for (const title of targetTitles) {
      const target = byFolded.get(foldDiacritics(title.trim().toLowerCase()));
      if (!target || target.id === documentId || linked.has(target.id)) continue; // unresolved/self/dup
      linked.add(target.id);
      const targetNode = await this.ensureNode(workspaceId, 'document', target.id, target.title);
      await this.ensureEdge(workspaceId, sourceNode.id, targetNode.id, 'links_to');
    }
  }

  private parseWikiLinks(content: string): string[] {
    const titles = new Set<string>();
    for (const match of content.matchAll(WIKI_LINK_RE)) {
      const title = match[1].trim();
      if (title) titles.add(title);
    }
    return [...titles];
  }

  /** "Linked references": documents whose content links TO `documentId` via a [[wiki-link]]
   * (incoming links_to edges). */
  async getBacklinks(workspaceId: string, documentId: string) {
    const node = await this.prisma.graphNode.findFirst({
      where: { workspaceId, nodeType: 'document', refId: documentId },
    });
    if (!node) return [];

    const edges = await this.prisma.graphEdge.findMany({
      where: { workspaceId, edgeType: 'links_to', targetNodeId: node.id },
    });
    const sourceNodeIds = [...new Set(edges.map((e) => e.sourceNodeId))];
    if (sourceNodeIds.length === 0) return [];

    const sourceNodes = await this.prisma.graphNode.findMany({ where: { id: { in: sourceNodeIds } } });
    return sourceNodes.map((n) => ({ documentId: n.refId, title: n.label }));
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

    // Exclude this document's own has_tag edges (sourceNodeId === node.id) — those are
    // already in tagEdges, so without this filter they'd appear twice in `edges`.
    const siblingEdges = tagNodeIds.length
      ? await this.prisma.graphEdge.findMany({
          where: { workspaceId, edgeType: 'has_tag', targetNodeId: { in: tagNodeIds }, sourceNodeId: { not: node.id } },
        })
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
