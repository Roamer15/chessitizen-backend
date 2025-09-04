import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Color, GameLevel, GameStatus, ResultReason, Winner } from 'src/shared/enum/game.enum';

@Schema({
  timestamps: {
    createdAt: 'startedAt',
    updatedAt: false,
  },
})
export class Game extends Document {
  _id: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  whitePlayer: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  blackPlayer: Types.ObjectId;

  @Prop({ default: false })
  vsAI: boolean;

  @Prop({ required: true, enum: Object.values(Color), default: Color.WHITE })
  userColor: Color;

  @Prop({ required: true, default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' })
  currentFen: string;

  @Prop({ default: GameStatus.ONGOING, enum: Object.values(GameStatus) })
  gameStatus: GameStatus;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  players: Types.ObjectId[];

  @Prop({
    type: [
      {
        from: { type: String, required: true },
        to: { type: String, required: true },
        fen: { type: String, required: true },
        san: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  moves: Array<{
    from: string;
    to: string;
    fen: string;
    san?: string;
    timestamp?: Date;
  }>;

  @Prop()
  endedAt?: Date;

  @Prop({
    type: {
      outcome: { type: String, enum: Object.values(ResultReason), default: ResultReason.UNDECIDED },
      winner: { type: String, enum: Object.values(Winner), default: Winner.UNDECICED },
    },
    _id: false,
    default: { outcome: ResultReason.UNDECIDED, winner: Winner.UNDECICED },
  })
  result: { outcome: ResultReason; winner: Winner };

  @Prop({
    enum: Object.values(GameLevel),
    default: GameLevel.MEDIUM,
  })
  aiDifficulty: GameLevel;

  @Prop({ default: false })
  isMultiplayer: boolean;

  @Prop({ unique: true, sparse: true })
  inviteCode?: string;
}

export const GameSchema = SchemaFactory.createForClass(Game);
