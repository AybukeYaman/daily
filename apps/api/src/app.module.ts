import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module.js';
import { DomainExceptionFilter } from './core/presentation/domain-exception.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { SyncModule } from './modules/sync/sync.module.js';

@Controller('health')
class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    AuthModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
