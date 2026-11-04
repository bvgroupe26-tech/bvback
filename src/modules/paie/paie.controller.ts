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
import { validate, ValidationError } from 'class-validator';
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
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeScope } from '../../common/guards/employee-scope.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { CreatePaieDto } from './dto/create-paie.dto';
import { GeneratePaieDto } from './dto/generate-paie.dto';
import { QueryPaieDto } from './dto/query-paie.dto';
import { UpdatePaieDto } from './dto/update-paie.dto';
import { PaieService } from './paie.service';
import { PayslipPdfService } from './pdf/payslip-pdf.service';
import {
  GeneratePaieResult,
  PaieDetail,
  PaieEvolutionPoint,
  PaieStatsResponse,
  PaieWithEmploye,
} from './types/paie.types';

@ApiTags('paie')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh')
@Controller('paie')
export class PaieController {
  constructor(
    private readonly paieService: PaieService,
    private readonly pdf: PayslipPdfService,
  ) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Statistiques paie',
    description:
      'Masse salariale, bulletins payés/en attente. Filtré sur le mois/année (défaut : mois en cours).',
  })
  @ApiQuery({ name: 'mois', required: false, example: '05' })
  @ApiQuery({ name: 'annee', required: false, example: 2026 })
  @ApiOkDataResponse('Statistiques paie')
  @ApiAuthResponses()
  getStats(@Query() query: QueryPaieDto): Promise<PaieStatsResponse> {
    return this.paieService.getStats(query.mois, query.annee);
  }

  @Get('evolution')
  @ApiOperation({ summary: 'Évolution masse salariale', description: '12 derniers mois.' })
  @ApiOkDataResponse('Points mensuels')
  @ApiAuthResponses()
  getEvolution(): Promise<PaieEvolutionPoint[]> {
    return this.paieService.getEvolution();
  }

  @Get('me')
  @Roles('admin', 'rh', 'manager', 'employee')
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
      'Mode manuel : corps complet avec employeId. Mode masse : uniquement { mois, annee }. ' +
      'La génération masse n\'inclut que les employés éligibles (actifs ou inactifs avec dateFinContrat sur la période), ' +
      'avec prorata automatique selon dateEmbauche et dateFinContrat. Suspendus et hors période ignorés avec détail.',
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
      await this.assertValid(dto);
      return this.paieService.generateBulk(dto);
    }

    const dto = plainToInstance(CreatePaieDto, body);
    await this.assertValid(dto);

    return this.paieService.createManual(dto);
  }

  @Get(':id/pdf')
  @Roles('admin', 'rh', 'manager', 'employee')
  @EmployeeScope({ resource: 'paie', staff: ['admin', 'rh'] })
  @ApiOperation({
    summary: 'Télécharger un bulletin PDF',
    description: 'Moteur v2 : lignes et snapshots ; legacy : anciens champs.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Fichier PDF' })
  @ApiNotFoundResponse('Bulletin')
  @ApiAuthResponses()
  async pdfFile(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const bulletin = await this.paieService.findOne(id);
    const buffer = await this.pdf.render(bulletin.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${this.pdf.fileNameFor(bulletin)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  /** Ancienne route (fichier texte) : sert désormais le même PDF. */
  @Get(':id/download')
  @Roles('admin', 'rh', 'manager', 'employee')
  @EmployeeScope({ resource: 'paie', staff: ['admin', 'rh'] })
  @ApiOperation({ summary: 'Télécharger un bulletin (alias de /pdf)', deprecated: true })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiAuthResponses()
  download(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    return this.pdfFile(id, res);
  }

  @Get(':id')
  @Roles('admin', 'rh', 'manager', 'employee')
  @EmployeeScope({ resource: 'paie', staff: ['admin', 'rh'] })
  @ApiOperation({ summary: 'Détail d\'un bulletin (lignes, snapshots, cumuls)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Bulletin avec employé')
  @ApiNotFoundResponse('Bulletin')
  @ApiAuthResponses()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PaieDetail> {
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
    @CurrentUser() user: UserPayload,
  ): Promise<PaieWithEmploye> {
    return this.paieService.update(id, dto, user?.role);
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

  private async assertValid(dto: object): Promise<void> {
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException(flattenValidationErrors(errors).join(' ; '));
    }
  }
}

function flattenValidationErrors(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {});
    const nested = error.children?.length
      ? flattenValidationErrors(error.children, path)
      : [];
    return [...(own.length ? own : nested.length ? [] : [`${path} invalide`]), ...nested];
  });
}
