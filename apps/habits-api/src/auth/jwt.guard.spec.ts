import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtGuard } from './jwt.guard';

function ctxWithHeader(authorization?: string): ExecutionContext {
  const req: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtGuard', () => {
  const secret = 'test-secret';
  let jwtService: JwtService;
  let guard: JwtGuard;

  beforeAll(() => {
    jwtService = new JwtService({ secret, signOptions: { algorithm: 'HS256' } });
    guard = new JwtGuard(jwtService);
  });

  it('rejects requests with no Authorization header', async () => {
    await expect(guard.canActivate(ctxWithHeader())).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed Authorization header (wrong scheme)', async () => {
    await expect(guard.canActivate(ctxWithHeader('Token abc'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid signature', async () => {
    const forged = await new JwtService({ secret: 'wrong-secret' }).signAsync({ sub: 'u1' });
    await expect(guard.canActivate(ctxWithHeader(`Bearer ${forged}`))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a valid token and attaches the payload to req.user', async () => {
    const token = await jwtService.signAsync({ sub: 'user-123' });
    const ctx = ctxWithHeader(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest() as { user: { sub: string } };
    expect(req.user.sub).toBe('user-123');
  });

  it('rejects an expired token', async () => {
    const expired = await jwtService.signAsync({ sub: 'u1' }, { expiresIn: '-1s' });
    await expect(guard.canActivate(ctxWithHeader(`Bearer ${expired}`))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
