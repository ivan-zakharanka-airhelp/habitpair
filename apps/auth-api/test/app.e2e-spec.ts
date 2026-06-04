import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
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
