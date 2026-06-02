import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { cookieParserMiddleware } from './bootstrap/cookie-parser.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { SnakeToCamelInterceptor } from './common/interceptors/snake-to-camel.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Proxy Render / Vercel — requis pour cookies Secure derrière reverse proxy
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // AVANT pipes, interceptors, guards et routes
  app.use(cookieParserMiddleware());

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(
    new SnakeToCamelInterceptor(),
    new ResponseInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  if (!process.env.FRONTEND_URL) {
    console.warn(
      '[bootstrap] FRONTEND_URL non défini — CORS et cookies cross-origin peuvent échouer',
    );
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BV Groupe RH API')
    .setDescription(
      'Documentation complète de l\'API RH — BV Groupe. ' +
        'Authentification JWT (Bearer). Les réponses succès sont au format { ok: true, data }. ' +
        'Les suppressions métier sont des POST `.../:id/delete` (soft delete), pas de verbe HTTP DELETE.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token obtenu via POST /api/auth/login',
      },
      'JWT',
    )
    .addTag('auth', 'Connexion, inscription et profil')
    .addTag('users', 'Comptes utilisateurs (admin)')
    .addTag('employes', 'Gestion des employés')
    .addTag('presences', 'Présences et pointage')
    .addTag('absences', 'Absences et congés')
    .addTag('paie', 'Bulletins et masse salariale')
    .addTag('recrutement', 'Offres et candidatures')
    .addTag('developpement-rh', 'Compétences, formations, évaluations')
    .addTag('budget', 'Budget RH')
    .addTag('dashboard', 'Tableau de bord')
    .addTag('statistiques', 'Synthèses statistiques')
    .addTag('notifications', 'Notifications in-app (admin + employé)')
    .addTag('push', 'Web Push Notifications (VAPID)')
    .addTag('health', 'Ping / uptime (cron, GitHub Actions)')
    .addTag('public', 'Endpoints publics (sans JWT)')
    .addTag('example', 'Exemples de guards')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(port);
}

void bootstrap();
