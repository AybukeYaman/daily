import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { EntryParamsSchema, type VersionDetail, type VersionList, VersionParamsSchema } from '@daily/shared';
import type { z } from 'zod';
import { ZodPipe } from '../../../core/presentation/zod-validation.pipe.js';
import { AuthGuard, CurrentUserId } from '../../auth/presentation/auth.guard.js';
import { GetEntryVersionUseCase, ListEntryVersionsUseCase } from '../application/version-history.use-cases.js';

@UseGuards(AuthGuard)
@Controller('entries')
export class EntriesController {
  constructor(
    private readonly listVersions: ListEntryVersionsUseCase,
    private readonly getVersion: GetEntryVersionUseCase,
  ) {}

  @Get(':id/versions')
  async versions(
    @CurrentUserId() userId: string,
    @Param(new ZodPipe(EntryParamsSchema)) params: z.output<typeof EntryParamsSchema>,
  ): Promise<VersionList> {
    return { versions: await this.listVersions.execute(userId, params.id) };
  }

  @Get(':id/versions/:revision')
  version(
    @CurrentUserId() userId: string,
    @Param(new ZodPipe(VersionParamsSchema)) params: z.output<typeof VersionParamsSchema>,
  ): Promise<VersionDetail> {
    return this.getVersion.execute(userId, params.id, params.revision);
  }
}
