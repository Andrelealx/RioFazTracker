import { Type } from "class-transformer";
import { IsDate, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class UpdateLocationDto {
  @IsString()
  @Length(1, 64)
  routeCode!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  vehicleCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  teamCode?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speed?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  capturedAt?: Date;
}
