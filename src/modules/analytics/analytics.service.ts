import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorCode } from 'src/common/errors/error-codes.enum';
import { throwHttpError } from 'src/common/errors/http-exception.helper';
import { LoggerService } from 'src/logger/logger.service';
import { User } from 'src/schema/user.schema';

interface UserStats {
  wins?: {
    ai?: number;
    human?: number;
  };
  losses?: {
    ai?: number;
    human?: number;
  };
  draws?: number;
  rating?: number;
  highestRating?: number;
  streak?: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly logger: LoggerService,
  ) {}
  async getUserStats(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throwHttpError(ErrorCode.USER_NOT_FOUND);

    const stats: UserStats = user.stats || {};

    const winsAi = stats.wins?.ai || 0;
    const winsHuman = stats.wins?.human || 0;
    const lossesAi = stats.losses?.ai || 0;
    const lossesHuman = stats.losses?.human || 0;

    const draws = stats.draws || 0;
    const totalGames = winsAi + winsHuman + lossesAi + lossesHuman + draws;
    const totalWins = winsAi + winsHuman;
    const totalLosses = lossesAi + lossesHuman;

    const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

    return {
      username: user.username,
      email: user.email,
      overview: {
        rating: stats.rating,
        highestRating: stats.highestRating,
        streak: stats.streak,
        totalGames,
        totalWins,
        totalLosses,
        draws,
        winRate: winRate.toFixed(2),
      },
      distribution: {
        ai: {
          wins: winsAi,
          losses: lossesAi,
        },
        human: {
          wins: winsHuman,
          losses: lossesHuman,
        },
        draws,
      },
    };
  }

  async getLeaderboard() {
    const players = await this.userModel
      .find({})
      .sort({ 'stats.rating': -1 })
      .limit(20)
      .select('username email stats.rating stats.highestRating stats.wins stats.losses stats.draws')
      .lean();

    return players.map((p, index) => {
      const stats: UserStats = p.stats;
      const wins = (stats.wins?.ai || 0) + (stats.wins?.human || 0);
      const losses = (stats.losses?.ai || 0) + (stats.losses?.human || 0);
      const draws = stats.draws || 0;
      const totalGames = wins + losses + draws;
      const winRate = (wins / totalGames) * 100;
      const rating = stats.rating ?? 800;
      const highestRating = stats.highestRating ?? 800;

      return {
        rank: index + 1,
        username: p.username,
        rating,
        highestRating,
        totalGames,
        wins,
        winRate,
      };
    });
  }

  async updateProfile(userId: string, updates: { username?: string; avatarUrl?: string }) {
    const user = await this.userModel.findById(userId);
    if (!user) throwHttpError(ErrorCode.USER_NOT_FOUND);

    if (updates.username) {
      user.username = updates.username;
    }

    if (updates.avatarUrl) {
      user.avatarUrl = updates.avatarUrl;
    }

    await user.save();

    return {
      message: 'Profile updated sucessfully',
      user: {
        username: user.username,
        email: user.email,
        stats: user.stats,
      },
    };
  }
}
