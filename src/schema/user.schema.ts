import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, unique: false, index: true, sparse: true })
  username: string;

  @Prop({ select: false })
  otpSecret?: string;

  @Prop()
  lastOtpSent?: Date;

  @Prop({ default: false })
  verified: boolean;

  @Prop({
    type: {
      wins: { ai: Number, human: Number },
      losses: { ai: Number, human: Number },
      draws: Number,
      rating: Number,
      highestRating: Number,
      streak: Number,
    },
    default: {
      wins: { ai: 0, human: 0 },
      losses: { ai: 0, human: 0 },
      draws: 0,
      rating: 800,
      highestRating: 800,
      streak: 0,
    },
  })
  stats: Record<string, any>;
}

export const UserSchema = SchemaFactory.createForClass(User);
