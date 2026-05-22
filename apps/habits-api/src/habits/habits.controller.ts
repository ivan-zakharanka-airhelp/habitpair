import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/jwt-payload';
import { HabitsService } from './habits.service';

// Global prefix `habits` is set in main.ts → this controller serves /habits
// (list/create), /habits/:id when added, etc.
@Controller()
@UseGuards(JwtGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.habitsService.findByUser(req.user.sub);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: { title?: string }) {
    const title = body?.title?.trim();
    if (!title) throw new BadRequestException('title is required');
    return this.habitsService.create(req.user.sub, title);
  }
}
