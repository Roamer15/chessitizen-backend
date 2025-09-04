import { Transform } from 'class-transformer';
import { IsIn, IsMongoId, IsOptional, IsString, Length, Matches } from 'class-validator';

export class MakeMoveDto {
  @IsMongoId({ message: 'gameId must be a valid MongoDB ObjectId' })
  gameId: string;

  @IsString()
  @Matches(/^[a-h][1-8]$/i, { message: 'from must be a valid square (e.g., e2)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value) as string)
  from: string;

  @IsString()
  @Matches(/^[a-h][1-8]$/i, { message: 'to must be a valid square (e.g., e4)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value) as string)
  to: string;

  @IsOptional()
  @IsString()
  @Length(1)
  @IsIn(['q', 'r', 'b', 'n'])
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value) as string)
  promotion?: string;
}
