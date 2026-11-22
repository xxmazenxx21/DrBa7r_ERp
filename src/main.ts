import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { AppValidationPipe } from './pipes/app-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // whitelist + forbidNonWhitelisted + transform; errors get code VALIDATION_FAILED
  app.useGlobalPipes(new AppValidationPipe());
  // Order matters: the catch-all filter first, the specific Prisma one last,
  // so Prisma errors reach PrismaExceptionFilter.
  app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
