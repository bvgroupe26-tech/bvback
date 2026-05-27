import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { SnakeToCamelInterceptor } from './common/interceptors/snake-to-camel.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

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

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

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
    .addTag('activite', 'Journal d\'activité')
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
