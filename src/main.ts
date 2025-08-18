import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from './logger/logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new LoggerService();
  const app = await NestFactory.create(AppModule, { logger });

  app.enableShutdownHooks();
  logger.log('Starting Chessitizen backend application...');

  //Register the global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  app.enableCors({
    origin: ['*'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.setGlobalPrefix('api'); // Prefix all routes with /api (e.g., /users becomes /api/users)

  // Apply ValidationPipe globallyapp.useGlobalPipes(

  // const disableErrorMessages: boolean = process.env.ERROR_STATE || false;

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Automatically transform incoming data into DTO instances (required for class-validator)
      whitelist: true, // Remove any properties that do not have decorators in the DTO
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted properties are found in the request
      disableErrorMessages: false, // Set to true in production to hide detailed error messages
    }),
  );

  const port = process.env.PORT || 3000;
  logger.log(`Starting on port: ${port}`);
  await app.listen(port);

  process.on('SIGTERM', () => {
    void (async () => {
      logger.log('SIGTERM signal received: closing application...');
      await app.close();
      logger.log('Application closed gracefully.');
      process.exit(0);
    })();
  });

  process.on('SIGINT', () => {
    void (async () => {
      logger.log('SIGINT signal received: closing application...');
      await app.close();
      logger.log('Application closed gracefully.');
    })();
  });
}

void bootstrap();
