import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiBadRequestResponse,
  ApiCreatedDataResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { CreatePaieDto } from './dto/create-paie.dto';
import { GeneratePaieDto } from './dto/generate-paie.dto';
import { QueryPaieDto } from './dto/query-paie.dto';
import { UpdatePaieDto } from './dto/update-paie.dto';
import { PaieService } from './paie.service';
import {
  GeneratePaieResult,
  PaieEvolutionPoint,
  PaieStatsResponse,
  PaieWithEmploye,
} from './types/paie.types';

@ApiTags('paie')
@ApiBearerAuth('JWT')
@Controller('paie')
export class PaieController {
  constructor(private readonly paieService: PaieService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques paie', description: 'Masse salariale, bulletins payés/en attente.' })
  @ApiOkDataResponse('Statistiques paie')
  @ApiAuthResponses()
  getStats(): Promise<PaieStatsResponse> {
    return this.paieService.getStats();
  }

  @Get('evolution')
  @ApiOperation({ summary: 'Évolution masse salariale', description: '12 derniers mois.' })
  @ApiOkDataResponse('Points mensuels')
  @ApiAuthResponses()
  getEvolution(): Promise<PaieEvolutionPoint[]> {
    return this.paieService.getEvolution();
  }

  @Get('me')
  @ApiOperation({
    summary: 'Mes bulletins de paie',
    description: 'Liste des bulletins de paie de l\'employé connecté.',
  })
  @ApiOkDataResponse('Bulletins de l\'employé connecté')
  @ApiAuthResponses()
  findMine(@CurrentUser() user: UserPayload): Promise<PaieWithEmploye[]> {
    return this.paieService.findByUserId(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les bulletins de paie' })
  @ApiQuery({ type: QueryPaieDto })
  @ApiOkDataResponse('Liste des bulletins')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  findAll(@Query() query: QueryPaieDto): Promise<PaieWithEmploye[]> {
    return this.paieService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer ou générer des bulletins',
    description:
      'Mode manuel : corps complet avec employeId. Mode masse : uniquement { mois, annee }.',
  })
  @ApiBody({
    description: 'CreatePaieDto (manuel) ou GeneratePaieDto (mois + annee)',
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/CreatePaieDto' },
        { $ref: '#/components/schemas/GeneratePaieDto' },
      ],
    },
  })
  @ApiCreatedDataResponse('Bulletin créé ou résultat génération masse')
  @ApiResponse({ status: 409, description: 'Bulletin déjà existant pour cet employé/période' })
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  async create(
    @Body() body: Record<string, unknown>,
  ): Promise<PaieWithEmploye | GeneratePaieResult> {
    if (this.paieService.isGenerateMode(body)) {
      const dto = plainToInstance(GeneratePaieDto, body);
      const errors = await validate(dto);

      if (errors.length > 0) {
        throw new BadRequestException(errors);
      }

      return this.paieService.generateBulk(dto);
    }

    const dto = plainToInstance(CreatePaieDto, body);
    const errors = await validate(dto);

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return this.paieService.createManual(dto);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Télécharger un bulletin PDF',
    description: 'Génère et retourne un PDF du bulletin de paie.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Fichier PDF' })
  @ApiNotFoundResponse('Bulletin')
  @ApiAuthResponses()
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const bulletin = await this.paieService.findOne(id);
    const employeNom = bulletin.employe
      ? `${bulletin.employe.nom}_${bulletin.employe.prenom}`
      : `employe_${bulletin.employeId}`;

    const filename = `bulletin_${employeNom}_${bulletin.mois}_${bulletin.annee}.txt`;

    const content = this.paieService.generateBulletinText(bulletin);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un bulletin' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Bulletin avec employé')
  @ApiNotFoundResponse('Bulletin')
  @ApiAuthResponses()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PaieWithEmploye> {
    return this.paieService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un bulletin', description: 'salaireNet recalculé automatiquement.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdatePaieDto })
  @ApiOkDataResponse('Bulletin mis à jour')
  @ApiNotFoundResponse('Bulletin')
  @ApiBadRequestResponse()
  @ApiAuthResponses()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaieDto,
  ): Promise<PaieWithEmploye> {
    return this.paieService.update(id, dto);
  }

  @Post(':id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archiver un bulletin de paie',
    description: 'Suppression logique (soft delete).',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Bulletin')
  @ApiAuthResponses()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.paieService.remove(id);
  }
}
