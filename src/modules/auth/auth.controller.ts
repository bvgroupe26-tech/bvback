import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiAuthResponses,
  ApiOkDataResponse,
  ApiCreatedDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthThrottlerGuard } from '../../common/guards/auth-throttler.guard';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { REFRESH_TOKEN_COOKIE } from './constants/auth-cookies.constant';
import { AuthService, RegisteredEmployee } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthTokenResponse, UserPayload } from './types/auth.types';
import { ActiveSessionDto } from './types/session.types';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from './utils/auth-cookie.util';
import { extractSessionMeta } from './utils/session-meta.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthThrottlerGuard, LocalAuthGuard)
  @ApiOperation({
    summary: 'Connexion',
    description:
      'Authentification par email et mot de passe. Retourne un access token court et place un refresh token HttpOnly en cookie. ' +
      'Limité à 5 tentatives par minute (IP + email).',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkDataResponse('Access token et profil utilisateur')
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({ status: 429, description: 'Trop de tentatives' })
  @ApiBadRequestResponse()
  async login(
    @Body() _loginDto: LoginDto,
    @CurrentUser() user: UserPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const result = await this.authService.login(user, extractSessionMeta(req));
    setRefreshTokenCookie(res, result.refreshToken);
    const { refreshToken: _refreshToken, ...body } = result;
    return body;
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(AuthThrottlerGuard)
  @ApiOperation({
    summary: 'Renouveler la session (cookie)',
    description:
      'Lit le refresh token HttpOnly depuis le cookie `refresh_token`, effectue une rotation et retourne un nouvel access token.',
  })
  @ApiOkDataResponse('Nouvel access token')
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou révoqué' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const token = req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!token) {
      clearRefreshTokenCookie(res);
      throw new UnauthorizedException('Refresh token manquant');
    }

    try {
      const result = await this.authService.refreshFromCookie(
        token,
        extractSessionMeta(req),
      );
      setRefreshTokenCookie(res, result.refreshToken);
      const { refreshToken: _refreshToken, ...body } = result;
      return body;
    } catch (error) {
      clearRefreshTokenCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Déconnexion',
    description: 'Révoque le refresh token courant et efface le cookie HttpOnly.',
  })
  @ApiOkDataResponse('Accusé de déconnexion')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.authService.logoutFromCookie(
      req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
    clearRefreshTokenCookie(res);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Déconnexion de tous les appareils',
    description: 'Révoque toutes les sessions refresh token de l\'utilisateur connecté.',
  })
  @ApiOkDataResponse('Nombre de sessions révoquées')
  @ApiAuthResponses()
  async logoutAll(
    @CurrentUser() user: UserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true; revoked: number }> {
    const { revoked } = await this.authService.logoutAll(user.id);
    clearRefreshTokenCookie(res);
    return { ok: true, revoked };
  }

  @Get('sessions')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Sessions actives',
    description: 'Liste les refresh tokens actifs (appareils connectés) de l\'utilisateur.',
  })
  @ApiOkDataResponse('Liste des sessions')
  @ApiAuthResponses()
  listSessions(
    @CurrentUser() user: UserPayload,
    @Req() req: Request,
  ): Promise<ActiveSessionDto[]> {
    return this.authService.listSessions(
      user.id,
      req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
  }

  @Post('register')
  @Roles('admin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthThrottlerGuard)
  @HttpCode(201)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Créer un compte RH ou manager',
    description:
      'Réservé aux administrateurs. N\'ouvre aucune session pour le compte créé (préférer POST /users).',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedDataResponse('Compte créé')
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  register(
    @Body() dto: RegisterDto,
    @CurrentUser() creator: UserPayload,
  ): Promise<UserResponseDto> {
    return this.authService.register(dto, creator.role);
  }

  @Post('register-employee')
  @Roles('admin', 'rh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthThrottlerGuard)
  @HttpCode(201)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Créer un compte employé',
    description:
      'Réservé à l\'admin et à la RH : crée un compte (rôle employee) et sa fiche RH liée, ' +
      'ou rattache la fiche existante de même email. N\'ouvre aucune session.',
  })
  @ApiBody({ type: RegisterEmployeeDto })
  @ApiCreatedDataResponse('Compte employé créé')
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  registerEmployee(@Body() dto: RegisterEmployeeDto): Promise<RegisteredEmployee> {
    return this.authService.registerEmployee(dto);
  }

  @Get('me')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Profil connecté', description: 'Utilisateur associé au JWT courant.' })
  @ApiOkDataResponse('Profil utilisateur')
  @ApiAuthResponses()
  getMe(@CurrentUser() user: UserPayload): Promise<UserPayload> {
    return this.authService.getMe(user.id);
  }
}
