import { Global, Module } from '@nestjs/common';
import {
  PrismaLifecycle,
  PrismaService,
  prismaServiceProvider,
} from './prisma.service';

@Global()
@Module({
  providers: [prismaServiceProvider, PrismaLifecycle],
  exports: [PrismaService],
})
export class PrismaModule {}
