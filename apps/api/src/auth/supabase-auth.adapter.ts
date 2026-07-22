import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthPort, AuthUser } from './auth.port';

@Injectable()
export class SupabaseAuthAdapter implements AuthPort {
  // Modern Supabase projects sign user session tokens asymmetrically and publish
  // the public keys here; this returns no keys for projects still on the legacy
  // shared HS256 secret, which is why verifyToken falls back to SUPABASE_JWT_SECRET.
  private readonly jwks = createRemoteJWKSet(
    new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  );

  async verifyToken(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.jwks);
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
