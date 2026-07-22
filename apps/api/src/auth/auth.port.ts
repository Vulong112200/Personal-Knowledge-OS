export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthPort {
  verifyToken(token: string): Promise<AuthUser>;
}

export const AUTH_PORT = Symbol('AUTH_PORT');
