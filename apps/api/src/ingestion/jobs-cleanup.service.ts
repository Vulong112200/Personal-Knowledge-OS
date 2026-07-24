import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// processing_jobs rows are per-stage audit history. They only cascade away when their parent
// document is deleted, so on a long-lived workspace the succeeded rows accumulate unbounded.
// Prune old succeeded rows on a schedule (failed rows are kept longer for diagnostics).
const RETENTION_DAYS = Math.max(1, Number(process.env.PROCESSING_JOBS_RETENTION_DAYS) || 7);

@Injectable()
export class JobsCleanupService {
  private readonly logger = new Logger(JobsCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldSucceededJobs() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.processingJob.deleteMany({
        where: { status: 'succeeded', finishedAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(`Pruned ${count} succeeded processing_jobs older than ${RETENTION_DAYS}d.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`processing_jobs cleanup failed: ${message}`);
    }
  }
}
