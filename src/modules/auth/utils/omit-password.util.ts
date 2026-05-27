import { User } from '@prisma/client';
import { UserPayload } from '../types/auth.types';

export function omitPasswordHash(user: User): UserPayload {
  const { passwordHash: _passwordHash, ...payload } = user;
  return payload;
}
