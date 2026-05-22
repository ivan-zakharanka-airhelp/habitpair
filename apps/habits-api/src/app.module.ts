import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { HabitsModule } from './habits/habits.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({
      global: true,
      // Same secret as auth-api uses to sign — see deployment env var JWT_SECRET.
      // Dev fallback keeps e2e tests runnable without env setup.
      secret: process.env.JWT_SECRET ?? 'unsafe-dev-only-secret',
      signOptions: { algorithm: 'HS256' },
    }),
    PrismaModule,
    HealthModule,
    HabitsModule,
  ],
})
export class AppModule {}
