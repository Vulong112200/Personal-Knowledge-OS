import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserDeletionService } from './user-deletion.service';
import { UsersController } from './users.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [WorkspacesModule, forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService, UserDeletionService],
  exports: [UsersService],
})
export class UsersModule {}
