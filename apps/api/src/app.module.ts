import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RoutesModule } from "./routes/routes.module";
import { TrackingModule } from "./tracking/tracking.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"]
    }),
    PrismaModule,
    HealthModule,
    TrackingModule,
    RoutesModule
  ]
})
export class AppModule {}
