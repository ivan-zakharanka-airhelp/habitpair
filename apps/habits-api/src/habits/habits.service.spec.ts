import { HabitsService } from './habits.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { formatDateOnly } from '../marks/period';
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
    habit: { findMany: jest.fn(), create: jest.fn() },
    mark: { findUnique: jest.fn(), count: jest.fn() },
  };
  let service: HabitsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HabitsService(prismaMock as unknown as PrismaService);
    prismaMock.mark.findUnique.mockResolvedValue(null);
    prismaMock.mark.count.mockResolvedValue(0);
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
});
