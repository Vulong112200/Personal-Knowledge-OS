import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultWorkspace(userId: string, email: string) {
    const existing = await this.prisma.workspace.findFirst({ where: { ownerId: userId } });
    if (existing) return existing;

    return this.prisma.workspace.create({
      data: {
        name: `${email.split('@')[0]}'s workspace`,
        slug: userId,
        ownerId: userId,
        members: { create: { userId, role: 'owner' } },
      },
    });
  }
}
