import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { createRemoteJWKSet, JWTPayload } from 'jose';
import { AuthPort, AuthUser } from './auth.port';

type Jwks = ReturnType<typeof createRemoteJWKSet>;

@Injectable()
export class SupabaseAuthAdapter implements AuthPort {
  // `jose` is ESM-only — loaded via dynamic import (the standard way to consume an
  // ESM-only package from CommonJS-compiled code, and the only way that also works
  // when the app is loaded under Jest's CJS runtime, e.g. in e2e tests).
  private jwksPromise: Promise<Jwks> | null = null;

  private getJwks(): Promise<Jwks> {
    if (!this.jwksPromise) {
      this.jwksPromise = import('jose').then(({ createRemoteJWKSet }) =>
        // Modern Supabase projects sign user session tokens asymmetrically and publish
        // the public keys here; this returns no keys for projects still on the legacy
        // shared HS256 secret, which is why verifyToken falls back to SUPABASE_JWT_SECRET.
        createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)),
      );
    }
    return this.jwksPromise;
  }

  async verifyToken(token: string): Promise<AuthUser> {
    const { jwtVerify } = await import('jose');

    try {
      const jwks = await this.getJwks();
      const { payload } = await jwtVerify(token, jwks);
      return this.toAuthUser(payload);
    } catch {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) throw new UnauthorizedException('Invalid token');

      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
        return this.toAuthUser(payload);
      } catch {
        throw new UnauthorizedException('Invalid token');
      }
    }
  }

  private toAuthUser(payload: JWTPayload): AuthUser {
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new UnauthorizedException('Token missing sub/email claims');
    }
    return { id: payload.sub, email: payload.email };
  }
}
