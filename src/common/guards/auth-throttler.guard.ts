import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Clé de limitation = IP + email saisi : freine le brute-force d'un compte sans bloquer
 * tout un bureau qui sort sur la même IP publique.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = (req.ips?.length ? req.ips[0] : req.ip) ?? 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? `${ip}:${email}` : ip;
  }
}
