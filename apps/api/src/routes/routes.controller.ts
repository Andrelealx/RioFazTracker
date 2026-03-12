import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { RouteInfoQueryDto } from "./dto/route-info-query.dto";
import { RoutesService } from "./routes.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("routes")
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get("list")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listRoutes() {
    return this.routesService.listRoutes();
  }

  @Get("info")
  getRouteInfo(@Query() query: RouteInfoQueryDto) {
    return this.routesService.getRouteInfo(query);
  }
}
