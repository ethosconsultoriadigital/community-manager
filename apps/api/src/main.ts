import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });
  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}`);
}

bootstrap();
