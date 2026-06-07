import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export interface E2eContext {
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
}

// Canonical "now" for the new integration specs. Chosen so June periods are
// open (end >= today) and earlier months/weeks are closed (end < today),
// making closed-vs-open period scenarios unambiguous. Pass it as the explicit
// `today` to every time-dependent read — never rely on wall-clock.
export const TODAY = '2026-06-15';

export async function createTestApp(): Promise<E2eContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  // Mirror main.ts so e2e exercises the real prefix + validation behavior.
  app.setGlobalPrefix('habits');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.init();

  return { app, prisma: app.get(PrismaService), jwt: app.get(JwtService) };
}

export function createHabit(
  app: INestApplication,
  token: string,
  body: Record<string, unknown>,
): Promise<string> {
  return request(app.getHttpServer())
    .post('/habits')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201)
    .then((res) => res.body.id as string);
}

export function putMark(
  app: INestApplication,
  token: string,
  habitId: string,
  date: string,
  status: string,
) {
  return request(app.getHttpServer())
    .put(`/habits/${habitId}/marks/${date}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status })
    .expect(200);
}

export function deleteMark(app: INestApplication, token: string, habitId: string, date: string) {
  return request(app.getHttpServer())
    .delete(`/habits/${habitId}/marks/${date}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(204);
}

export function getCalendar(
  app: INestApplication,
  token: string,
  habitId: string,
  { from, to, today }: { from: string; to: string; today: string },
) {
  return request(app.getHttpServer())
    .get(`/habits/${habitId}/calendar?from=${from}&to=${to}&today=${today}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
    .then((res) => res.body);
}

export function getMetrics(app: INestApplication, token: string, habitId: string, today: string) {
  return request(app.getHttpServer())
    .get(`/habits/${habitId}/metrics?today=${today}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
    .then((res) => res.body);
}

export function getHabits(app: INestApplication, token: string, today: string) {
  return request(app.getHttpServer())
    .get(`/habits?today=${today}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)
    .then((res) => res.body);
}
