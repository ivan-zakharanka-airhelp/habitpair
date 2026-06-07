import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export interface E2eContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<E2eContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  // Mirror main.ts so e2e exercises the real prefix + validation behavior.
  app.setGlobalPrefix('auth');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}
