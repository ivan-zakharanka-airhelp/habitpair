import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createHabit, createTestApp, putMark } from './helpers';

describe('GET /habits/:habitId/metrics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const userA = randomUUID();
  const userB = randomUUID();
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    ({ app, prisma, jwt } = await createTestApp());
    tokenA = await jwt.signAsync({ sub: userA });
    tokenB = await jwt.signAsync({ sub: userB });
    await prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } });
  });

  afterAll(async () => {
    await prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await app.close();
  });

  it('requires a valid token (guard runs before validation)', () => {
    return request(app.getHttpServer())
      .get(`/habits/${randomUUID()}/metrics?today=2026-06-15`)
      .expect(401);
  });

  it('rejects a malformed today with 400', async () => {
    const id = await createHabit(app, tokenA, {
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
    const id = await createHabit(app, tokenA, {
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
    const id = await createHabit(app, tokenA, {
      name: 'daily metrics',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });
    await putMark(app, tokenA, id, '2026-06-13', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-14', 'COMPLETED');

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
    expect(res.body.currentRun).toEqual({ start: '2026-06-13', end: '2026-06-14', length: 2 });
  });

  it('computes the weekly metrics read-model (closed under-target week breaks the streak)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'weekly metrics',
      modality: 'POSITIVE',
      frequency: 'WEEKLY',
      targetCount: 2,
    });
    await putMark(app, tokenA, id, '2026-06-01', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-02', 'COMPLETED'); // week Jun 1–7 satisfied
    await putMark(app, tokenA, id, '2026-06-08', 'COMPLETED'); // week Jun 8–14 under target

    const res = await request(app.getHttpServer())
      .get(`/habits/${id}/metrics?today=2026-06-17`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.unit).toBe('WEEK');
    expect(res.body.currentStreak).toBe(0); // closed Jun 8–14 failed
    expect(res.body.currentRun).toBeNull();
    expect(res.body.rollingConsistency).toEqual({ numerator: 1, denominator: 2, percent: 50 });
    expect(res.body.recentCompletion).toEqual({
      numerator: 1,
      denominator: 2,
      percent: 50,
      phase: 'PERCENT',
    });
    expect(res.body.bestStreaks).toEqual([{ start: '2026-06-01', end: '2026-06-07', length: 1 }]);
  });

  it('computes the monthly metrics read-model (closed under-target month breaks the streak)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'monthly metrics',
      modality: 'POSITIVE',
      frequency: 'MONTHLY',
      targetCount: 2,
    });
    await putMark(app, tokenA, id, '2026-03-10', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-03-25', 'COMPLETED'); // March satisfied
    await putMark(app, tokenA, id, '2026-04-15', 'COMPLETED'); // April under target
    await putMark(app, tokenA, id, '2026-05-08', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-05-12', 'COMPLETED'); // May satisfied

    const res = await request(app.getHttpServer())
      .get(`/habits/${id}/metrics?today=2026-06-15`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // March✓ April✗ May✓, June open/empty → streak counts only May (April breaks it).
    expect(res.body.unit).toBe('MONTH');
    expect(res.body.currentStreak).toBe(1);
    expect(res.body.currentRun).toEqual({ start: '2026-05-01', end: '2026-05-31', length: 1 });
    expect(res.body.rollingConsistency).toEqual({ numerator: 2, denominator: 3, percent: 67 });
    expect(res.body.recentCompletion).toEqual({
      numerator: 2,
      denominator: 3,
      percent: 67,
      phase: 'PERCENT',
    });
    // length-tie broken toward recency → May before March.
    expect(res.body.bestStreaks).toEqual([
      { start: '2026-05-01', end: '2026-05-31', length: 1 },
      { start: '2026-03-01', end: '2026-03-31', length: 1 },
    ]);
  });

  it('returns a neutral all-null read-model for a never-marked habit', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'never marked',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });

    const res = await request(app.getHttpServer())
      .get(`/habits/${id}/metrics?today=2026-06-15`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // No anchor → nothing evaluable; neutral empties (no NaN, no "0 of 0").
    expect(res.body.unit).toBe('DAY');
    expect(res.body.currentStreak).toBe(0);
    expect(res.body.currentRun).toBeNull();
    expect(res.body.rollingConsistency).toEqual({ numerator: 0, denominator: 0, percent: null });
    expect(res.body.recentCompletion).toEqual({
      numerator: 0,
      denominator: 0,
      percent: null,
      phase: 'RATIO',
    });
    expect(res.body.bestStreaks).toEqual([]);
  });
});
