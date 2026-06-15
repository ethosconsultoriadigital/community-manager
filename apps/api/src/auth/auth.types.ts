import type { AuthUser } from '@cm/shared';

export type JwtPayload = {
  sub: string;
  agencyId: string;
  email: string;
  role: AuthUser['role'];
};

export type SafeUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: AuthUser['role'];
  agencyId: string;
};

export type AuthResponse = {
  accessToken: string;
  user: SafeUser;
  agency: { id: string; name: string };
};
