import { NotFoundException } from '@nestjs/common';
import { MarksService } from './marks.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatDateOnly } from './period';
import { MarkStatus } from '../../generated/prisma';

describe('MarksService', () => {
  const prismaMock = {
    habit: { findFirst: jest.fn() },
    mark: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  let service: MarksService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarksService(prismaMock as unknown as PrismaService);
    prismaMock.habit.findFirst.mockResolvedValue({ id: 'h1' });
    prismaMock.mark.upsert.mockResolvedValue({});
    prismaMock.mark.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('upsert — write contract', () => {
    it('stores the date verbatim — the key/create date round-trips with no TZ shift', async () => {
      await service.upsert('u1', 'h1', '2026-06-02', MarkStatus.COMPLETED);

      const args = prismaMock.mark.upsert.mock.calls[0][0];
      expect(args.where.habitId_date.habitId).toBe('h1');
      expect(formatDateOnly(args.where.habitId_date.date)).toBe('2026-06-02');
      expect(formatDateOnly(args.create.date)).toBe('2026-06-02');
      expect(args.create.status).toBe(MarkStatus.COMPLETED);
      expect(args.update).toEqual({ status: MarkStatus.COMPLETED });
    });

    it('writes through upsert keyed on the (habitId, date) unique so a repeat PUT updates rather than duplicates', async () => {
      await service.upsert('u1', 'h1', '2026-06-02', MarkStatus.COMPLETED);
      await service.upsert('u1', 'h1', '2026-06-02', MarkStatus.MISSED);

      expect(prismaMock.mark.upsert).toHaveBeenCalledTimes(2);
      const second = prismaMock.mark.upsert.mock.calls[1][0];
      expect(second.where.habitId_date.habitId).toBe('h1');
      expect(formatDateOnly(second.where.habitId_date.date)).toBe('2026-06-02');
      expect(second.update).toEqual({ status: MarkStatus.MISSED });
    });
  });

  describe('remove — idempotent unmark', () => {
    it('deletes by (habitId, date) via deleteMany so a second unmark is a no-op', async () => {
      prismaMock.mark.deleteMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.mark.deleteMany.mockResolvedValueOnce({ count: 0 });

      await service.remove('u1', 'h1', '2026-06-02');
      await expect(service.remove('u1', 'h1', '2026-06-02')).resolves.toBeUndefined();

      expect(prismaMock.mark.deleteMany).toHaveBeenCalledTimes(2);
      const args = prismaMock.mark.deleteMany.mock.calls[0][0];
      expect(args.where.habitId).toBe('h1');
      expect(formatDateOnly(args.where.date)).toBe('2026-06-02');
    });
  });

  describe('ownership isolation', () => {
    beforeEach(() => {
      prismaMock.habit.findFirst.mockResolvedValue(null);
    });

    it('scopes the ownership check to the caller userId', async () => {
      await expect(
        service.upsert('intruder', 'h1', '2026-06-02', MarkStatus.COMPLETED),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.habit.findFirst).toHaveBeenCalledWith({
        where: { id: 'h1', userId: 'intruder' },
        select: { id: true },
      });
    });

    it('upsert against a habit the caller does not own throws NotFound and writes nothing', async () => {
      await expect(
        service.upsert('intruder', 'h1', '2026-06-02', MarkStatus.COMPLETED),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.mark.upsert).not.toHaveBeenCalled();
    });

    it('remove against a habit the caller does not own throws NotFound and writes nothing', async () => {
      await expect(service.remove('intruder', 'h1', '2026-06-02')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.mark.deleteMany).not.toHaveBeenCalled();
    });
  });
});
