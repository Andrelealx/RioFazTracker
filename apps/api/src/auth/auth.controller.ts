import { Response } from "express";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user.type";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Post("register")
  async register(
    @Body() payload: RegisterDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const session = await this.authService.register(payload);
    this.attachRefreshCookie(response, session.refreshToken);
    return session;
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() payload: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const session = await this.authService.login(payload);
    this.attachRefreshCookie(response, session.refreshToken);
    return session;
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body() payload: RefreshDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const tokenFromCookie = response.req?.cookies?.[this.authService.getRefreshCookieName()];
    const refreshToken = payload.refreshToken || tokenFromCookie;
    const session = await this.authService.refresh(refreshToken);
    this.attachRefreshCookie(response, session.refreshToken);
    return session;
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.authService.revokeAllSessions(user.id);
    response.clearCookie(this.authService.getRefreshCookieName(), {
      path: "/api/auth"
    });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  private attachRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(this.authService.getRefreshCookieName(), refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.configService.get<string>("NODE_ENV") === "production",
      path: "/api/auth",
      maxAge: this.authService.getRefreshCookieMaxAgeMs()
    });
  }
}
