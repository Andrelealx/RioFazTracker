import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import {
  CreateAdminRouteDto,
  UpdateAdminRouteDto,
  UpsertRouteScheduleDto
} from "./dto/admin-route.dto";
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

  @Post("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createRoute(@Body() payload: CreateAdminRouteDto) {
    return this.routesService.createRoute(payload);
  }

  @Patch("admin/:code")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateRoute(
    @Param("code") code: string,
    @Body() payload: UpdateAdminRouteDto
  ) {
    return this.routesService.updateRoute(code, payload);
  }

  @Delete("admin/:code")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteRoute(@Param("code") code: string) {
    return this.routesService.deleteRoute(code);
  }

  @Post("admin/:code/schedules")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertRouteSchedule(
    @Param("code") code: string,
    @Body() payload: UpsertRouteScheduleDto
  ) {
    return this.routesService.upsertRouteSchedule(code, payload);
  }

  @Delete("admin/:code/schedules/:weekday")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteRouteSchedule(
    @Param("code") code: string,
    @Param("weekday", ParseIntPipe) weekday: number
  ) {
    return this.routesService.deleteRouteSchedule(code, weekday);
  }

  @Get("info")
  getRouteInfo(@Query() query: RouteInfoQueryDto) {
    return this.routesService.getRouteInfo(query);
  }
}
