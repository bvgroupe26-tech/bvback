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
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiAuthResponses,
  ApiOkDataResponse,
  ApiCreatedDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { REFRESH_TOKEN_COOKIE } from './constants/auth-cookies.constant';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthLoginResult, AuthTokenResponse, UserPayload } from './types/auth.types';
import { ActiveSessionDto } from './types/session.types';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from './utils/auth-cookie.util';
import { extractSessionMeta } from './utils/session-meta.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({
    summary: 'Connexion',
    description:
      'Authentification par email et mot de passe. Retourne un access token (15 min) et place un refresh token HttpOnly en cookie.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkDataResponse('Access token et profil utilisateur')
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiBadRequestResponse()
  async login(
    @Body() _loginDto: LoginDto,
    @CurrentUser() user: UserPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    return this.respondWithAuth(
      this.authService.login(user, extractSessionMeta(req)),
      res,
    );
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Renouveler la session (cookie)',
    description:
      'Lit le refresh token HttpOnly, effectue une rotation et retourne un nouvel access token.',
  })
  @ApiOkDataResponse('Nouvel access token')
  @ApiResponse({ status: 401, description: 'Refresh token invalide ou révoqué' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!refreshToken) {
      clearRefreshTokenCookie(res, this.configService);
      throw new UnauthorizedException('Refresh token manquant');
    }

    try {
      return await this.respondWithAuth(
        this.authService.refreshFromCookie(refreshToken, extractSessionMeta(req)),
        res,
      );
    } catch (error) {
      clearRefreshTokenCookie(res, this.configService);
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
      req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
    clearRefreshTokenCookie(res, this.configService);
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
    clearRefreshTokenCookie(res, this.configService);
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
      req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
  }

  @Post('register')
  @Public()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Inscription',
    description: 'Création de compte RH ou manager uniquement (pas de rôle admin).',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedDataResponse('Compte créé avec tokens')
  @ApiResponse({ status: 403, description: 'Inscription désactivée ou rôle interdit' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiBadRequestResponse()
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    return this.respondWithAuth(
      this.authService.register(dto, extractSessionMeta(req)),
      res,
    );
  }

  @Post('register-employee')
  @Public()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Inscription employé',
    description:
      'Crée un compte utilisateur (rôle employee) ET une fiche employé RH liée.',
  })
  @ApiBody({ type: RegisterEmployeeDto })
  @ApiCreatedDataResponse('Compte employé créé avec tokens')
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiBadRequestResponse()
  async registerEmployee(
    @Body() dto: RegisterEmployeeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenResponse> {
    return this.respondWithAuth(
      this.authService.registerEmployee(dto, extractSessionMeta(req)),
      res,
    );
  }

  /** @deprecated Préférer POST /auth/refresh (cookie HttpOnly). */
  @Post('refresh-token')
  @HttpCode(200)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Rafraîchir le token (legacy)',
    description:
      'Génère un nouvel access token à partir du JWT courant encore valide. Préférer POST /auth/refresh.',
  })
  @ApiOkDataResponse('Nouvel access token')
  @ApiAuthResponses()
  refreshToken(@CurrentUser() user: UserPayload): Promise<AuthTokenResponse> {
    return this.authService.refreshToken(user.id);
  }

  @Get('me')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Profil connecté', description: 'Utilisateur associé au JWT courant.' })
  @ApiOkDataResponse('Profil utilisateur')
  @ApiAuthResponses()
  getMe(@CurrentUser() user: UserPayload): Promise<UserPayload> {
    return this.authService.getMe(user.id);
  }

  private respondWithAuth(
    resultPromise: Promise<AuthLoginResult>,
    res: Response,
  ): Promise<AuthTokenResponse> {
    return resultPromise.then((result) => {
      setRefreshTokenCookie(res, result.refreshToken, this.configService);
      const { refreshToken: _refreshToken, ...body } = result;
      return body;
    });
  }
}
