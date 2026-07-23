export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthPort {
  verifyToken(token: string): Promise<AuthUser>;
  deleteUser(id: string): Promise<void>;
}

export const AUTH_PORT = Symbol('AUTH_PORT');
