import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Color } from 'src/shared/enum/game.enum';

export class StartGameDto {
  @IsString()
  @IsOptional()
  @IsEnum(Color)
  userColor?: 'white' | 'black';

  @IsString()
  @IsOptional()
  aiDifficulty?: string;
}
