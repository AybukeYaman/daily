import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import {
  type PullQuery,
  PullQuerySchema,
  type PullResponse,
  type PushRequest,
  PushRequestSchema,
  type PushResponse,
} from '@daily/shared';
import { ZodPipe } from '../../../core/presentation/zod-validation.pipe.js';
import { AuthGuard, CurrentUserId } from '../../auth/presentation/auth.guard.js';
import { PullChangesUseCase } from '../application/pull-changes.use-case.js';
import { PushChangesUseCase } from '../application/push-changes.use-case.js';

@UseGuards(AuthGuard)
@Controller('sync')
export class SyncController {
  constructor(
    private readonly push: PushChangesUseCase,
    private readonly pull: PullChangesUseCase,
  ) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async pushChanges(
    @CurrentUserId() userId: string,
    @Body(new ZodPipe(PushRequestSchema)) body: PushRequest,
  ): Promise<PushResponse> {
    return { results: await this.push.execute(userId, body.ops) };
  }

  @Get('pull')
  pullChanges(
    @CurrentUserId() userId: string,
    @Query(new ZodPipe(PullQuerySchema)) query: PullQuery,
  ): Promise<PullResponse> {
    return this.pull.execute(userId, query);
  }
}
