import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function decodeJwtPayload(token: string): { sub: string } {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

describe('Auth lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = 'e2e-auth@example.com';
  const password = 'sup3r-secret-pw';

  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so e2e exercises the real prefix + validation behavior.
    app.setGlobalPrefix('auth');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('POST /auth/register → 201 with tokens + user; access token decodes to { sub: userId }', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.email).toBe(email);
    expect(typeof res.body.user.id).toBe('string');

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    userId = res.body.user.id;
    expect(decodeJwtPayload(accessToken).sub).toBe(userId);
  });

  it('POST /auth/register with a duplicate email → 409', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(409);
  });

  it('POST /auth/register with an invalid body → 400 (ValidationPipe)', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('POST /auth/login → 200 with fresh tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.id).toBe(userId);
    refreshToken = res.body.refreshToken;
  });

  it('POST /auth/login with a wrong password → 401 with a generic message', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('POST /auth/refresh rotates the token; replaying the old one → 401', async () => {
    const oldRefresh = refreshToken;
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(200);

    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken).not.toBe(oldRefresh);
    refreshToken = res.body.refreshToken;

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(401);
  });

  it('POST /auth/logout → 204; refreshing that token afterward → 401', async () => {
    await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken }).expect(204);

    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);
  });
});
