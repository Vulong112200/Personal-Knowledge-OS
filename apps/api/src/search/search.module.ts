import { Global, Module } from '@nestjs/common';
import { SEARCH_PORT } from './search.port';
import { PostgresSearchAdapter } from './postgres-search.adapter';
import { SearchController } from './search.controller';

@Global()
@Module({
  controllers: [SearchController],
  providers: [{ provide: SEARCH_PORT, useClass: PostgresSearchAdapter }],
  exports: [SEARCH_PORT],
})
export class SearchModule {}
