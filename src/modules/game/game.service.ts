import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoggerService } from 'src/logger/logger.service';
import { Game } from 'src/schema/game.schema';
import { User } from 'src/schema/user.schema';
import { StartGameDto } from './dto/start-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';
import { throwHttpError } from 'src/common/errors/http-exception.helper';
import { ErrorCode } from 'src/common/errors/error-codes.enum';
import { GameStatus, ResultReason, Winner } from 'src/shared/enum/game.enum';
import { Chess } from 'chess.js';
import { AiService } from 'src/ai/ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameGateway } from 'src/gateway/game.gateway';

interface SkillSet {
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

  /** ----------------- GAME FETCHERS ----------------- */
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

  /** ----------------- GAME OVER HANDLING ----------------- */
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

  /** ----------------- AI ----------------- */
  getAiSkillLevel(aiDifficulty: string): SkillSet {
    switch (aiDifficulty) {
      case 'easy': return { skillLevel: 3, depth: 6 };
      case 'medium': return { skillLevel: 7, depth: 1 };
      case 'hard': return { skillLevel: 12, depth: 12 };
      case 'expert': return { skillLevel: 16, depth: 15 };
      case 'grandmaster': return { skillLevel: 20, depth: 18 };
      default: return { skillLevel: 7, depth: 9 };
    }
  }

  /** ----------------- GAME START / CREATE ----------------- */
  async startGame(userId: string, dto: StartGameDto): Promise<Game> {
    this.logger.log(`Game starting for ${userId} with props: ${JSON.stringify(dto)}`);

    // Multiplayer game
    if (dto.isMultiplayer) {
      const isWhite = Math.random() < 0.5;
      const game = new this.gameModel({
        whitePlayer: isWhite ? new Types.ObjectId(userId) : null,
        blackPlayer: !isWhite ? new Types.ObjectId(userId) : null,
        vsAI: false,
        isMultiplayer: true,
        gameStatus: GameStatus.WAITING,
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      });
      return game.save();
    }

    // AI game
    const color = dto.userColor ?? 'white';
    const ai = dto.vsAI ?? true;
    const game = new this.gameModel({
      whitePlayer: color === 'white' ? new Types.ObjectId(userId) : null,
      blackPlayer: color === 'black' ? new Types.ObjectId(userId) : null,
      vsAI: ai,
      userColor: color,
      aiDifficulty: dto.aiDifficulty,
      isMultiplayer: false,
      gameStatus: GameStatus.ONGOING,
      currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    });
    return game.save();
  }

  /** ----------------- MULTIPLAYER AUTO-JOIN ----------------- */
  async findWaitingGame(): Promise<Game | null> {
    return this.gameModel.findOne({
      isMultiplayer: true,
      gameStatus: GameStatus.WAITING,
      blackPlayer: null,
    });
  }

  async autoJoinOrCreate(userId: string): Promise<Game> {
    let game = await this.findWaitingGame();

    if (!game) {
      // No waiting game → create new one
      game = new this.gameModel({
        whitePlayer: new Types.ObjectId(userId),
        blackPlayer: null,
        isMultiplayer: true,
        vsAI: false,
        gameStatus: GameStatus.WAITING,
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      });
      return game.save();
    }

    // Join the waiting game as blackPlayer
    game.blackPlayer = new Types.ObjectId(userId);
    game.gameStatus = GameStatus.ONGOING;
    await game.save();

    // Notify both players
    this.emitGameStart(game._id.toString(), game);

    return game;
  }

  /** ----------------- JOIN EXISTING GAME ----------------- */
  async joinGame(gameId: string, userId: string): Promise<Game> {
    const game = await this.getGame(gameId);

    if (!game.isMultiplayer) throwHttpError(ErrorCode.GAME_INVALID);

    const whiteId = game.whitePlayer?.toString();
    const blackId = game.blackPlayer?.toString();

    if (whiteId && blackId) {
      return this.startGame(userId, { isMultiplayer: true });
    }

    if (whiteId === userId || blackId === userId) throwHttpError(ErrorCode.GAME_INVALID);

    if (!whiteId) game.whitePlayer = new Types.ObjectId(userId);
    else game.blackPlayer = new Types.ObjectId(userId);

    if (game.whitePlayer && game.blackPlayer) game.gameStatus = GameStatus.ONGOING;

    return game.save();
  }

  /** ----------------- MOVES ----------------- */
 private gameLocks: Record<string, boolean> = {};

async makeMove(gameId: string, userId: string, dto: MakeMoveDto) {
  while (this.gameLocks[gameId]) {
    await new Promise(res => setTimeout(res, 5));
  }
  this.gameLocks[gameId] = true;

  try {
    const { from, to, promotion } = dto;
    const game = await this.getGame(gameId);

    if (game.gameStatus !== GameStatus.ONGOING) throwHttpError(ErrorCode.GAME_INVALID);

    const chess = new Chess(game.currentFen);
    const turnColor = chess.turn() === 'w' ? 'whitePlayer' : 'blackPlayer';

    if (game[turnColor]?.toString() !== userId) throwHttpError(ErrorCode.NOT_YOUR_TURN);

    const move = chess.move({ from, to, promotion });
    if (!move) throwHttpError(ErrorCode.INVALID_MOVE);

    game.currentFen = chess.fen();
    game.moves.push({ from, to, fen: chess.fen(), san: move.san });

    if (chess.isGameOver()) {
      return this.handleGameOver(game, chess, turnColor === 'whitePlayer' ? Winner.WHITE : Winner.BLACK);
    }

    if (game.vsAI) {
      this.eventEmitter.emit('game.aiMove', {
        gameId: game._id,
        fen: game.currentFen,
        difficulty: game.aiDifficulty,
      });
    }

    const savedGame = await game.save();
    this.broadcastGameUpdate(savedGame);
    return savedGame;
  } finally {
    this.gameLocks[gameId] = false;
  }
}


  /** ----------------- GAME UTILS ----------------- */
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
    game.currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    game.moves = [];
    game.gameStatus = GameStatus.ONGOING;
    const savedGame = await game.save();
    this.broadcastGameUpdate(savedGame);
    return savedGame;
  }

  async undoMove(gameId: string, userId: string): Promise<Game> {
    const game = await this.getGame(gameId);
    if (game.gameStatus !== GameStatus.ONGOING) throwHttpError(ErrorCode.GAME_INVALID);
    if (game.moves.length === 0) throwHttpError(ErrorCode.INVALID_MOVE);

    const chess = new Chess(game.currentFen);
    const lastMove = game.moves.pop();
    const lastTurnColor = chess.turn() === 'w' ? 'blackPlayer' : 'whitePlayer';

    if (game[lastTurnColor]?.toString() !== userId) throwHttpError(ErrorCode.NO_MOVES_TO_UNDO);

    game.currentFen = game.moves.length > 0 ? game.moves[game.moves.length - 1].fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const savedGame = await game.save();
    this.broadcastGameUpdate(savedGame);
    return savedGame;
  }

  broadcastGameUpdate(game: Game) {
    const payload = {
      gameId: game._id,
      fen: game.currentFen,
      moves: game.moves,
      status: game.gameStatus,
    };
    this.gameGateway.emitGameUpdate(game._id.toString(), payload);
  }

  emitGameStart(gameId: string, game: Game) {
    this.gameGateway.server.to(gameId).emit('gameStarted', game);
  }
}
