import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested
} from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class AdminNeighborhoodDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 120)
  city!: string;

  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/)
  uf!: string;
}

export class AdminRouteScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  @Matches(TIME_PATTERN)
  timeStart!: string;

  @IsString()
  @Matches(TIME_PATTERN)
  timeEnd!: string;
}

export class CreateAdminRouteDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminNeighborhoodDto)
  neighborhood?: AdminNeighborhoodDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => AdminRouteScheduleDto)
  schedules?: AdminRouteScheduleDto[];
}

export class UpdateAdminRouteDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminNeighborhoodDto)
  neighborhood?: AdminNeighborhoodDto;
}

export class UpsertRouteScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  @Matches(TIME_PATTERN)
  timeStart!: string;

  @IsString()
  @Matches(TIME_PATTERN)
  timeEnd!: string;
}
