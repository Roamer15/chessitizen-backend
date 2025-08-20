import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoggerService } from 'src/logger/logger.service';
import { Game } from 'src/schema/game.schema';
import { StartGameDto } from './dto/start-game.dto';
import { throwHttpError } from 'src/common/errors/http-exception.helper';
import { ErrorCode } from 'src/common/errors/error-codes.enum';
import { MakeMoveDto } from './dto/make-move.dto';
import { GameStatus, ResultReason, Winner } from 'src/shared/enum/game.enum';
import { Chess } from 'chess.js';
import { User } from 'src/schema/user.schema';

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name) private gameModel: Model<Game>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly logger: LoggerService,
  ) {}

  async startGame(userId: string, dto: StartGameDto): Promise<Game> {
    const color = dto.userColor;
    const game = new this.gameModel({
      userId: new Types.ObjectId(userId),
      userColor: color,
      aiDifficulty: dto.aiDifficulty,
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    });
    // this.logger.log(game.save());
    return await game.save();
  }

  async getGame(gameId: string): Promise<Game> {
    const game = await this.gameModel.findById(gameId);
    if (!game) throwHttpError(ErrorCode.GAME_NOT_FOUND);
    return game;
  }

  async getPlayer(userId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) throwHttpError(ErrorCode.USER_NOT_FOUND);
    return user;
  }

  async makeMove(gameId: string, userId: string, dto: MakeMoveDto) {
    const { from, to } = dto;
    const game = await this.getGame(gameId);
    // const user = await this.getPlayer(userId);
    if (game.gameStatus !== GameStatus.ONGOING) {
      throwHttpError(ErrorCode.GAME_INVALID);
    }

    if (game.userId.toString() !== userId.toString()) {
      throwHttpError(ErrorCode.NOT_YOUR_GAME);
    }

    const chess = new Chess(game.currentFen);

    const move = chess.move({ from, to, promotion: dto.promotion });

    if (!move) {
      throwHttpError(ErrorCode.INVALID_MOVE);
    }

    game.currentFen = chess.fen();
    game.moves.push({
      from,
      to,
      fen: chess.fen(),
      san: move.san,
    });

    if (chess.isGameOver()) {
      game.gameStatus = GameStatus.ENDED;
      game.endedAt = new Date();

      if (chess.isCheckmate()) {
        game.result = { outcome: ResultReason.CHECKMATE, winner: Winner.HUMAN };
      } else if (chess.isDraw()) {
        let outcome = ResultReason.DRAW_50;
        if (chess.isStalemate()) outcome = ResultReason.STALEMATE;
        else if (chess.isInsufficientMaterial()) outcome = ResultReason.INSUFFICIENT_MATERIAL;
        else if (chess.isThreefoldRepetition()) outcome = ResultReason.THREEFOLD_REPETITION;
        game.result = { outcome, winner: Winner.UNDECICED };
      }
    }

    return game.save();
  }

  async endGame(gameId: string, reason: ResultReason, winner: Winner): Promise<Game> {
    const game = await this.getGame(gameId);

    game.gameStatus = GameStatus.ENDED;
    game.endedAt = new Date();
    game.result = { outcome: reason, winner };

    return game.save();
  }
}
