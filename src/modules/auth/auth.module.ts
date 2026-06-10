import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmployesModule } from '../employes/employes.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenService } from './refresh-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    UsersModule,
    EmployesModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret =
          configService.get<string>('ACCESS_TOKEN_SECRET') ??
          configService.get<string>('AUTH_SECRET');

        if (!secret) {
          throw new Error(
            'ACCESS_TOKEN_SECRET ou AUTH_SECRET est requis dans les variables d\'environnement',
          );
        }

        return {
          secret,
          signOptions: {
            expiresIn: configService.get<string>(
              'ACCESS_TOKEN_EXPIRES_IN',
              '7d',
            ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    LocalStrategy,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [AuthService, RefreshTokenService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
