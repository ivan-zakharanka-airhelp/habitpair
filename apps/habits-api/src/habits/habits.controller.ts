import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/jwt-payload';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CreateHabitDto } from './dto/create-habit.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';
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

  // Range-based (?from=YYYY-MM&to=YYYY-MM) so the multi-month view loads in one
  // request. `today` is the client's local day (see CalendarQueryDto).
  @Get(':habitId/calendar')
  calendar(
    @Req() req: AuthenticatedRequest,
    @Param('habitId') habitId: string,
    @Query() query: CalendarQueryDto,
  ) {
    return this.habitsService.getCalendar(req.user.sub, habitId, query.from, query.to, query.today);
  }

  // As-of-today + all-history insight metrics (streak, rolling %, recent
  // completion, top-10 best streaks). Computed on read; `today` is the client's
  // local day (see MetricsQueryDto).
  @Get(':habitId/metrics')
  metrics(
    @Req() req: AuthenticatedRequest,
    @Param('habitId') habitId: string,
    @Query() query: MetricsQueryDto,
  ) {
    return this.habitsService.getMetrics(req.user.sub, habitId, query.today);
  }
}
