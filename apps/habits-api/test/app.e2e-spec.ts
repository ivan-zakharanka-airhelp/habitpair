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

  describe('GET /habits/:habitId/calendar', () => {
    const createHabit = (token: string, body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/habits')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(201)
        .then((res) => res.body.id as string);

    const putMark = (token: string, habitId: string, date: string, status: string) =>
      request(app.getHttpServer())
        .put(`/habits/${habitId}/marks/${date}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status })
        .expect(200);

    it('requires a valid token (guard runs before validation)', () => {
      return request(app.getHttpServer())
        .get(`/habits/${randomUUID()}/calendar?from=2026-06&to=2026-06&today=2026-06-15`)
        .expect(401);
    });

    it('rejects a malformed month range with 400', async () => {
      const id = await createHabit(tokenA, {
        name: 'bad range',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      await request(app.getHttpServer())
        .get(`/habits/${id}/calendar?from=2026-6&to=2026-06&today=2026-06-15`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });

    it('404s when the caller does not own the habit', async () => {
      const id = await createHabit(tokenA, {
        name: 'a-only',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      await request(app.getHttpServer())
        .get(`/habits/${id}/calendar?from=2026-06&to=2026-06&today=2026-06-15`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('computes the daily read-model and reflects a retroactive write', async () => {
      const id = await createHabit(tokenA, {
        name: 'daily cal',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      await putMark(tokenA, id, '2026-06-10', 'COMPLETED');
      await putMark(tokenA, id, '2026-06-12', 'MISSED');

      const first = await request(app.getHttpServer())
        .get(`/habits/${id}/calendar?from=2026-06&to=2026-06&today=2026-06-15`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(first.body.habit.frequency).toBe('DAILY');
      expect(first.body.firstMarkDate).toBe('2026-06-10');
      expect(first.body.marks).toEqual({ '2026-06-10': 'COMPLETED', '2026-06-12': 'MISSED' });
      expect(first.body.computedMissedDates).toEqual(['2026-06-11', '2026-06-13', '2026-06-14']);
      expect(first.body.failedPeriods).toEqual([]);

      // Retroactively complete the gap on the 13th — the read-model must update.
      await putMark(tokenA, id, '2026-06-13', 'COMPLETED');

      const after = await request(app.getHttpServer())
        .get(`/habits/${id}/calendar?from=2026-06&to=2026-06&today=2026-06-15`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(after.body.marks).toEqual({
        '2026-06-10': 'COMPLETED',
        '2026-06-12': 'MISSED',
        '2026-06-13': 'COMPLETED',
      });
      expect(after.body.computedMissedDates).toEqual(['2026-06-11', '2026-06-14']);
    });

    it('computes weekly closed-period failures (satisfied week excluded)', async () => {
      const id = await createHabit(tokenA, {
        name: 'weekly cal',
        modality: 'POSITIVE',
        frequency: 'WEEKLY',
        targetCount: 2,
      });
      await putMark(tokenA, id, '2026-06-01', 'COMPLETED');
      await putMark(tokenA, id, '2026-06-02', 'COMPLETED'); // week Jun 1–7 satisfied
      await putMark(tokenA, id, '2026-06-08', 'COMPLETED'); // week Jun 8–14 under target

      const res = await request(app.getHttpServer())
        .get(`/habits/${id}/calendar?from=2026-06&to=2026-06&today=2026-06-15`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.computedMissedDates).toEqual([]);
      expect(res.body.failedPeriods).toEqual([
        { start: '2026-06-08', end: '2026-06-14', completedCount: 1, target: 2 },
      ]);
    });
  });

  describe('GET /habits/:habitId/metrics', () => {
    const createHabit = (token: string, body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/habits')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(201)
        .then((res) => res.body.id as string);

    const putMark = (token: string, habitId: string, date: string, status: string) =>
      request(app.getHttpServer())
        .put(`/habits/${habitId}/marks/${date}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status })
        .expect(200);

    it('requires a valid token (guard runs before validation)', () => {
      return request(app.getHttpServer())
        .get(`/habits/${randomUUID()}/metrics?today=2026-06-15`)
        .expect(401);
    });

    it('rejects a malformed today with 400', async () => {
      const id = await createHabit(tokenA, {
        name: 'metrics bad today',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      await request(app.getHttpServer())
        .get(`/habits/${id}/metrics?today=2026-6-15`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });

    it('404s when the caller does not own the habit', async () => {
      const id = await createHabit(tokenA, {
        name: 'metrics a-only',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      await request(app.getHttpServer())
        .get(`/habits/${id}/metrics?today=2026-06-15`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('computes the daily metrics read-model for an owned habit', async () => {
      const id = await createHabit(tokenA, {
        name: 'daily metrics',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      await putMark(tokenA, id, '2026-06-13', 'COMPLETED');
      await putMark(tokenA, id, '2026-06-14', 'COMPLETED');

      const res = await request(app.getHttpServer())
        .get(`/habits/${id}/metrics?today=2026-06-15`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // 13,14 done, today (15) unmarked → streak shows through yesterday.
      expect(res.body.unit).toBe('DAY');
      expect(res.body.currentStreak).toBe(2);
      expect(res.body.rollingConsistency).toEqual({ numerator: 2, denominator: 2, percent: 100 });
      expect(res.body.recentCompletion).toEqual({
        numerator: 2,
        denominator: 2,
        percent: 100,
        phase: 'RATIO',
      });
      expect(res.body.bestStreaks).toEqual([{ start: '2026-06-13', end: '2026-06-14', length: 2 }]);
    });

    it('computes the weekly metrics read-model (closed under-target week breaks the streak)', async () => {
      const id = await createHabit(tokenA, {
        name: 'weekly metrics',
        modality: 'POSITIVE',
        frequency: 'WEEKLY',
        targetCount: 2,
      });
      await putMark(tokenA, id, '2026-06-01', 'COMPLETED');
      await putMark(tokenA, id, '2026-06-02', 'COMPLETED'); // week Jun 1–7 satisfied
      await putMark(tokenA, id, '2026-06-08', 'COMPLETED'); // week Jun 8–14 under target

      const res = await request(app.getHttpServer())
        .get(`/habits/${id}/metrics?today=2026-06-17`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.unit).toBe('WEEK');
      expect(res.body.currentStreak).toBe(0); // closed Jun 8–14 failed
      expect(res.body.rollingConsistency).toEqual({ numerator: 1, denominator: 2, percent: 50 });
      expect(res.body.recentCompletion).toEqual({
        numerator: 1,
        denominator: 2,
        percent: 50,
        phase: 'PERCENT',
      });
      expect(res.body.bestStreaks).toEqual([{ start: '2026-06-01', end: '2026-06-07', length: 1 }]);
    });
  });
});
