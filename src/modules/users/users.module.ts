import { Module } from '@nestjs/common';
import { EmployesModule } from '../employes/employes.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [EmployesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
