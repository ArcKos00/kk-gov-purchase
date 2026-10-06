import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { PasswordResetDto, UserCreateDto, UserUpdateDto } from '../auth/dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: UserCreateDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UserUpdateDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }

  @Put(':id/password')
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: PasswordResetDto) {
    return this.users.resetPassword(id, dto);
  }
}
