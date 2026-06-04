import { NotFoundException } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { formatDateOnly, parseDateOnly } from '../marks/period';
import { HabitFrequency, HabitModality, MarkStatus } from '../../generated/prisma';

type HabitRow = {
  id: string;
  userId: string;
  name: string;
  modality: HabitModality;
  frequency: HabitFrequency;
  targetCount: number | null;
  createdAt: Date;
};

function habit(overrides: Partial<HabitRow> = {}): HabitRow {
  return {
    id: 'h1',
    userId: 'u1',
    name: 'Read',
    modality: HabitModality.POSITIVE,
    frequency: HabitFrequency.DAILY,
    targetCount: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('HabitsService', () => {
  const prismaMock = {
    habit: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    mark: { findUnique: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  };
  let service: HabitsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HabitsService(prismaMock as unknown as PrismaService);
    prismaMock.mark.findUnique.mockResolvedValue(null);
    prismaMock.mark.count.mockResolvedValue(0);
    prismaMock.mark.findFirst.mockResolvedValue(null);
    prismaMock.mark.findMany.mockResolvedValue([]);
    prismaMock.habit.findFirst.mockResolvedValue(null);
  });

  describe('findByUser — per-user isolation', () => {
    it('scopes the habit query to the caller', async () => {
      prismaMock.habit.findMany.mockResolvedValue([]);
      await service.findByUser('user-1', '2026-06-03');
      expect(prismaMock.habit.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('scopes every mark query to the habit id from the caller list', async () => {
      prismaMock.habit.findMany.mockResolvedValue([habit({ id: 'mine' })]);
      await service.findByUser('user-1', '2026-06-03');
      expect(prismaMock.mark.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ habitId: 'mine' }) }),
      );
      expect(prismaMock.mark.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { habitId_date: expect.objectContaining({ habitId: 'mine' }) },
        }),
      );
    });
  });

  describe('findByUser — current-period progress', () => {
    it('daily period is [today, today] with implicit target 1', async () => {
      prismaMock.habit.findMany.mockResolvedValue([habit({ frequency: HabitFrequency.DAILY })]);
      prismaMock.mark.count.mockResolvedValue(1);
      prismaMock.mark.findUnique.mockResolvedValue({ status: MarkStatus.COMPLETED });

      const [row] = await service.findByUser('u1', '2026-06-03');

      const args = prismaMock.mark.count.mock.calls[0][0];
      expect(formatDateOnly(args.where.date.gte)).toBe('2026-06-03');
      expect(formatDateOnly(args.where.date.lte)).toBe('2026-06-03');
      expect(row.todayStatus).toBe(MarkStatus.COMPLETED);
      expect(row.currentPeriod).toEqual({
        kind: HabitFrequency.DAILY,
        completedCount: 1,
        target: 1,
      });
    });

    it('weekly period starts on the ISO Monday of today', async () => {
      prismaMock.habit.findMany.mockResolvedValue([
        habit({ frequency: HabitFrequency.WEEKLY, targetCount: 2 }),
      ]);
      prismaMock.mark.count.mockResolvedValue(1);

      const [row] = await service.findByUser('u1', '2026-06-03'); // Wednesday

      const args = prismaMock.mark.count.mock.calls[0][0];
      expect(formatDateOnly(args.where.date.gte)).toBe('2026-06-01'); // Monday
      expect(formatDateOnly(args.where.date.lte)).toBe('2026-06-03');
      expect(args.where.status).toBe(MarkStatus.COMPLETED);
      expect(row.currentPeriod).toEqual({
        kind: HabitFrequency.WEEKLY,
        completedCount: 1,
        target: 2,
      });
      expect(row.todayStatus).toBeNull();
    });

    it('weekly period for a Sunday still starts on the prior Monday (ISO week)', async () => {
      prismaMock.habit.findMany.mockResolvedValue([
        habit({ frequency: HabitFrequency.WEEKLY, targetCount: 3 }),
      ]);

      await service.findByUser('u1', '2026-06-07'); // Sunday

      const args = prismaMock.mark.count.mock.calls[0][0];
      expect(formatDateOnly(args.where.date.gte)).toBe('2026-06-01');
      expect(formatDateOnly(args.where.date.lte)).toBe('2026-06-07');
    });

    it('monthly period starts on the first of the month', async () => {
      prismaMock.habit.findMany.mockResolvedValue([
        habit({ frequency: HabitFrequency.MONTHLY, targetCount: 10 }),
      ]);
      prismaMock.mark.count.mockResolvedValue(4);

      const [row] = await service.findByUser('u1', '2026-06-15');

      const args = prismaMock.mark.count.mock.calls[0][0];
      expect(formatDateOnly(args.where.date.gte)).toBe('2026-06-01');
      expect(formatDateOnly(args.where.date.lte)).toBe('2026-06-15');
      expect(row.currentPeriod).toEqual({
        kind: HabitFrequency.MONTHLY,
        completedCount: 4,
        target: 10,
      });
    });
  });

  describe('create — target normalization', () => {
    it('forces targetCount to null for a daily habit even if one is supplied', async () => {
      prismaMock.habit.create.mockResolvedValue({});
      const dto: CreateHabitDto = {
        name: 'Read',
        modality: HabitModality.POSITIVE,
        frequency: HabitFrequency.DAILY,
        targetCount: 5,
      };

      await service.create('u1', dto);

      expect(prismaMock.habit.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          name: 'Read',
          modality: HabitModality.POSITIVE,
          frequency: HabitFrequency.DAILY,
          targetCount: null,
        },
      });
    });

    it('persists the provided targetCount for weekly/monthly habits', async () => {
      prismaMock.habit.create.mockResolvedValue({});
      const dto: CreateHabitDto = {
        name: 'Gym',
        modality: HabitModality.POSITIVE,
        frequency: HabitFrequency.WEEKLY,
        targetCount: 3,
      };

      await service.create('u1', dto);

      expect(prismaMock.habit.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          name: 'Gym',
          modality: HabitModality.POSITIVE,
          frequency: HabitFrequency.WEEKLY,
          targetCount: 3,
        },
      });
    });
  });

  describe('getCalendar', () => {
    const ownDaily = () => prismaMock.habit.findFirst.mockResolvedValue(habit());

    it('throws NotFound (not 403) when the habit is not owned by the caller', async () => {
      prismaMock.habit.findFirst.mockResolvedValue(null);

      await expect(
        service.getCalendar('intruder', 'h1', '2026-06', '2026-06', '2026-06-15'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.habit.findFirst).toHaveBeenCalledWith({
        where: { id: 'h1', userId: 'intruder' },
      });
    });

    it('selects the earliest mark as the anchor', async () => {
      ownDaily();
      prismaMock.mark.findFirst.mockResolvedValue({ date: parseDateOnly('2026-06-10') });

      const res = await service.getCalendar('u1', 'h1', '2026-06', '2026-06', '2026-06-15');

      expect(prismaMock.mark.findFirst).toHaveBeenCalledWith({
        where: { habitId: 'h1' },
        orderBy: { date: 'asc' },
        select: { date: true },
      });
      expect(res.firstMarkDate).toBe('2026-06-10');
    });

    it('queries marks over the ISO-week-aligned span bounds', async () => {
      ownDaily();

      await service.getCalendar('u1', 'h1', '2026-06', '2026-06', '2026-06-15');

      const args = prismaMock.mark.findMany.mock.calls[0][0];
      expect(args.where.habitId).toBe('h1');
      expect(formatDateOnly(args.where.date.gte)).toBe('2026-06-01'); // Mon Jun 1
      expect(formatDateOnly(args.where.date.lte)).toBe('2026-07-05'); // Sun after Jun 30
    });

    it('assembles a daily read-model: stored marks + computed misses, no failed periods', async () => {
      ownDaily();
      prismaMock.mark.findFirst.mockResolvedValue({ date: parseDateOnly('2026-06-10') });
      prismaMock.mark.findMany.mockResolvedValue([
        { date: parseDateOnly('2026-06-10'), status: MarkStatus.COMPLETED },
        { date: parseDateOnly('2026-06-12'), status: MarkStatus.MISSED },
      ]);

      const res = await service.getCalendar('u1', 'h1', '2026-06', '2026-06', '2026-06-15');

      expect(res.habit).toEqual({
        id: 'h1',
        name: 'Read',
        modality: HabitModality.POSITIVE,
        frequency: HabitFrequency.DAILY,
        targetCount: null,
      });
      expect(res.marks).toEqual({
        '2026-06-10': MarkStatus.COMPLETED,
        '2026-06-12': MarkStatus.MISSED,
      });
      expect(res.computedMissedDates).toEqual(['2026-06-11', '2026-06-13', '2026-06-14']);
      expect(res.failedPeriods).toEqual([]);
    });

    it('assembles a weekly read-model: failed closed periods, no computed misses', async () => {
      prismaMock.habit.findFirst.mockResolvedValue(
        habit({ frequency: HabitFrequency.WEEKLY, targetCount: 2 }),
      );
      prismaMock.mark.findFirst.mockResolvedValue({ date: parseDateOnly('2026-06-01') });
      prismaMock.mark.findMany.mockResolvedValue([
        { date: parseDateOnly('2026-06-01'), status: MarkStatus.COMPLETED },
        { date: parseDateOnly('2026-06-02'), status: MarkStatus.COMPLETED },
        { date: parseDateOnly('2026-06-08'), status: MarkStatus.COMPLETED },
      ]);

      const res = await service.getCalendar('u1', 'h1', '2026-06', '2026-06', '2026-06-15');

      expect(res.computedMissedDates).toEqual([]);
      expect(res.failedPeriods).toEqual([
        { start: '2026-06-08', end: '2026-06-14', completedCount: 1, target: 2 },
      ]);
    });

    it('returns a neutral read-model for a zero-mark habit (null anchor)', async () => {
      ownDaily();
      prismaMock.mark.findFirst.mockResolvedValue(null);
      prismaMock.mark.findMany.mockResolvedValue([]);

      const res = await service.getCalendar('u1', 'h1', '2026-06', '2026-06', '2026-06-15');

      expect(res.firstMarkDate).toBeNull();
      expect(res.marks).toEqual({});
      expect(res.computedMissedDates).toEqual([]);
      expect(res.failedPeriods).toEqual([]);
    });
  });
});
