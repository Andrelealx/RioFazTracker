import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
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
}
