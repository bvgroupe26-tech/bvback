import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiAuthResponses,
  ApiNotFoundResponse,
  ApiOkDataResponse,
} from '../../common/swagger/api-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/auth.types';
import { DocumentsService } from './documents.service';
import { DocumentRh } from '@prisma/client';
import * as path from 'path';

@ApiTags('documents')
@ApiBearerAuth('JWT')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Mes documents RH',
    description: 'Liste des documents RH de l\'employé connecté.',
  })
  @ApiOkDataResponse('Documents de l\'employé connecté')
  @ApiAuthResponses()
  findMine(@CurrentUser() user: UserPayload): Promise<DocumentRh[]> {
    return this.documentsService.findByUserId(user.id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Télécharger un document',
    description: 'Télécharge le fichier associé au document RH.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Fichier téléchargé' })
  @ApiNotFoundResponse('Document')
  @ApiAuthResponses()
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, document } = await this.documentsService.getFileBuffer(id);
    const ext = path.extname(document.fichierPath);
    const filename = `${document.titre}${ext}`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
