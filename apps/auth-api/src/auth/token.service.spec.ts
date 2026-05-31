import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { TokenService } from './token.service';

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

describe('TokenService', () => {
  const jwtService = new JwtService({
    secret: 'test-secret',
    signOptions: { algorithm: 'HS256' },
  });
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let service: TokenService;

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new TokenService(jwtService, prisma as never);
  });

  it('issues an access token whose sub is the userId', async () => {
    const token = await service.issueAccessToken('user-1');
    const payload = jwtService.verify<{ sub: string }>(token);
    expect(payload.sub).toBe('user-1');
  });

  it('persists a refresh token as its sha256 hash and returns the raw token', async () => {
    const raw = await service.issueRefreshToken('user-1');
    expect(typeof raw).toBe('string');
    const arg = prisma.refreshToken.create.mock.calls[0][0];
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.tokenHash).toBe(sha256(raw));
    expect(arg.data.tokenHash).not.toBe(raw);
    expect(arg.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rotate deletes the presented token and issues a new one', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await service.rotate('old-raw');
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('old-raw') },
    });
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
    expect(result.userId).toBe('user-1');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('rotate throws for an unknown token without deleting anything', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.delete).not.toHaveBeenCalled();
  });

  it('rotate throws for an expired token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1_000),
    });
    await expect(service.rotate('expired')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.delete).not.toHaveBeenCalled();
  });

  it('revoke is idempotent via deleteMany', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.revoke('whatever')).resolves.toBeUndefined();
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('whatever') },
    });
  });
});
