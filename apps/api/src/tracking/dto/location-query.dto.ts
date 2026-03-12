import { IsString, Length } from "class-validator";

export class LocationQueryDto {
  @IsString()
  @Length(1, 64)
  routeCode!: string;
}
