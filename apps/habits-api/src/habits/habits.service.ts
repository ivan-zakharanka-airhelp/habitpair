import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitFrequency, MarkStatus } from '../../generated/prisma';
import { CreateHabitDto } from './dto/create-habit.dto';
import { currentPeriodRange, parseDateOnly } from '../marks/period';

@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateHabitDto) {
    const targetCount = dto.frequency === HabitFrequency.DAILY ? null : (dto.targetCount ?? null);
    return this.prisma.habit.create({
      data: {
        userId,
        name: dto.name,
        modality: dto.modality,
        frequency: dto.frequency,
        targetCount,
      },
    });
  }

  async findByUser(userId: string, today: string) {
    const todayDate = parseDateOnly(today);
    const habits = await this.prisma.habit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      habits.map(async (habit) => {
        const { start, end } = currentPeriodRange(habit.frequency, todayDate);
        const [todayMark, completedCount] = await Promise.all([
          this.prisma.mark.findUnique({
            where: { habitId_date: { habitId: habit.id, date: todayDate } },
            select: { status: true },
          }),
          this.prisma.mark.count({
            where: {
              habitId: habit.id,
              status: MarkStatus.COMPLETED,
              date: { gte: start, lte: end },
            },
          }),
        ]);

        return {
          ...habit,
          todayStatus: todayMark?.status ?? null,
          currentPeriod: {
            kind: habit.frequency,
            completedCount,
            target: habit.targetCount ?? 1,
          },
        };
      }),
    );
  }
}
