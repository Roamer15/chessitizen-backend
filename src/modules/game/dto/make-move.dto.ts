import { IsOptional, IsString, Length } from 'class-validator';

export class MakeMoveDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  @Length(1)
  @IsOptional()
  promotion: string;
}
