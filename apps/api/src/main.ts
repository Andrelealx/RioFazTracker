import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Request, Response, static as expressStatic } from "express";
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
  const publicDirectory = resolvePublicDirectory();

  if (publicDirectory) {
    httpAdapter.use(expressStatic(publicDirectory));

    httpAdapter.get("/", (_request: Request, response: Response) => {
      response.sendFile(path.join(publicDirectory, "index.html"));
    });

    httpAdapter.get("/tracker", (_request: Request, response: Response) => {
      response.sendFile(path.join(publicDirectory, "tracker.html"));
    });
  } else {
    httpAdapter.get("/", (_request: Request, response: Response) => {
      response.status(200).json({
        name: "RioFazTracker API",
        status: "ok",
        docs: "/api/health",
        timestamp: new Date().toISOString()
      });
    });
  }

  httpAdapter.get("/api", (_request: Request, response: Response) => {
    response.status(200).json({
      name: "RioFazTracker API",
      status: "ok",
      docs: {
        health: "/api/health",
        auth: ["/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/me"],
        citizen: ["/api/citizen/profile", "/api/citizen/dashboard"],
        routes: ["/api/routes/info"],
        tracking: ["/api/tracking/location", "/api/tracking/history"]
      }
    });
  });

  const port = Number(process.env.PORT || process.env.API_PORT || 3001);
  await app.listen(port);
  logger.log(`API listening on port ${port}`);
}

bootstrap();

function resolvePublicDirectory(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "apps/api/public"),
    path.resolve(process.cwd(), "public"),
    path.resolve(__dirname, "../public")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}