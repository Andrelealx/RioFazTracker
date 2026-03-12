import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Request, Response, static as expressStatic } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { PrismaService } from "./prisma/prisma.service";

interface TrackerGateContext {
  accessCookieName: string;
  accessSecret: string;
  privateDirectory: string | null;
  jwtService: JwtService;
  prismaService: PrismaService;
}

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

  const configService = app.get(ConfigService);
  const jwtService = app.get(JwtService);
  const prismaService = app.get(PrismaService);
  await ensureBootstrapAdmin(configService, prismaService, logger);

  const trackerGate: TrackerGateContext = {
    accessCookieName: configService.get<string>("ACCESS_COOKIE_NAME") || "riofaz_access",
    accessSecret: configService.get<string>("JWT_ACCESS_SECRET") || "change_me_access_secret",
    privateDirectory: resolvePrivateDirectory(),
    jwtService,
    prismaService
  };

  const httpAdapter = app.getHttpAdapter().getInstance();
  const publicDirectory = resolvePublicDirectory();

  if (publicDirectory) {
    httpAdapter.get("/tracker", (request: Request, response: Response) => {
      void serveTrackerPage(request, response, trackerGate);
    });

    httpAdapter.get("/tracker.html", (request: Request, response: Response) => {
      void serveTrackerPage(request, response, trackerGate);
    });

    httpAdapter.use(expressStatic(publicDirectory, { index: false }));

    httpAdapter.get("/", (_request: Request, response: Response) => {
      response.sendFile(path.join(publicDirectory, "index.html"));
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
        routes: ["/api/routes/list", "/api/routes/info"],
        tracking: ["/api/tracking/location", "/api/tracking/history"]
      }
    });
  });

  const port = Number(process.env.PORT || process.env.API_PORT || 3001);
  await app.listen(port);
  logger.log(`API listening on port ${port}`);
}

bootstrap();

async function serveTrackerPage(
  request: Request,
  response: Response,
  context: TrackerGateContext
): Promise<void> {
  if (!context.privateDirectory) {
    response.status(404).json({ message: "Tracker page unavailable" });
    return;
  }

  const accessToken = readAccessToken(request, context.accessCookieName);
  if (!accessToken) {
    response.redirect("/");
    return;
  }

  try {
    const payload = await context.jwtService.verifyAsync<{ sub: string; role?: UserRole }>(accessToken, {
      secret: context.accessSecret
    });

    if (!payload?.sub) {
      response.redirect("/");
      return;
    }

    const user = await context.prismaService.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || !user.isActive || user.role !== UserRole.ADMIN) {
      response.status(403).send("Admin access required for tracker page.");
      return;
    }

    response.sendFile(path.join(context.privateDirectory, "tracker.html"));
  } catch {
    response.redirect("/");
  }
}

function readAccessToken(request: Request, accessCookieName: string): string | null {
  const cookieToken = request.cookies?.[accessCookieName];
  if (typeof cookieToken === "string" && cookieToken.length > 10) {
    return cookieToken;
  }

  const authorizationHeader = request.headers.authorization;
  if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")) {
    const headerToken = authorizationHeader.slice(7).trim();
    if (headerToken.length > 10) {
      return headerToken;
    }
  }

  return null;
}

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

function resolvePrivateDirectory(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "apps/api/private"),
    path.resolve(process.cwd(), "private"),
    path.resolve(__dirname, "../private")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function ensureBootstrapAdmin(
  configService: ConfigService,
  prismaService: PrismaService,
  logger: Logger
): Promise<void> {
  const emailRaw = configService.get<string>("INITIAL_ADMIN_EMAIL");
  const passwordRaw = configService.get<string>("INITIAL_ADMIN_PASSWORD");
  const nameRaw = configService.get<string>("INITIAL_ADMIN_NAME");

  const email = emailRaw?.trim().toLowerCase();
  const password = passwordRaw?.trim();
  const name = nameRaw?.trim() || "Administrador";

  if (!email || !password) {
    return;
  }

  try {
    const passwordHash = await hash(password, 12);
    await prismaService.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true
      },
      create: {
        name,
        email,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true
      }
    });

    logger.log(`Bootstrap admin ensured for ${email}`);
  } catch (error) {
    logger.error(`Failed to ensure bootstrap admin for ${email}`, error as Error);
  }
}
