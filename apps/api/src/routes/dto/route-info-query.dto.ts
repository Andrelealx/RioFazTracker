import { Transform } from "class-transformer";
import { IsString, Length, Matches } from "class-validator";

export class RouteInfoQueryDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  bairro!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  city!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  uf!: string;
}
