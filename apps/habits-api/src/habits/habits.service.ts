import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitFrequency, MarkStatus } from '../../generated/prisma';
import { CreateHabitDto } from './dto/create-habit.dto';
import {
  closedPeriodFailures,
  computedMissedDates,
  currentPeriodRange,
  formatDateOnly,
  markRange,
  monthSpan,
  parseDateOnly,
} from '../marks/period';

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

  // Assembles the calendar read-model for one owned habit over [from, to].
  // Stored marks (the cycle's source of truth) are returned separately from
  // computed coloring (daily computed-misses; failed closed periods) so the
  // SPA never re-derives period logic. `today` is the client's local day.
  async getCalendar(userId: string, habitId: string, from: string, to: string, today: string) {
    // 404 (not 403) on a miss — mirrors MarksService.assertOwned so a habit's
    // existence is not leaked across users.
    const habit = await this.prisma.habit.findFirst({ where: { id: habitId, userId } });
    if (!habit) throw new NotFoundException('Habit not found');

    const span = monthSpan(from, to);
    const todayDate = parseDateOnly(today);
    const query = markRange(span);

    const anchorRow = await this.prisma.mark.findFirst({
      where: { habitId },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const anchor = anchorRow?.date ?? null;

    const marks = await this.prisma.mark.findMany({
      where: { habitId, date: { gte: query.gte, lte: query.lte } },
      select: { date: true, status: true },
      orderBy: { date: 'asc' },
    });

    const isDaily = habit.frequency === HabitFrequency.DAILY;
    const target = habit.targetCount ?? 1;

    // Response marks are the stored marks within the visible window only; the
    // wider query above exists purely so period counts at the edges are exact.
    const marksRecord: Record<string, MarkStatus> = {};
    for (const m of marks) {
      if (m.date.getTime() >= span.start.getTime() && m.date.getTime() <= span.end.getTime()) {
        marksRecord[formatDateOnly(m.date)] = m.status;
      }
    }

    return {
      habit: {
        id: habit.id,
        name: habit.name,
        modality: habit.modality,
        frequency: habit.frequency,
        targetCount: habit.targetCount,
      },
      firstMarkDate: anchor ? formatDateOnly(anchor) : null,
      marks: marksRecord,
      computedMissedDates: isDaily
        ? computedMissedDates(marks, anchor, span.start, span.end, todayDate)
        : [],
      failedPeriods: isDaily
        ? []
        : closedPeriodFailures(
            habit.frequency,
            target,
            marks,
            anchor,
            span.start,
            span.end,
            todayDate,
          ),
    };
  }
}
