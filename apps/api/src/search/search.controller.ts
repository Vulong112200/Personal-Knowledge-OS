import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { SEARCH_PORT, type SearchPort } from './search.port';

@Controller('search')
export class SearchController {
  constructor(@Inject(SEARCH_PORT) private readonly searchPort: SearchPort) {}

  @Get()
  async search(@CurrentUser() user: CurrentUserPayload, @Query('q') q?: string) {
    if (!q?.trim()) return { results: [], semanticUnavailable: true };

    const results = await this.searchPort.searchFullText(user.defaultWorkspaceId, q.trim());
    // semanticUnavailable stays true until M5 adds the AiPort-backed vector leg —
    // fixed response shape now so the frontend never needs to change later.
    return { results, semanticUnavailable: true };
  }
}
