import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createHabit, createTestApp } from './helpers';

describe('Habits CRUD (e2e)', () => {
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
    ({ app, prisma, jwt } = await createTestApp());
    // Tokens minted by the service's own JwtService carry the shared secret.
    tokenA = await jwt.signAsync({ sub: userA });
    tokenB = await jwt.signAsync({ sub: userB });
    await prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } });
  });

  afterAll(async () => {
    await prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await app.close();
  });

  describe('GET /habits', () => {
    it('without Authorization → 401', () => {
      return request(app.getHttpServer()).get('/habits').expect(401);
    });

    it('with a token signed by a different secret → 401', () => {
      return request(app.getHttpServer())
        .get('/habits')
        .set('Authorization', `Bearer ${foreignToken}`)
        .expect(401);
    });

    it('with a shared-secret token → 200 and an array', () => {
      return request(app.getHttpServer())
        .get('/habits?today=2026-06-02')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('POST /habits', () => {
    it('with {} → 400 (ValidationPipe), not 500', () => {
      return request(app.getHttpServer())
        .post('/habits')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(400);
    });

    it('with a whitespace-only name → 400 (trimmed to empty)', () => {
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

  describe('PATCH /habits/:habitId', () => {
    it('updates name and modality and returns the updated row (frequency unchanged)', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'edit me',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });

      const res = await request(app.getHttpServer())
        .patch(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'edited', modality: 'NEGATIVE' })
        .expect(200);

      expect(res.body.name).toBe('edited');
      expect(res.body.modality).toBe('NEGATIVE');
      expect(res.body.frequency).toBe('DAILY');
    });

    it('trims the name on edit', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'pre-trim',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });

      const res = await request(app.getHttpServer())
        .patch(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: '  trimmed  ' })
        .expect(200);

      expect(res.body.name).toBe('trimmed');
    });

    it('rejects an attempt to change frequency (forbidNonWhitelisted) with 400', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'immutable freq',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });

      await request(app.getHttpServer())
        .patch(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ frequency: 'WEEKLY' })
        .expect(400);
    });

    it('rejects an attempt to change targetCount with 400', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'immutable target',
        modality: 'POSITIVE',
        frequency: 'WEEKLY',
        targetCount: 2,
      });

      await request(app.getHttpServer())
        .patch(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetCount: 5 })
        .expect(400);
    });

    it('rejects a whitespace-only name with 400 (trimmed to empty)', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'ws name',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });

      await request(app.getHttpServer())
        .patch(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: '   ' })
        .expect(400);
    });

    it('404s when the caller does not own the habit', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'a-only patch',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });

      await request(app.getHttpServer())
        .patch(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'hijack' })
        .expect(404);
    });
  });

  describe('DELETE /habits/:habitId', () => {
    it('hard-deletes an owned habit (204) and removes it from the list', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'delete me',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });

      await request(app.getHttpServer())
        .delete(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);

      const after = await request(app.getHttpServer())
        .get('/habits?today=2026-06-02')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(after.body.map((h: { id: string }) => h.id)).not.toContain(id);
    });

    it('404s when the caller does not own the habit, leaving it intact for the owner', async () => {
      const id = await createHabit(app, tokenA, {
        name: 'a-only delete',
        modality: 'POSITIVE',
        frequency: 'DAILY',
      });

      await request(app.getHttpServer())
        .delete(`/habits/${id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      const mine = await request(app.getHttpServer())
        .get('/habits?today=2026-06-02')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(mine.body.map((h: { id: string }) => h.id)).toContain(id);
    });
  });
});
