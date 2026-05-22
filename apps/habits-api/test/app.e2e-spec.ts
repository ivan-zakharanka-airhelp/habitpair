import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Habits API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /habits/health — liveness', () => {
    return request(app.getHttpServer()).get('/habits/health').expect(200).expect({ status: 'ok' });
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
});
