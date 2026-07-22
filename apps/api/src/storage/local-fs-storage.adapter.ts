import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { StoragePort } from './storage.port';

@Injectable()
export class LocalFsStorageAdapter implements StoragePort {
  private readonly root = resolve(process.env.STORAGE_ROOT ?? './var/storage');

  async putObject(key: string, data: Buffer): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root)) {
      throw new Error(`Storage key escapes storage root: ${key}`);
    }
    return path;
  }
}
