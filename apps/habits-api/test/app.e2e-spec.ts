import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Habits API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const userA = randomUUID();
  const userB = randomUUID();
  let tokenA: string;
  let tokenB: string;
  // Signed with a secret the service does not share — must be rejected.
  const foreignToken = new JwtService({
    secret: 'a-different-secret-not-shared-with-the-service',
    signOptions: { algorithm: 'HS256' },
  }).sign({ sub: userA });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so e2e exercises the real prefix + validation behavior.
    app.setGlobalPrefix('habits');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    // Tokens minted by the service's own JwtService carry the shared secret.
    tokenA = await jwt.signAsync({ sub: userA });
    tokenB = await jwt.signAsync({ sub: userB });
    await prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } });
  });

  afterAll(async () => {
    await prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await app.close();
  });

  it('GET /habits/health — liveness', () => {
    return request(app.getHttpServer())
      .get('/habits/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('GET /habits/health/ready — readiness', () => {
    return request(app.getHttpServer())
      .get('/habits/health/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('GET /habits without Authorization → 401', () => {
    return request(app.getHttpServer()).get('/habits').expect(401);
  });

  it('GET /habits with a token signed by a different secret → 401', () => {
    return request(app.getHttpServer())
      .get('/habits')
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(401);
  });

  it('GET /habits with a shared-secret token → 200 and an array', () => {
    return request(app.getHttpServer())
      .get('/habits?today=2026-06-02')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('POST /habits with {} → 400 (ValidationPipe), not 500', () => {
    return request(app.getHttpServer())
      .post('/habits')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(400);
  });

  it('POST /habits with a whitespace-only name → 400 (trimmed to empty)', () => {
    return request(app.getHttpServer())
      .post('/habits')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: '   ', modality: 'POSITIVE', frequency: 'DAILY' })
      .expect(400);
  });

  it('creates a habit, trims the name, and isolates it to the owning user', async () => {
    const created = await request(app.getHttpServer())
      .post('/habits')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: '  read daily  ', modality: 'POSITIVE', frequency: 'DAILY' })
      .expect(201);
    expect(created.body.name).toBe('read daily');

    const mine = await request(app.getHttpServer())
      .get('/habits?today=2026-06-02')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(mine.body.map((h: { name: string }) => h.name)).toContain('read daily');

    const theirs = await request(app.getHttpServer())
      .get('/habits?today=2026-06-02')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(theirs.body).toHaveLength(0);
  });
});
