import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/jwt-payload';
import { CreateHabitDto } from './dto/create-habit.dto';
import { HabitsService } from './habits.service';

// Global prefix `habits` is set in main.ts → this controller serves /habits
// (list/create). The client supplies its local `today` (YYYY-MM-DD) so the
// current period is computed against the user's calendar day, not the server's.
@Controller()
@UseGuards(JwtGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('today') today: string) {
    return this.habitsService.findByUser(req.user.sub, today);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateHabitDto) {
    return this.habitsService.create(req.user.sub, dto);
  }
}
