import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so e2e exercises the real /auth-prefixed routes.
    app.setGlobalPrefix('auth');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/health — liveness', () => {
    return request(app.getHttpServer())
      .get('/auth/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('GET /auth/health/ready — readiness', () => {
    return request(app.getHttpServer())
      .get('/auth/health/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });
});
