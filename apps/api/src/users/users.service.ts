import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AuthUser } from '../auth/auth.port';

export interface CurrentUserPayload {
  id: string;
  email: string;
  displayName: string | null;
  defaultWorkspaceId: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async findOrCreateFromAuth(authUser: AuthUser): Promise<CurrentUserPayload> {
    const user = await this.upsertUser(authUser);
    const workspace = await this.workspaces.ensureDefaultWorkspace(user.id, user.email);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      defaultWorkspaceId: workspace.id,
    };
  }

  // Prisma's upsert() here is not a true atomic DB-level UPSERT for this driver-adapter
  // setup — under concurrent first-time requests for a brand-new user (e.g. a bulk upload
  // firing several requests at once right after signup), two upserts can both see "no
  // existing row" and race on the create, one losing with a P2002 unique violation. Retry
  // by reading the row the winning request just created instead of failing the request.
  private async upsertUser(authUser: AuthUser) {
    try {
      return await this.prisma.user.upsert({
        where: { id: authUser.id },
        update: { email: authUser.email },
        create: { id: authUser.id, email: authUser.email },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return this.prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
      }
      throw err;
    }
  }
}
