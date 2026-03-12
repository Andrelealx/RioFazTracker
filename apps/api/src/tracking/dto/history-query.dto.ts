import { Type } from "class-transformer";
import { IsDate, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class HistoryQueryDto {
  @IsString()
  @Length(1, 64)
  routeCode!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
