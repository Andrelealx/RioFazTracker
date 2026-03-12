import { Transform } from "class-transformer";
import { IsString, Length } from "class-validator";

export class LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(3, 150)
  identifier!: string;

  @IsString()
  @Length(6, 128)
  password!: string;
}
