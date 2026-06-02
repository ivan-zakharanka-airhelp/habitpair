import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator';
import { HabitFrequency, HabitModality } from '../../../generated/prisma';

export class CreateHabitDto {
  // Trim before validation so a whitespace-only name fails @IsNotEmpty.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(HabitModality)
  modality!: HabitModality;

  @IsEnum(HabitFrequency)
  frequency!: HabitFrequency;

  // Required for weekly/monthly, absent for daily. The service forces it to
  // null for daily regardless of what arrives here.
  @ValidateIf((o: CreateHabitDto) => o.frequency !== HabitFrequency.DAILY)
  @IsInt()
  @Min(1)
  targetCount?: number;
}
