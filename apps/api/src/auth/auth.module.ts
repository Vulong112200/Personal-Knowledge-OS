import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTH_PORT } from './auth.port';
import { SupabaseAuthAdapter } from './supabase-auth.adapter';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [
    { provide: AUTH_PORT, useClass: SupabaseAuthAdapter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
