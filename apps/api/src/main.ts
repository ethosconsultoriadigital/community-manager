import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function corsOriginsFromEnv(): string[] {
  const primary = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const origins = new Set<string>([primary]);
  try {
    const u = new URL(primary);
    if (u.hostname.startsWith('www.')) {
      origins.add(`${u.protocol}//${u.hostname.slice(4)}`);
    } else if (u.hostname.includes('.')) {
      origins.add(`${u.protocol}//www.${u.hostname}`);
    }
  } catch {
    /* ignore */
  }
  return [...origins];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origins = corsOriginsFromEnv();
  app.enableCors({
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  });
  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port} (CORS: ${origins.join(', ')})`);
}

bootstrap();
