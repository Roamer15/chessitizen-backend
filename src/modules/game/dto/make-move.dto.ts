import { IsString, Length } from 'class-validator';

export class MakeMoveDto {
  @IsString()
  gameId: string;

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  @Length(1)
  promotion: string;
}
