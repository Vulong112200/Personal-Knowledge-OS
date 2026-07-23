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

  listForWorkspace(workspaceId: string) {
    return this.prisma.tag.findMany({ where: { workspaceId } });
  }

  listForDocument(documentId: string) {
    return this.prisma.documentTag.findMany({ where: { documentId }, include: { tag: true } });
  }
}
