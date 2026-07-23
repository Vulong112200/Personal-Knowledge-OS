import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultWorkspace(userId: string, email: string) {
    const existing = await this.prisma.workspace.findFirst({ where: { ownerId: userId } });
    if (existing) return existing;

    // Same non-atomic find-then-create race as UsersService.upsertUser — under concurrent
    // first-time requests, two calls can both see "no workspace yet" and race on `create`,
    // one losing with a P2002 on the unique `slug` (= userId). Retry by reading the row the
    // winning request just created instead of failing the request.
    try {
      return await this.prisma.workspace.create({
        data: {
          name: `${email.split('@')[0]}'s workspace`,
          slug: userId,
          ownerId: userId,
          members: { create: { userId, role: 'owner' } },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return this.prisma.workspace.findFirstOrThrow({ where: { ownerId: userId } });
      }
      throw err;
    }
  }
}
