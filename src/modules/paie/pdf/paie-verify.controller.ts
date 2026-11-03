import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { PayslipPdfService } from './payslip-pdf.service';

@ApiTags('paie')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('paie/verify')
export class PaieVerifyController {
  constructor(private readonly pdf: PayslipPdfService) {}

  @Get(':numero')
  @ApiOperation({
    summary: 'Vérifier un bulletin (QR code)',
    description:
      'Route publique : indique si le bulletin est authentique. Ne renvoie que le nom masqué, la période et le net.',
  })
  @ApiParam({ name: 'numero', example: 'BV-2026-05-000123' })
  verify(@Param('numero') numero: string) {
    return this.pdf.verify(numero);
  }
}
