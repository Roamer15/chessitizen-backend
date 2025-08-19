import { IsIn, IsOptional, IsString } from 'class-validator';

export class StartGameDto {
  @IsString()
  @IsOptional()
  @IsIn(['white', 'black'])
  userColor?: 'white' | 'black';

  @IsString()
  @IsOptional()
  aiDifficulty?: string;
}
