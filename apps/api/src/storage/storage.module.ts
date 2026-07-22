import { Global, Module } from '@nestjs/common';
import { STORAGE_PORT } from './storage.port';
import { LocalFsStorageAdapter } from './local-fs-storage.adapter';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: () => {
        const driver = process.env.STORAGE_DRIVER ?? 'local';
        if (driver === 'local') return new LocalFsStorageAdapter();
        throw new Error(`Unsupported STORAGE_DRIVER "${driver}" — only "local" is implemented so far`);
      },
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
