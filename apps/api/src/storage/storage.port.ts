export interface StoragePort {
  putObject(key: string, data: Buffer): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
