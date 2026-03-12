import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CitizenService } from "./citizen.service";
import { UpdateCitizenProfileDto } from "./dto/update-citizen-profile.dto";

@Controller("citizen")
@UseGuards(JwtAuthGuard)
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  @Get("profile")
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.citizenService.getDashboard(user.id);
  }

  @Get("dashboard")
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.citizenService.getDashboard(user.id);
  }

  @Put("profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateCitizenProfileDto
  ) {
    return this.citizenService.upsertProfile(user.id, payload);
  }
}
