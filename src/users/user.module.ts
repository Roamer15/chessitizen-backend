import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { models } from 'src/database';

@Module({
  imports: [MongooseModule.forFeature(models)],
  exports: [MongooseModule],
})
export class UserModule {}
