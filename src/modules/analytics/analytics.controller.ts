import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}
  @Get(':id/stats')
  async getUserStats(@Param('id') id: string) {
    return this.analyticsService.getUserStats(id);
  }

  @Get('leaderboard')
  async getLeaderboard() {
    return this.analyticsService.getLeaderboard();
  }
}
