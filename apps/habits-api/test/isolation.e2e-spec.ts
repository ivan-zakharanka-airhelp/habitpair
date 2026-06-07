import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createHabit,
  createTestApp,
  deleteMark,
  getCalendar,
  getHabits,
  getMetrics,
  putMark,
  TODAY,
} from './helpers';

// Risk #1 (cross-user isolation) + Risk #6 (durable write -> independent
// read-back). Two users (A owns, B does not). Every habitId-addressed route
// must answer B with 404 (not 403, not 200) and leave A's data untouched. A's
// own writes must survive an independent re-read. See test-plan.md §2 #1/#6.
describe('Cross-user isolation + durability (e2e)', () => {
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

  // Every request below carries WELL-FORMED params: the global ValidationPipe
  // runs before the handler, so a malformed param would surface a pipe-400 and
  // the test would assert the wrong status instead of the ownership-404.
  const sweepRoutes: {
    name: string;
    call: (server: unknown, id: string, token: string) => request.Test;
  }[] = [
    {
      name: 'GET /habits/:id/calendar',
      call: (s, id, t) =>
        request(s as never)
          .get(`/habits/${id}/calendar?from=2026-06&to=2026-06&today=${TODAY}`)
          .set('Authorization', `Bearer ${t}`),
    },
    {
      name: 'GET /habits/:id/metrics',
      call: (s, id, t) =>
        request(s as never)
          .get(`/habits/${id}/metrics?today=${TODAY}`)
          .set('Authorization', `Bearer ${t}`),
    },
    {
      name: 'PATCH /habits/:id',
      call: (s, id, t) =>
        request(s as never)
          .patch(`/habits/${id}`)
          .set('Authorization', `Bearer ${t}`)
          .send({ name: 'hijack' }),
    },
    {
      name: 'DELETE /habits/:id',
      call: (s, id, t) =>
        request(s as never)
          .delete(`/habits/${id}`)
          .set('Authorization', `Bearer ${t}`),
    },
    {
      name: 'PUT /habits/:id/marks/:date',
      call: (s, id, t) =>
        request(s as never)
          .put(`/habits/${id}/marks/2026-06-10`)
          .set('Authorization', `Bearer ${t}`)
          .send({ status: 'COMPLETED' }),
    },
    {
      name: 'DELETE /habits/:id/marks/:date',
      call: (s, id, t) =>
        request(s as never)
          .delete(`/habits/${id}/marks/2026-06-10`)
          .set('Authorization', `Bearer ${t}`),
    },
  ];

  describe('non-owner 404 sweep (#1)', () => {
    it.each(sweepRoutes)('B gets 404 on $name (no existence leak)', async ({ call }) => {
      const id = await createHabit(app, tokenA, {
        name: 'sweep target',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      await call(app.getHttpServer(), id, tokenB).expect(404);
    });

    it("B's habit list never contains A's habit", async () => {
      const id = await createHabit(app, tokenA, {
        name: 'a-only list',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });
      const theirs = await getHabits(app, tokenB, TODAY);
      expect(theirs.map((h: { id: string }) => h.id)).not.toContain(id);
    });
  });

  // The second-stage writes (habit update/delete, mark upsert/deleteMany) are
  // keyed on id/habitId ALONE — safe only because assertOwned runs first. A 404
  // alone does not prove B's write did nothing; re-read A's data to prove it.
  it("A's habit and mark are unchanged after every failed B mutation (#1)", async () => {
    const id = await createHabit(app, tokenA, {
      name: 'owner-keep',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });
    await putMark(app, tokenA, id, '2026-06-10', 'COMPLETED');

    // B attempts each mutation; all 404.
    await request(app.getHttpServer())
      .patch(`/habits/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'hijack', modality: 'NEGATIVE' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/habits/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/habits/${id}/marks/2026-06-10`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'MISSED' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/habits/${id}/marks/2026-06-10`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    // A re-reads: habit intact, name/modality unchanged, seeded mark unchanged.
    const habits = await getHabits(app, tokenA, TODAY);
    const mine = habits.find((h: { id: string }) => h.id === id);
    expect(mine).toBeDefined();
    expect(mine.name).toBe('owner-keep');
    expect(mine.modality).toBe('POSITIVE');

    const cal = await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    });
    expect(cal.marks['2026-06-10']).toBe('COMPLETED');
  });

  it('a written mark is durable on an independent second-token read-back (#6)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'durable',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });

    // Mark today so the read-back also exercises the `todayStatus` field.
    const res = await putMark(app, tokenA, id, TODAY, 'COMPLETED');
    expect(res.body).toMatchObject({ habitId: id, status: 'COMPLETED' });
    expect(typeof res.body.id).toBe('string');
    expect(res.body.date.slice(0, 10)).toBe(TODAY); // date echoes the input calendar day
    expect(res.body.createdAt).toBeDefined();

    // A different token for the SAME user — models another device/session.
    const tokenA2 = await jwt.signAsync({ sub: userA });

    const cal = await getCalendar(app, tokenA2, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    });
    expect(cal.marks[TODAY]).toBe('COMPLETED');

    const habits = await getHabits(app, tokenA2, TODAY);
    const mine = habits.find((h: { id: string }) => h.id === id);
    expect(mine.todayStatus).toBe('COMPLETED');

    // Oracle: anchor = today, today explicitly COMPLETED -> streak of 1.
    const metrics = await getMetrics(app, tokenA2, id, TODAY);
    expect(metrics.currentStreak).toBe(1);
    expect(metrics.currentRun).toEqual({ start: TODAY, end: TODAY, length: 1 });
  });

  it('a repeat PUT upserts the same row rather than duplicating (#6)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'upsert',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });

    await putMark(app, tokenA, id, '2026-06-10', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-10', 'MISSED');

    const cal = await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    });
    expect(cal.marks['2026-06-10']).toBe('MISSED');

    // The single-row claim, explicit over the DB (the @@unique([habitId, date])).
    const count = await prisma.mark.count({
      where: { habitId: id, date: new Date('2026-06-10T00:00:00.000Z') },
    });
    expect(count).toBe(1);
  });

  it('unmark removes the day and a repeat DELETE is an idempotent 204 (#6)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'unmark',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });

    await putMark(app, tokenA, id, '2026-06-10', 'COMPLETED');
    await deleteMark(app, tokenA, id, '2026-06-10'); // -> 204

    const cal = await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    });
    expect(cal.marks['2026-06-10']).toBeUndefined();

    // deleteMany (not delete) -> unmarking an already-absent day is a no-op 204.
    await deleteMark(app, tokenA, id, '2026-06-10'); // -> 204 again, not 404/500
  });
});
