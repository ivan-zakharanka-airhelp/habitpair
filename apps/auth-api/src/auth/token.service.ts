import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  issueAccessToken(userId: string): Promise<string> {
    // Claim is { sub } only — matches habits-api's JwtPayload contract. HS256
    // algorithm comes from JwtModule's signOptions.
    return this.jwtService.signAsync({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  async issueRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return token;
  }

  async rotate(rawToken: string): Promise<{ userId: string; refreshToken: string }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!existing || existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.delete({ where: { id: existing.id } });
    const refreshToken = await this.issueRefreshToken(existing.userId);
    return { userId: existing.userId, refreshToken };
  }

  async revoke(rawToken: string): Promise<void> {
    // deleteMany is idempotent: signing out a token that's already gone is a no-op.
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
