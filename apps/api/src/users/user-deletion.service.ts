import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { AUTH_PORT, type AuthPort } from '../auth/auth.port';

@Injectable()
export class UserDeletionService {
  private readonly logger = new Logger(UserDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(AUTH_PORT) private readonly authPort: AuthPort,
  ) {}

  // Batch size for the explicit deletes below — a single statement cascading through
  // hundreds of documents' worth of content/chunks/tags/graph rows can exceed Supabase's
  // pooled-connection statement timeout (observed in practice at ~250 documents), so this
  // deletes in small chunks instead of relying on one giant `user.delete()` cascade.
  private static readonly BATCH_SIZE = 50;

  async deleteAccount(userId: string): Promise<void> {
    const workspaces = await this.prisma.workspace.findMany({ where: { ownerId: userId } });
    const workspaceIds = workspaces.map((w) => w.id);

    const documents = await this.prisma.document.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { id: true, storageKey: true },
    });

    // Best-effort: an orphaned file on disk is a cleanable nuisance; a user permanently
    // unable to delete their account because one file handle failed is a worse outcome.
    await Promise.all(
      documents.map((d) =>
        this.storage
          .deleteObject(d.storageKey)
          .catch((err) => this.logger.warn(`Failed to delete storage object ${d.storageKey}: ${err}`)),
      ),
    );

    const documentIds = documents.map((d) => d.id);
    for (let i = 0; i < documentIds.length; i += UserDeletionService.BATCH_SIZE) {
      const batch = documentIds.slice(i, i + UserDeletionService.BATCH_SIZE);
      // Cascades to document_content/chunks/document_tags/processing_jobs per document —
      // small enough per batch to stay well under the statement timeout.
      await this.prisma.document.deleteMany({ where: { id: { in: batch } } });
    }

    // Graph rows can also number in the thousands for an active workspace — clear them
    // (and tags) explicitly before the cheap final workspace/user delete below.
    await this.prisma.graphEdge.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await this.prisma.graphNode.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await this.prisma.tag.deleteMany({ where: { workspaceId: { in: workspaceIds } } });

    // Everything left under these workspaces is lightweight now — a plain cascade from
    // `user.delete()` (Workspace -> WorkspaceMember/AiChatSession -> ...) is cheap.
    await this.prisma.user.delete({ where: { id: userId } }).catch((err) => {
      if (err?.code === 'P2025') return; // already gone — fine, proceed to the auth-side delete
      throw err;
    });

    try {
      await this.authPort.deleteUser(userId);
    } catch (err) {
      this.logger.error(`DB account for ${userId} deleted, but Supabase auth user deletion failed: ${err}`);
      throw err;
    }
  }
}
