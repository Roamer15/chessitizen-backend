import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { LoggerService } from 'src/logger/logger.service';
import { Game } from 'src/schema/game.schema';
import { StartGameDto } from './dto/start-game.dto';
import { throwHttpError } from 'src/common/errors/http-exception.helper';
import { ErrorCode } from 'src/common/errors/error-codes.enum';
import { MakeMoveDto } from './dto/make-move.dto';
import { Color, GameStatus, ResultReason, Winner } from 'src/shared/enum/game.enum';
import { Chess } from 'chess.js';
import { User } from 'src/schema/user.schema';
import { AiService } from 'src/ai/ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameGateway } from 'src/gateway/game.gateway';

interface skillSet {
  skillLevel: number;
  depth: number;
}

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name) private gameModel: Model<Game>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly logger: LoggerService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
    private readonly gameGateway: GameGateway,
  ) {}

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

  handleGameOver(game: Game, chess: Chess, winner: Winner) {
    game.gameStatus = GameStatus.ENDED;
    game.endedAt = new Date();

    if (chess.isCheckmate()) {
      game.result = { outcome: ResultReason.CHECKMATE, winner };
    } else if (chess.isDraw()) {
      let outcome = ResultReason.DRAW_50;
      if (chess.isStalemate()) outcome = ResultReason.STALEMATE;
      else if (chess.isInsufficientMaterial()) outcome = ResultReason.INSUFFICIENT_MATERIAL;
      else if (chess.isThreefoldRepetition()) outcome = ResultReason.THREEFOLD_REPETITION;
      else if (chess.isDrawByFiftyMoves()) outcome = ResultReason.DRAW_50;
      game.result = { outcome, winner: Winner.UNDECICED };
    }

    return game.save();
  }

  getAiSkillLevel(aiDifficulty: string) {
    let opts: skillSet;
    switch (aiDifficulty) {
      case 'easy':
        opts = { skillLevel: 3, depth: 6 };
        break;
      case 'medium':
        opts = { skillLevel: 7, depth: 1 };
        break;
      case 'hard':
        opts = { skillLevel: 12, depth: 12 };
        break;
      case 'expert':
        opts = { skillLevel: 16, depth: 15 };
        break;
      case 'grandmaster':
        opts = { skillLevel: 20, depth: 18 };
        break;
      default:
        opts = { skillLevel: 7, depth: 9 };
        break;
    }
    return opts;
  }

  async startGame(userId: string, dto: StartGameDto): Promise<Game> {
    this.logger.log(`Game starting for ${userId} with props: ${dto.vsAI}`);
    const color = dto.userColor ?? 'white';
    const ai = dto.vsAI ?? true;
    const game = new this.gameModel({
      whitePlayer: color === 'white' ? new Types.ObjectId(userId) : null,
      blackPlayer: color === 'black' ? new Types.ObjectId(userId) : null,
      vsAI: ai,
      userColor: color,
      aiDifficulty: dto.aiDifficulty,
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    });
    // this.logger.log(game.save());
    return await game.save();
  }

  async makeMove(gameId: string, userId: string, dto: MakeMoveDto) {
    const { from, to, promotion } = dto;
    const game = await this.getGame(gameId);

    // const user = await this.getPlayer(userId);
    if (game.gameStatus !== GameStatus.ONGOING) {
      throwHttpError(ErrorCode.GAME_INVALID);
    }

    const chess = new Chess(game.currentFen);

    const turnColor = chess.turn() === 'w' ? 'whitePlayer' : 'blackPlayer';
    if (game[turnColor]?.toString() !== userId.toString()) {
      throwHttpError(ErrorCode.NOT_YOUR_TURN);
    }

    const move = chess.move({ from, to, promotion });
    if (!move) throwHttpError(ErrorCode.INVALID_MOVE);

    game.currentFen = chess.fen();
    game.moves.push({ from, to, fen: chess.fen(), san: move.san });

    if (chess.isGameOver()) {
      return this.handleGameOver(
        game,
        chess,
        turnColor === 'whitePlayer' ? Winner.WHITE : Winner.BLACK,
      );
    }

    if (game.vsAI) {
      this.eventEmitter.emit('game.aiMove', {
        gameId: game._id,
        fen: game.currentFen,
        difficulty: game.aiDifficulty,
      });
    }

    return game.save();
  }

  async endGame(gameId: string, reason: ResultReason, winner: Winner): Promise<Game> {
    const game = await this.getGame(gameId);
    game.gameStatus = GameStatus.ENDED;
    game.endedAt = new Date();
    game.result = { outcome: reason, winner };
    this.logger.log(`Ending game with reason: ${reason} and winner ${winner}`);
    return game.save();
  }

  async resetBoard(gameId: string): Promise<Game> {
    const game = await this.getGame(gameId);

    // Reset to starting position FEN
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // Update game state
    game.currentFen = startingFen;
    game.moves = []; // Clear all moves
    game.gameStatus = GameStatus.ONGOING;

    // Save and broadcast the reset
    const savedGame = await game.save();
    this.broadcastGameUpdate(savedGame);

    return savedGame;
  }
  async undoMove(gameId: string, userId: string): Promise<Game> {
    try {
      const game = await this.getGame(gameId);

      // (1) Require game.vsAI to be true before allowing undo
      if (!game.vsAI) {
        throwHttpError(ErrorCode.UNDO_NOT_ALLOWED);
      }

      if (game.gameStatus !== GameStatus.ONGOING) {
        throwHttpError(ErrorCode.GAME_INVALID);
      }

      // Check if there are moves to undo
      if (game.moves.length < 2) {
        throwHttpError(ErrorCode.NO_MOVES_TO_UNDO);
      }

      // (2) Determine the human player based on game.userColor
      let humanPlayerId: string | undefined;
      if (game.userColor === Color.WHITE) {
        humanPlayerId = game.whitePlayer?.toString();
      } else if (game.userColor === Color.BLACK) {
        humanPlayerId = game.blackPlayer?.toString();
      }

      // (3) Compare derived player id to requesting userId
      if (humanPlayerId !== userId.toString()) {
        throwHttpError(ErrorCode.UNAUTHORIZED_MOVE);
      }

      game.moves.pop();
      game.moves.pop();

      // Reset FEN - need to recalculate based on remaining moves
      if (game.moves.length > 0) {
        const lastRemainingMove = game.moves[game.moves.length - 1];
        game.currentFen = lastRemainingMove.fen;
      } else {
        game.currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      }

      const savedGame = await game.save();
      this.broadcastGameUpdate(savedGame);

      return savedGame;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
  async getMoveHistory(gameId: string): Promise<Game> {
    if (!gameId || !isValidObjectId(gameId)) {
      this.logger.warn(`Invalid gameId provided: ${gameId}`);
      throw new BadRequestException('Invalid game ID format');
    }
    try {
      this.logger.debug(`Fetching move history for game: ${gameId}`);

      const game = await this.gameModel.findById(gameId).select('moves').lean().exec();

      if (!game) {
        this.logger.warn(`Game not found with ID: ${gameId}`);
        throwHttpError(ErrorCode.GAME_NOT_FOUND);
      }

      this.logger.debug(`Retrieved ${game.moves.length} moves for game: ${gameId}`);

      return game;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      this.logger.error(`Error fetching move history for game ${gameId}:`, error.stack);

      // Re-throw appropriate exceptions
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new Error('Failed to retrieve move history');
    }
  }

  broadcastGameUpdate(game: Game) {
    const payload = {
      gameId: game._id,
      fen: game.currentFen,
      moves: game.moves,
      status: game.gameStatus,
    };

    // emit to all clients in this game room
    this.gameGateway.emitGameUpdate(game._id.toString(), payload);
  }
}
