import { Controller, Get, Query } from "@nestjs/common";
import { RouteInfoQueryDto } from "./dto/route-info-query.dto";
import { RoutesService } from "./routes.service";

@Controller("routes")
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get("info")
  getRouteInfo(@Query() query: RouteInfoQueryDto) {
    return this.routesService.getRouteInfo(query);
  }
}
