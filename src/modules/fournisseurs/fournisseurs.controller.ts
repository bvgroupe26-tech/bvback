import {
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Fournisseur } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiAuthResponses,
  ApiBadRequestResponse,
  ApiCreatedDataResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import {
  CreateFournisseurDto,
  QueryFournisseursDto,
  UpdateFournisseurDto,
} from './dto/fournisseur.dto';
import { FournisseursService } from './fournisseurs.service';

@ApiTags('fournisseurs')
@ApiBearerAuth('JWT')
@Roles('admin', 'rh', 'manager')
@Controller('fournisseurs')
export class FournisseursController {
  constructor(private readonly service: FournisseursService) {}

  @Get()
  @ApiOperation({ summary: 'Lister / rechercher les fournisseurs' })
  @ApiQuery({ type: QueryFournisseursDto })
  @ApiOkDataResponse('Liste des fournisseurs')
  @ApiAuthResponses()
  findAll(@Query() query: QueryFournisseursDto): Promise<Fournisseur[]> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un fournisseur" })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkDataResponse('Fournisseur')
  @ApiNotFoundResponse('Fournisseur')
  @ApiAuthResponses()
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Fournisseur> {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin', 'rh')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un fournisseur' })
  @ApiBody({ type: CreateFournisseurDto })
  @ApiCreatedDataResponse('Fournisseur créé')
  @ApiBadRequestResponse()
  @ApiResponse({ status: 409, description: 'NIU déjà utilisé' })
  @ApiAuthResponses()
  create(@Body() dto: CreateFournisseurDto): Promise<Fournisseur> {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'rh')
  @ApiOperation({ summary: 'Modifier un fournisseur' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateFournisseurDto })
  @ApiOkDataResponse('Fournisseur mis à jour')
  @ApiNotFoundResponse('Fournisseur')
  @ApiAuthResponses()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFournisseurDto,
  ): Promise<Fournisseur> {
    return this.service.update(id, dto);
  }

  @Post(':id/delete')
  @Roles('admin', 'rh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archiver un fournisseur' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiNoContentResponse()
  @ApiNotFoundResponse('Fournisseur')
  @ApiAuthResponses()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(id);
  }
}
