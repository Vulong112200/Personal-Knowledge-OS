import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findOrCreate(workspaceId: string, name: string) {
    const normalized = name.trim().toLowerCase();
    return this.prisma.tag.upsert({
      where: { workspaceId_name: { workspaceId, name: normalized } },
      update: {},
      create: { workspaceId, name: normalized },
    });
  }

  assignToDocument(documentId: string, tagId: string, source: 'user' | 'ai') {
    return this.prisma.documentTag.upsert({
      where: { documentId_tagId: { documentId, tagId } },
      update: {},
      create: { documentId, tagId, source },
    });
  }

  /** Remove AI-assigned tags from a document. Used before re-tagging on reprocess so a
   * changed keyword set doesn't leave stale tags (and stale graph edges) behind.
   * User-assigned tags (source='user') are preserved. */
  clearAiTags(documentId: string) {
    return this.prisma.documentTag.deleteMany({ where: { documentId, source: 'ai' } });
  }

  async listForWorkspace(workspaceId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { workspaceId },
      include: { _count: { select: { documents: true } } },
      orderBy: { name: 'asc' },
    });
    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      documentCount: t._count.documents,
    }));
  }

  listForDocument(documentId: string) {
    return this.prisma.documentTag.findMany({ where: { documentId }, include: { tag: true } });
  }
}
