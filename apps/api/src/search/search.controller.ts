import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { SEARCH_PORT, type SearchPort } from './search.port';

const DEFAULT_LIMIT = 20;

@Controller('search')
export class SearchController {
  constructor(@Inject(SEARCH_PORT) private readonly searchPort: SearchPort) {}

  @Get()
  async search(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const parsedOffset = Number.parseInt(offset ?? '', 10);
    const opts = {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
    };

    if (!q?.trim()) return { results: [], total: 0, limit: opts.limit, offset: opts.offset };

    const { results, total } = await this.searchPort.searchFullText(
      user.defaultWorkspaceId,
      q.trim(),
      opts,
    );
    return { results, total, limit: opts.limit, offset: opts.offset };
  }
}
