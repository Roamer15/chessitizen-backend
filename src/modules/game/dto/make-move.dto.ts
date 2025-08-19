import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class MakeMoveDto {
  @IsString()
  @Matches(/^[a-h][1-8]$/i, { message: 'from must be a valid square (e.g., e2)' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  from: string;

  @IsString()
  @Matches(/^[a-h][1-8]$/i, { message: 'to must be a valid square (e.g., e4)' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  to: string;

  @IsOptional()
  @IsString()
  @Length(1)
  @IsIn(['q', 'r', 'b', 'n'])
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  promotion?: string;
}
