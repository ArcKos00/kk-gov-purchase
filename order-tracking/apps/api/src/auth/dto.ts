import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  ChangePasswordInput, LoginInput, PasswordResetInput, Role, UserCreateInput, UserUpdateInput,
} from '@order-tracking/shared';
import { MIN_PASSWORD } from './password';

export const ROLE_LIST: Role[] = ['admin', 'editor', 'viewer'];
const PASSWORD_MSG = `Пароль — щонайменше ${MIN_PASSWORD} символів`;

export class LoginDto implements LoginInput {
  @IsString() @IsNotEmpty({ message: 'Вкажіть логін' }) @MaxLength(200) login: string;
  @IsString() @IsNotEmpty({ message: 'Вкажіть пароль' }) @MaxLength(200) password: string;
}

export class ChangePasswordDto implements ChangePasswordInput {
  @IsString() @IsNotEmpty({ message: 'Вкажіть поточний пароль' }) @MaxLength(200) currentPassword: string;
  @IsString() @MinLength(MIN_PASSWORD, { message: PASSWORD_MSG }) @MaxLength(200) newPassword: string;
}

export class UserCreateDto implements UserCreateInput {
  @IsString() @IsNotEmpty({ message: 'Вкажіть логін' }) @MaxLength(100, { message: 'Не довше 100 символів' })
  @Matches(/^[\p{L}\p{N}._@+-]+$/u, { message: 'Лише літери, цифри та . _ @ + -' })
  login: string;

  @IsString() @IsNotEmpty({ message: 'Вкажіть ПІБ' }) @MaxLength(200, { message: 'Не довше 200 символів' })
  fullName: string;

  @IsIn(ROLE_LIST, { message: 'Оберіть роль' }) role: Role;

  @IsString() @MinLength(MIN_PASSWORD, { message: PASSWORD_MSG }) @MaxLength(200) password: string;
}

export class UserUpdateDto implements UserUpdateInput {
  @IsOptional() @IsString() @IsNotEmpty({ message: 'Вкажіть ПІБ' }) @MaxLength(200, { message: 'Не довше 200 символів' })
  fullName?: string;

  @IsOptional() @IsIn(ROLE_LIST, { message: 'Оберіть роль' }) role?: Role;

  @IsOptional() @IsBoolean() active?: boolean;
}

export class PasswordResetDto implements PasswordResetInput {
  @IsString() @MinLength(MIN_PASSWORD, { message: PASSWORD_MSG }) @MaxLength(200) password: string;
}
