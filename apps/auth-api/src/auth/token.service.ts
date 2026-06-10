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
    // Delete the old token and mint its replacement atomically — a failure
    // mid-rotation must never leave the user with no valid refresh token.
    // The deleteMany doubles as the atomic claim: concurrent rotations of the
    // same token (second tab, network retry) race on the row, and the loser
    // sees 0 rows — that must surface as a 401, not a P2025 (delete-by-id
    // would throw, and Nest's default filter turns it into a 500).
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.deleteMany({ where: { id: existing.id } });
      if (count === 0) throw new UnauthorizedException('Invalid refresh token');
      await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });
    });
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
