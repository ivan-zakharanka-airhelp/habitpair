import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // MaxLength bounds argon2 hashing cost; argon2 has no bcrypt-style 72-byte cap.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
