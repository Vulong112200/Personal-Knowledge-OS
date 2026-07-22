import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_PORT, type AuthPort } from './auth.port';
import { IS_PUBLIC_KEY } from './public.decorator';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_PORT) private readonly authPort: AuthPort,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const authUser = await this.authPort.verifyToken(token);
    request.user = await this.usersService.findOrCreateFromAuth(authUser);
    return true;
  }

  private extractToken(request: { headers: Record<string, string | undefined> }): string | undefined {
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }
}
