import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { GraphService } from './graph.service';

@Controller('documents/:id/related')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  related(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.graphService.getRelatedDocuments(user.defaultWorkspaceId, id);
  }
}
