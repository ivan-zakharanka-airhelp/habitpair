import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitFrequency, HabitModality, MarkStatus } from '../../generated/prisma';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import {
  addUtcDays,
  closedPeriodFailures,
  computedMissedDates,
  currentPeriodRange,
  formatDateOnly,
  markRange,
  monthSpan,
  parseDateOnly,
} from '../marks/period';
import { computeMetrics, type MetricsInput } from '../marks/metrics';
import { computePatterns } from '../marks/patterns';

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
    const windowStart = addUtcDays(todayDate, -6); // 7-day strip: [today-6, today]
    const habits = await this.prisma.habit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      habits.map(async (habit) => {
        const { start, end } = currentPeriodRange(habit.frequency, todayDate);
        // The full mark history backs the streak (the metrics engine walks from
        // the anchor period); the same rows feed the 7-day strip, so no extra
        // query is needed. Acceptable at this app's scale — bound the read if
        // habit counts ever grow (see plan's Performance Considerations).
        const [todayMark, completedCount, marks] = await Promise.all([
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
          this.prisma.mark.findMany({
            where: { habitId: habit.id },
            select: { date: true, status: true },
            orderBy: { date: 'asc' },
          }),
        ]);

        const { unit, currentStreak } = computeMetrics({
          frequency: habit.frequency,
          target: habit.targetCount ?? 1,
          anchor: marks[0]?.date ?? null,
          today: todayDate,
          marks,
        });

        const recentMarks = marks
          .filter(
            (m) =>
              m.date.getTime() >= windowStart.getTime() && m.date.getTime() <= todayDate.getTime(),
          )
          .map((m) => ({ date: formatDateOnly(m.date), status: m.status }));

        return {
          ...habit,
          todayStatus: todayMark?.status ?? null,
          currentPeriod: {
            kind: habit.frequency,
            completedCount,
            target: habit.targetCount ?? 1,
          },
          recentMarks,
          currentStreak,
          unit,
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

  // Computes the four insight metrics on read from all of a habit's marks and
  // its (immutable) frequency/target. Delegates the math to computeMetrics —
  // this method only owns the 404-on-miss ownership check and the Prisma reads.
  async getMetrics(userId: string, habitId: string, today: string) {
    // 404 (not 403) on a miss — mirrors getCalendar so a habit's existence is
    // not leaked across users.
    const habit = await this.prisma.habit.findFirst({ where: { id: habitId, userId } });
    if (!habit) throw new NotFoundException('Habit not found');

    const todayDate = parseDateOnly(today);

    // Unbounded read (unlike getCalendar's windowed one), so marks[0] is always
    // the true anchor — no separate anchor query needed.
    const marks = await this.prisma.mark.findMany({
      where: { habitId },
      select: { date: true, status: true },
      orderBy: { date: 'asc' },
    });

    const metricsInput: MetricsInput = {
      frequency: habit.frequency,
      target: habit.targetCount ?? 1,
      anchor: marks[0]?.date ?? null,
      today: todayDate,
      marks,
    };

    // patterns rides the same input and Prisma read — zero new I/O.
    return { ...computeMetrics(metricsInput), patterns: computePatterns(metricsInput) };
  }

  // Edits only name/modality. frequency/targetCount stay immutable — the DTO
  // omits them, so a body carrying them is rejected by forbidNonWhitelisted
  // before reaching here. An empty body is a no-op that returns the habit as-is.
  async update(userId: string, habitId: string, dto: UpdateHabitDto) {
    await this.assertOwned(userId, habitId);
    const data: { name?: string; modality?: HabitModality } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.modality !== undefined) data.modality = dto.modality;
    return this.prisma.habit.update({ where: { id: habitId }, data });
  }

  // Hard delete; the Mark.habit relation's onDelete: Cascade removes its marks
  // transactionally in the DB, so there is no orphan cleanup to do here.
  async remove(userId: string, habitId: string): Promise<void> {
    await this.assertOwned(userId, habitId);
    await this.prisma.habit.delete({ where: { id: habitId } });
  }

  // 404 (not 403) on a miss so a habit's existence is not leaked across users.
  private async assertOwned(userId: string, habitId: string): Promise<void> {
    const habit = await this.prisma.habit.findFirst({
      where: { id: habitId, userId },
      select: { id: true },
    });
    if (!habit) throw new NotFoundException('Habit not found');
  }
}
