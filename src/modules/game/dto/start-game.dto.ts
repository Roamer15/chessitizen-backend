import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Color } from 'src/shared/enum/game.enum';

export class StartGameDto {
  @IsString()
  @IsOptional()
  @IsEnum(Color)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @Transform(({ value }) => value ?? 'white')
  userColor?: 'white' | 'black';

  @IsString()
  @IsOptional()
  aiDifficulty?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return true; // default
    }
    return value === 'true' || value === true;
  })
  vsAI?: boolean;
}
