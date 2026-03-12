import { randomUUID } from "node:crypto";
import { User, UserRole } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { parseDurationToMs } from "../common/utils/duration.util";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthSessionResponse extends SessionTokens {
  user: {
    id: string;
    role: UserRole;
    name: string;
    email: string | null;
    phoneE164: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(input: RegisterDto): Promise<AuthSessionResponse> {
    const email = input.email?.trim().toLowerCase() || null;
    const phoneE164 = input.phoneE164?.replace(/\D/g, "") || null;

    if (!email && !phoneE164) {
      throw new BadRequestException("Email ou telefone sao obrigatorios");
    }

    if (email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email }
      });
      if (existingByEmail) {
        throw new BadRequestException("Email ja cadastrado");
      }
    }

    if (phoneE164) {
      const existingByPhone = await this.prisma.user.findUnique({
        where: { phoneE164 }
      });
      if (existingByPhone) {
        throw new BadRequestException("Telefone ja cadastrado");
      }
    }

    const passwordHash = await hash(input.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        phoneE164,
        passwordHash,
        role: UserRole.CITIZEN
      }
    });

    await this.prisma.userPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        notifyEnabled: false,
        notifyProximityMeters: 500
      }
    });

    return this.issueSession(user);
  }

  async login(input: LoginDto): Promise<AuthSessionResponse> {
    const normalized = input.identifier.trim().toLowerCase();
    const phoneCandidate = input.identifier.replace(/\D/g, "");

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: normalized },
          ...(phoneCandidate ? [{ phoneE164: phoneCandidate }] : [])
        ]
      }
    });

    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    const validPassword = await compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSessionResponse> {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token obrigatorio");
    }

    let payload: { sub: string; typ?: string } | null = null;
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; typ?: string }>(refreshToken, {
        secret: this.getRefreshSecret()
      });
    } catch {
      throw new UnauthorizedException("Refresh token invalido");
    }

    if (!payload?.sub || payload.typ !== "refresh") {
      throw new UnauthorizedException("Refresh token invalido");
    }

    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    let matchedTokenId: string | null = null;
    for (const tokenRecord of activeTokens) {
      const matches = await compare(refreshToken, tokenRecord.tokenHash);
      if (matches) {
        matchedTokenId = tokenRecord.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new UnauthorizedException("Refresh token invalido");
    }

    await this.prisma.refreshToken.update({
      where: { id: matchedTokenId },
      data: { revokedAt: new Date() }
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Usuario inativo");
    }

    return this.issueSession(user);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true }
    });

    if (!user) {
      throw new UnauthorizedException("Usuario nao encontrado");
    }

    return {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      phoneE164: user.phoneE164,
      notifyEnabled: user.preferences?.notifyEnabled ?? false,
      notifyProximityMeters: user.preferences?.notifyProximityMeters ?? 500
    };
  }

  getRefreshCookieName(): string {
    return this.configService.get<string>("REFRESH_COOKIE_NAME") || "riofaz_refresh";
  }

  getAccessCookieName(): string {
    return this.configService.get<string>("ACCESS_COOKIE_NAME") || "riofaz_access";
  }

  getRefreshCookieMaxAgeMs(): number {
    return parseDurationToMs(this.getRefreshExpiresInRaw(), 7 * 24 * 60 * 60 * 1000);
  }

  getAccessCookieMaxAgeMs(): number {
    return parseDurationToMs(this.getAccessExpiresInRaw(), 15 * 60 * 1000);
  }

  private async issueSession(user: User): Promise<AuthSessionResponse> {
    const tokens = await this.createTokens(user);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await hash(tokens.refreshToken, 10),
        expiresAt: new Date(Date.now() + this.getRefreshCookieMaxAgeMs())
      }
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        phoneE164: user.phoneE164
      }
    };
  }

  private async createTokens(user: User): Promise<SessionTokens> {
    const accessPayload = {
      sub: user.id,
      role: user.role
    };
    const refreshPayload = {
      sub: user.id,
      typ: "refresh",
      nonce: randomUUID()
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.getAccessSecret(),
      expiresIn: this.getAccessExpiresInSeconds()
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.getRefreshSecret(),
      expiresIn: this.getRefreshExpiresInSeconds()
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.getAccessExpiresInSeconds()
    };
  }

  private getAccessSecret(): string {
    return this.configService.get<string>("JWT_ACCESS_SECRET") || "change_me_access_secret";
  }

  private getRefreshSecret(): string {
    return this.configService.get<string>("JWT_REFRESH_SECRET") || "change_me_refresh_secret";
  }

  private getAccessExpiresInRaw(): string {
    return this.configService.get<string>("JWT_ACCESS_EXPIRES_IN") || "15m";
  }

  private getRefreshExpiresInRaw(): string {
    return this.configService.get<string>("JWT_REFRESH_EXPIRES_IN") || "7d";
  }

  private getAccessExpiresInSeconds(): number {
    return Math.floor(parseDurationToMs(this.getAccessExpiresInRaw(), 15 * 60 * 1000) / 1000);
  }

  private getRefreshExpiresInSeconds(): number {
    return Math.floor(parseDurationToMs(this.getRefreshExpiresInRaw(), 7 * 24 * 60 * 60 * 1000) / 1000);
  }
}
