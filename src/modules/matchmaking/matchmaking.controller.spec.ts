import { Test, TestingModule } from '@nestjs/testing';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';

describe('MatchmakingController', () => {
  let controller: MatchmakingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchmakingController],
      providers: [MatchmakingService],
    }).compile();

    controller = module.get<MatchmakingController>(MatchmakingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
