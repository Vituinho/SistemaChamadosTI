import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(1, 80)
  username!: string;

  /** Never trimmed: spaces are significant in passwords. */
  @IsString()
  @Length(1, 256)
  password!: string;
}
