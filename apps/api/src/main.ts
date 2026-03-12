import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  const logger = new Logger("Bootstrap");

  app.use(
    pinoHttp({
      level: process.env.NODE_ENV === "production" ? "info" : "debug"
    })
  );

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Code", "X-Device-Key"]
  });

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.get("/", (_request: Request, response: Response) => {
    response.status(200).json({
      name: "RioFazTracker API",
      status: "ok",
      docs: "/api/health",
      timestamp: new Date().toISOString()
    });
  });

  const port = Number(process.env.PORT || process.env.API_PORT || 3001);
  await app.listen(port);
  logger.log(`API listening on port ${port}`);
}

bootstrap();
