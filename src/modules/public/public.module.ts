import { Module } from '@nestjs/common';
import { GuardsExampleController } from './guards-example.controller';

@Module({
  controllers: [GuardsExampleController],
})
export class PublicModule {}
