import { UserRole } from "@prisma/client";
import { Body, Controller, Get, Headers, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user.type";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { HistoryQueryDto } from "./dto/history-query.dto";
import { LocationQueryDto } from "./dto/location-query.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { TrackingService } from "./tracking.service";

@Controller("tracking")
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get("location")
  getCurrentLocation(@Query() query: LocationQueryDto) {
    return this.trackingService.getCurrentLocation(query.routeCode);
  }

  @Get("history")
  getHistory(@Query() query: HistoryQueryDto) {
    return this.trackingService.getHistory(query);
  }

  @Post("location")
  updateLocation(
    @Headers("x-device-code") deviceCode: string | undefined,
    @Headers("x-device-key") deviceKey: string | undefined,
    @Body() payload: UpdateLocationDto
  ) {
    return this.trackingService.updateLocation({
      deviceCode,
      deviceKey,
      payload
    });
  }

  @Post("admin/location")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateLocationByAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateLocationDto
  ) {
    return this.trackingService.updateLocationByAdmin(payload, user.id);
  }
}
