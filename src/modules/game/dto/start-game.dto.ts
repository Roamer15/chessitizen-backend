import { IsIn, IsString } from 'class-validator';

export class StartGameDto {
  @IsString()
  @IsIn(['white', 'black'])
  userColor?: 'white' | 'black';

  @IsString()
  aiDifficulty?: string;
}
