import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { GraphService } from './graph.service';

@Controller('documents/:id')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get('related')
  related(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.graphService.getRelatedDocuments(user.defaultWorkspaceId, id);
  }

  @Get('related/graph')
  relatedGraph(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.graphService.getEgoGraph(user.defaultWorkspaceId, id);
  }
}
