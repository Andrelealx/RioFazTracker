import { Module } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { RoutesController } from "./routes.controller";
import { RoutesService } from "./routes.service";

@Module({
  controllers: [RoutesController],
  providers: [RoutesService, JwtAuthGuard, RolesGuard]
})
export class RoutesModule {}
