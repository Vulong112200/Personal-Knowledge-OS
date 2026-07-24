import { Module } from '@nestjs/common';
import { DocumentProcessor } from './document-processor.worker';
import { JobsCleanupService } from './jobs-cleanup.service';
import { TagsModule } from '../tags/tags.module';
import { GraphModule } from '../graph/graph.module';

@Module({
  imports: [TagsModule, GraphModule],
  providers: [DocumentProcessor, JobsCleanupService],
})
export class IngestionModule {}
