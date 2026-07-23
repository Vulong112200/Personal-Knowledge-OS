import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { GraphService } from './graph.service';

@Controller('graph')
export class WorkspaceGraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  getGraph(@CurrentUser() user: CurrentUserPayload) {
    return this.graphService.getWorkspaceGraph(user.defaultWorkspaceId);
  }
}
