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
