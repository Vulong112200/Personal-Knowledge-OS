import { Module } from '@nestjs/common';
import { DocumentProcessor } from './document-processor.worker';

@Module({
  providers: [DocumentProcessor],
})
export class IngestionModule {}
