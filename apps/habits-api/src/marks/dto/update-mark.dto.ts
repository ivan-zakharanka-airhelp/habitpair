import { IsEnum } from 'class-validator';
import { MarkStatus } from '../../../generated/prisma';

export class UpdateMarkDto {
  // S-01's UI only ever sends COMPLETED, but MISSED is accepted so S-02's
  // calendar can reuse this endpoint unchanged.
  @IsEnum(MarkStatus)
  status!: MarkStatus;
}
