import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiAuthResponses,
  ApiOkDataResponse,
  ApiCreatedDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthTokenResponse, UserPayload } from './types/auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({
    summary: 'Connexion',
    description: 'Authentification par email et mot de passe. Retourne un JWT valide 7 jours.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkDataResponse('JWT et profil utilisateur')
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiBadRequestResponse()
  login(
    @Body() _loginDto: LoginDto,
    @CurrentUser() user: UserPayload,
  ): Promise<AuthTokenResponse> {
    return this.authService.login(user);
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Déconnexion',
    description: 'JWT stateless — confirmation côté client (suppression du token).',
  })
  @ApiOkDataResponse('Accusé de déconnexion')
  logout(): { ok: true } {
    return { ok: true };
  }

  @Post('register')
  @Public()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Inscription',
    description: 'Création de compte RH ou manager uniquement (pas de rôle admin).',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedDataResponse('Compte créé avec JWT')
  @ApiResponse({ status: 403, description: 'Inscription désactivée ou rôle interdit' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiBadRequestResponse()
  register(@Body() dto: RegisterDto): Promise<AuthTokenResponse> {
    return this.authService.register(dto);
  }

  @Post('register-employee')
  @Public()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Inscription employé',
    description:
      'Crée un compte utilisateur (rôle employee) ET une fiche employé RH liée. Retourne un JWT.',
  })
  @ApiBody({ type: RegisterEmployeeDto })
  @ApiCreatedDataResponse('Compte employé créé avec JWT')
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  @ApiBadRequestResponse()
  registerEmployee(
    @Body() dto: RegisterEmployeeDto,
  ): Promise<AuthTokenResponse> {
    return this.authService.registerEmployee(dto);
  }

  @Post('refresh-token')
  @HttpCode(200)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Rafraîchir le token',
    description: 'Génère un nouveau JWT à partir du token courant encore valide.',
  })
  @ApiOkDataResponse('Nouveau JWT')
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
}
