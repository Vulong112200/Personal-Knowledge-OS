import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphController } from './graph.controller';
import { WorkspaceGraphController } from './workspace-graph.controller';

@Module({
  controllers: [GraphController, WorkspaceGraphController],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {}
