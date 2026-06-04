import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { HabitModality } from '../../../generated/prisma';

// Only name and modality are editable. frequency/targetCount are omitted on
// purpose: the global forbidNonWhitelisted pipe turns a body carrying them into
// a 400, enforcing their immutability at the boundary (historical marks are
// interpreted against them).
export class UpdateHabitDto {
  // Trim before validation so a whitespace-only name fails @IsNotEmpty.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(HabitModality)
  modality?: HabitModality;
}
