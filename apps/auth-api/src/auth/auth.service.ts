import { ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

@Injectable()
export class AuthService implements OnModuleInit {
  // Precomputed at boot so the no-such-user login path runs the same argon2
  // verify cost as a wrong-password path — closes the timing enumeration oracle.
  private dummyPasswordHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.password.hash(randomBytes(16).toString('hex'));
  }

  async register(email: string, password: string): Promise<AuthResult> {
    const passwordHash = await this.password.hash(password);
    try {
      const user = await this.prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash },
      });
      return this.issueFor(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always run a verify (against a dummy hash when the user is missing) so the
    // response time and message are identical whether or not the email exists —
    // no account enumeration via error text or timing.
    const passwordHash = user?.passwordHash ?? this.dummyPasswordHash;
    const valid = await this.password.verify(passwordHash, password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueFor(user);
  }

  async refresh(rawToken: string): Promise<AuthResult> {
    const { userId, refreshToken } = await this.tokens.rotate(rawToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    const accessToken = await this.tokens.issueAccessToken(userId);
    return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
  }

  async logout(rawToken: string): Promise<void> {
    await this.tokens.revoke(rawToken);
  }

  private async issueFor(user: { id: string; email: string }): Promise<AuthResult> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.issueAccessToken(user.id),
      this.tokens.issueRefreshToken(user.id),
    ]);
    return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
  }
}
