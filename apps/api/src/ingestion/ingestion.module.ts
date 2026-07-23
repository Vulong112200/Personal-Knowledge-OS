import { Module } from '@nestjs/common';
import { DocumentProcessor } from './document-processor.worker';
import { TagsModule } from '../tags/tags.module';
import { GraphModule } from '../graph/graph.module';

@Module({
  imports: [TagsModule, GraphModule],
  providers: [DocumentProcessor],
})
export class IngestionModule {}
