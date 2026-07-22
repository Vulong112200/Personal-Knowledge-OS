import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { CurrentUserPayload } from '../users/users.service';

export const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.md', '.txt']);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async upload(user: CurrentUserPayload, file: Express.Multer.File) {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `Unsupported file type "${ext}" — allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds max size of ${MAX_SIZE_BYTES} bytes`);
    }

    const documentId = randomUUID();
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${user.defaultWorkspaceId}/${documentId}/${file.originalname}`;

    await this.storage.putObject(storageKey, file.buffer);

    return this.prisma.document.create({
      data: {
        id: documentId,
        workspaceId: user.defaultWorkspaceId,
        uploadedBy: user.id,
        title: file.originalname,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksum,
        storageDriver: 'local',
        storageKey,
        status: 'uploaded',
      },
    });
  }

  list(user: CurrentUserPayload) {
    return this.prisma.document.findMany({
      where: { workspaceId: user.defaultWorkspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: CurrentUserPayload, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, workspaceId: user.defaultWorkspaceId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async download(user: CurrentUserPayload, id: string) {
    const document = await this.get(user, id);
    const buffer = await this.storage.getObject(document.storageKey);
    return { document, buffer };
  }
}
