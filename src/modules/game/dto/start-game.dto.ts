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

  // Add a new property to indicate if the game is for multiplayer
  @Transform(({ value }) => (value ?? false) as boolean)
  @IsOptional()
  @IsBoolean()
  isMultiplayer?: boolean;

  // You might also want to add a way for players to specify a room ID
  @IsOptional()
  roomId?: string;
}
