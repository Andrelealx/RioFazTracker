import { Module } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TrackingController } from "./tracking.controller";
import { TrackingService } from "./tracking.service";

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, JwtAuthGuard, RolesGuard]
})
export class TrackingModule {}
