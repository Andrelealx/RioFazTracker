import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";

export class RegisterDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(2, 150)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.replace(/\D/g, "").trim() : value
  )
  @Matches(/^\d{10,15}$/)
  phoneE164?: string;

  @IsString()
  @Length(6, 128)
  password!: string;
}
