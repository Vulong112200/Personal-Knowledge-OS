import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GraphService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureNode(workspaceId: string, nodeType: 'document' | 'tag', refId: string, label: string) {
    const existing = await this.prisma.graphNode.findFirst({ where: { workspaceId, nodeType, refId } });
    if (existing) return existing;
    return this.prisma.graphNode.create({ data: { workspaceId, nodeType, refId, label } });
  }

  private async ensureEdge(workspaceId: string, sourceNodeId: string, targetNodeId: string, edgeType: 'shares_tag') {
    const existing = await this.prisma.graphEdge.findFirst({
      where: {
        workspaceId,
        edgeType,
        OR: [
          { sourceNodeId, targetNodeId },
          { sourceNodeId: targetNodeId, targetNodeId: sourceNodeId },
        ],
      },
    });
    if (existing) {
      return this.prisma.graphEdge.update({
        where: { id: existing.id },
        data: { weight: existing.weight + 1 },
      });
    }
    return this.prisma.graphEdge.create({
      data: { workspaceId, sourceNodeId, targetNodeId, edgeType, weight: 1 },
    });
  }

  /** Naive relationship detection: connects this document to every other document in the
   * workspace that shares at least one tag with it. Not a real dependency-graph analysis —
   * enough to prove the schema and give the "Related Documents" panel something to show. */
  async relateByTags(workspaceId: string, documentId: string) {
    const myTagLinks = await this.prisma.documentTag.findMany({
      where: { documentId },
      select: { tagId: true },
    });
    if (myTagLinks.length === 0) return;

    const tagIds = myTagLinks.map((t) => t.tagId);
    const otherLinks = await this.prisma.documentTag.findMany({
      where: { tagId: { in: tagIds }, documentId: { not: documentId } },
      select: { documentId: true },
      distinct: ['documentId'],
    });
    if (otherLinks.length === 0) return;

    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const myNode = await this.ensureNode(workspaceId, 'document', documentId, document.title);

    for (const other of otherLinks) {
      const otherDocument = await this.prisma.document.findUnique({ where: { id: other.documentId } });
      if (!otherDocument) continue;

      const otherNode = await this.ensureNode(workspaceId, 'document', other.documentId, otherDocument.title);
      await this.ensureEdge(workspaceId, myNode.id, otherNode.id, 'shares_tag');
    }
  }

  async getRelatedDocuments(workspaceId: string, documentId: string) {
    const node = await this.prisma.graphNode.findFirst({
      where: { workspaceId, nodeType: 'document', refId: documentId },
    });
    if (!node) return [];

    const edges = await this.prisma.graphEdge.findMany({
      where: { workspaceId, OR: [{ sourceNodeId: node.id }, { targetNodeId: node.id }] },
    });

    const relatedNodeIds = edges.map((e) => (e.sourceNodeId === node.id ? e.targetNodeId : e.sourceNodeId));
    if (relatedNodeIds.length === 0) return [];

    const relatedNodes = await this.prisma.graphNode.findMany({ where: { id: { in: relatedNodeIds } } });
    return relatedNodes.map((n) => ({ documentId: n.refId, title: n.label }));
  }
}
