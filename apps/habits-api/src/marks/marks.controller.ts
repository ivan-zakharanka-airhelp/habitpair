import { Body, Controller, Delete, HttpCode, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/jwt-payload';
import { UpdateMarkDto } from './dto/update-mark.dto';
import { MarksService } from './marks.service';

// Global prefix `habits` + controller path `:habitId/marks` resolves to
// /habits/:habitId/marks/:date — the addressable per-day mark resource.
// `:date` is the client's local calendar date (YYYY-MM-DD); the service
// validates it via parseDateOnly (bad format → 400).
@Controller(':habitId/marks')
@UseGuards(JwtGuard)
export class MarksController {
  constructor(private readonly marksService: MarksService) {}

  @Put(':date')
  upsert(
    @Req() req: AuthenticatedRequest,
    @Param('habitId') habitId: string,
    @Param('date') date: string,
    @Body() dto: UpdateMarkDto,
  ) {
    return this.marksService.upsert(req.user.sub, habitId, date, dto.status);
  }

  @Delete(':date')
  @HttpCode(204)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('habitId') habitId: string,
    @Param('date') date: string,
  ) {
    return this.marksService.remove(req.user.sub, habitId, date);
  }
}
