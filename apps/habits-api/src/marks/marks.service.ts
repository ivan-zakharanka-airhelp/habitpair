import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarkStatus } from '../../generated/prisma';
import { parseDateOnly } from './period';

@Injectable()
export class MarksService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, habitId: string, dateStr: string, status: MarkStatus) {
    await this.assertOwned(userId, habitId);
    const date = parseDateOnly(dateStr);
    // Keyed on the (habitId, date) compound unique, so a repeat PUT updates
    // the existing row rather than inserting a duplicate.
    return this.prisma.mark.upsert({
      where: { habitId_date: { habitId, date } },
      create: { habitId, date, status },
      update: { status },
    });
  }

  async remove(userId: string, habitId: string, dateStr: string): Promise<void> {
    await this.assertOwned(userId, habitId);
    const date = parseDateOnly(dateStr);
    // deleteMany (not delete) so unmarking an already-absent day is a no-op.
    await this.prisma.mark.deleteMany({ where: { habitId, date } });
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
