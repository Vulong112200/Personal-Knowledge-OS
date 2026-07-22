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
    const user = await this.prisma.user.upsert({
      where: { id: authUser.id },
      update: { email: authUser.email },
      create: { id: authUser.id, email: authUser.email },
    });

    const workspace = await this.workspaces.ensureDefaultWorkspace(user.id, user.email);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      defaultWorkspaceId: workspace.id,
    };
  }
}
