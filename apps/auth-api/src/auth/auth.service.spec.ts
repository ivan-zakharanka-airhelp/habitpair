import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let prisma: { user: { create: jest.Mock; findUnique: jest.Mock } };
  let password: { hash: jest.Mock; verify: jest.Mock };
  let tokens: {
    issueAccessToken: jest.Mock;
    issueRefreshToken: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
  };
  let service: AuthService;

  beforeEach(async () => {
    prisma = { user: { create: jest.fn(), findUnique: jest.fn() } };
    password = { hash: jest.fn().mockResolvedValue('hashed'), verify: jest.fn() };
    tokens = {
      issueAccessToken: jest.fn().mockResolvedValue('access'),
      issueRefreshToken: jest.fn().mockResolvedValue('refresh'),
      rotate: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(prisma as never, password as never, tokens as never);
    await service.onModuleInit();
  });

  it('register lowercases the email, hashes the password, and returns tokens + user', async () => {
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const res = await service.register('A@B.com', 'password123');
    expect(password.hash).toHaveBeenCalledWith('password123');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'a@b.com', passwordHash: 'hashed' },
    });
    expect(res).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'u1', email: 'a@b.com' },
    });
  });

  it('register throws ConflictException on a unique-constraint (P2002) violation', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.register('a@b.com', 'password123')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('login throws a generic 401 when the email is unknown, still running a verify (constant-time, no enumeration)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    password.verify.mockResolvedValue(false);
    await expect(service.login('missing@b.com', 'password123')).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
    expect(password.verify).toHaveBeenCalled();
  });

  it('login throws the same generic 401 on a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      passwordHash: 'hashed',
    });
    password.verify.mockResolvedValue(false);
    const error = await service.login('a@b.com', 'wrong').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe('Invalid email or password');
  });

  it('login returns tokens + user on success', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      passwordHash: 'hashed',
    });
    password.verify.mockResolvedValue(true);
    const res = await service.login('a@b.com', 'password123');
    expect(res.user).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(res.accessToken).toBe('access');
  });
});
