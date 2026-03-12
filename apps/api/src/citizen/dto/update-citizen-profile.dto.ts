import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested
} from "class-validator";

class AddressInputDto {
  @IsString()
  @Length(8, 9)
  cep!: string;

  @IsString()
  @Length(2, 200)
  logradouro!: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  numero?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  complemento?: string;

  @IsString()
  @Length(2, 120)
  bairro!: string;

  @IsString()
  @Length(2, 120)
  cidade!: string;

  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/)
  uf!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

export class UpdateCitizenProfileDto {
  @IsString()
  @Length(2, 150)
  name!: string;

  @IsString()
  @Matches(/^\d{10,15}$/)
  phoneE164!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  whatsappOk?: boolean;

  @ValidateNested()
  @Type(() => AddressInputDto)
  address!: AddressInputDto;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notifyEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(5000)
  notifyProximityMeters?: number;
}
