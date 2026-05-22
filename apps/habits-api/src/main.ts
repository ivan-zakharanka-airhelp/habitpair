import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // All routes live under /habits so Traefik can route by path prefix at the
  // gateway: api.habitpair.com/api/habits/* → strip /api → /habits/*. Keeps each
  // service's URLs self-identifying (/api/habits/health vs /api/auth/health).
  app.setGlobalPrefix('habits');

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
