import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createHabit, createTestApp, putMark } from './helpers';

describe('GET /habits/:habitId/calendar (e2e)', () => {
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
      .get(`/habits/${randomUUID()}/calendar?from=2026-06&to=2026-06&today=2026-06-15`)
      .expect(401);
  });

  it('rejects a malformed month range with 400', async () => {
    const id = await createHabit(app, tokenA, {
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
    const id = await createHabit(app, tokenA, {
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
    const id = await createHabit(app, tokenA, {
      name: 'daily cal',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });
    await putMark(app, tokenA, id, '2026-06-10', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-12', 'MISSED');

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
    await putMark(app, tokenA, id, '2026-06-13', 'COMPLETED');

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
    const id = await createHabit(app, tokenA, {
      name: 'weekly cal',
      modality: 'POSITIVE',
      frequency: 'WEEKLY',
      targetCount: 2,
    });
    await putMark(app, tokenA, id, '2026-06-01', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-02', 'COMPLETED'); // week Jun 1–7 satisfied
    await putMark(app, tokenA, id, '2026-06-08', 'COMPLETED'); // week Jun 8–14 under target

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
