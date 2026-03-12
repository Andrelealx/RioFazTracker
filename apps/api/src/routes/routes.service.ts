import { Prisma } from "@prisma/client";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CreateAdminRouteDto,
  UpdateAdminRouteDto,
  UpsertRouteScheduleDto
} from "./dto/admin-route.dto";
import { PrismaService } from "../prisma/prisma.service";
import { RouteInfoQueryDto } from "./dto/route-info-query.dto";

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoutes() {
    const routes = await this.prisma.route.findMany({
      include: {
        neighborhood: true,
        schedules: { orderBy: { weekday: "asc" } },
        currentLocation: true
      },
      orderBy: { code: "asc" }
    });

    return routes.map((route) => this.mapRoute(route));
  }

  async createRoute(payload: CreateAdminRouteDto) {
    const code = this.normalizeRouteCode(payload.code);
    const name = payload.name.trim();
    const neighborhoodId = payload.neighborhood
      ? await this.resolveNeighborhoodId(payload.neighborhood)
      : null;

    try {
      const route = await this.prisma.route.create({
        data: {
          code,
          name,
          neighborhoodId
        }
      });

      if (payload.schedules && payload.schedules.length > 0) {
        await this.prisma.routeSchedule.createMany({
          data: payload.schedules.map((schedule) => ({
            routeId: route.id,
            weekday: schedule.weekday,
            timeStart: this.normalizeTime(schedule.timeStart),
            timeEnd: this.normalizeTime(schedule.timeEnd)
          })),
          skipDuplicates: true
        });
      }

      return this.findRouteOrThrow(code);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new BadRequestException("Codigo de rota ja existe");
      }
      throw error;
    }
  }

  async updateRoute(codeParam: string, payload: UpdateAdminRouteDto) {
    const code = this.normalizeRouteCode(codeParam);
    const route = await this.prisma.route.findUnique({
      where: { code }
    });
    if (!route) {
      throw new NotFoundException("Rota nao encontrada");
    }

    const data: Prisma.RouteUpdateInput = {};
    if (payload.name) {
      data.name = payload.name.trim();
    }
    if (payload.neighborhood) {
      data.neighborhood = {
        connect: {
          id: await this.resolveNeighborhoodId(payload.neighborhood)
        }
      };
    }

    await this.prisma.route.update({
      where: { code },
      data
    });

    return this.findRouteOrThrow(code);
  }

  async deleteRoute(codeParam: string) {
    const code = this.normalizeRouteCode(codeParam);
    try {
      await this.prisma.route.delete({
        where: { code }
      });
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException("Rota nao encontrada");
      }
      throw error;
    }
    return { ok: true, code };
  }

  async upsertRouteSchedule(codeParam: string, payload: UpsertRouteScheduleDto) {
    const code = this.normalizeRouteCode(codeParam);
    const route = await this.prisma.route.findUnique({
      where: { code }
    });
    if (!route) {
      throw new NotFoundException("Rota nao encontrada");
    }

    await this.prisma.routeSchedule.upsert({
      where: {
        routeId_weekday: {
          routeId: route.id,
          weekday: payload.weekday
        }
      },
      update: {
        timeStart: this.normalizeTime(payload.timeStart),
        timeEnd: this.normalizeTime(payload.timeEnd)
      },
      create: {
        routeId: route.id,
        weekday: payload.weekday,
        timeStart: this.normalizeTime(payload.timeStart),
        timeEnd: this.normalizeTime(payload.timeEnd)
      }
    });

    return this.findRouteOrThrow(code);
  }

  async deleteRouteSchedule(codeParam: string, weekday: number) {
    const code = this.normalizeRouteCode(codeParam);
    const route = await this.prisma.route.findUnique({
      where: { code }
    });
    if (!route) {
      throw new NotFoundException("Rota nao encontrada");
    }

    try {
      await this.prisma.routeSchedule.delete({
        where: {
          routeId_weekday: {
            routeId: route.id,
            weekday
          }
        }
      });
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException("Horario nao encontrado para essa rota");
      }
      throw error;
    }

    return this.findRouteOrThrow(code);
  }

  async getRouteInfo(query: RouteInfoQueryDto) {
    const neighborhood = await this.prisma.neighborhood.findFirst({
      where: {
        name: { equals: query.bairro, mode: "insensitive" },
        city: { equals: query.city, mode: "insensitive" },
        uf: { equals: query.uf, mode: "insensitive" }
      }
    });

    if (!neighborhood) {
      return {
        found: false,
        bairro: query.bairro,
        city: query.city,
        uf: query.uf,
        routes: []
      };
    }

    const routes = await this.prisma.route.findMany({
      where: { neighborhoodId: neighborhood.id },
      include: {
        schedules: {
          orderBy: { weekday: "asc" }
        }
      },
      orderBy: { name: "asc" }
    });

    return {
      found: routes.length > 0,
      bairro: neighborhood.name,
      city: neighborhood.city,
      uf: neighborhood.uf,
      routes: routes.map((route: {
        code: string;
        name: string;
        schedules: {
          weekday: number;
          timeStart: string;
          timeEnd: string;
        }[];
      }) => ({
        code: route.code,
        name: route.name,
        schedules: route.schedules.map((schedule: {
          weekday: number;
          timeStart: string;
          timeEnd: string;
        }) => ({
          weekday: schedule.weekday,
          timeStart: schedule.timeStart,
          timeEnd: schedule.timeEnd
        }))
      }))
    };
  }

  private async findRouteOrThrow(code: string) {
    const route = await this.prisma.route.findUnique({
      where: { code },
      include: {
        neighborhood: true,
        schedules: { orderBy: { weekday: "asc" } },
        currentLocation: true
      }
    });

    if (!route) {
      throw new NotFoundException("Rota nao encontrada");
    }

    return this.mapRoute(route);
  }

  private mapRoute(route: {
    code: string;
    name: string;
    neighborhood: { name: string; city: string; uf: string } | null;
    schedules: { weekday: number; timeStart: string; timeEnd: string }[];
    currentLocation:
      | {
          lat: Prisma.Decimal;
          lng: Prisma.Decimal;
          speed: Prisma.Decimal | null;
          accuracy: Prisma.Decimal | null;
          capturedAt: Date;
          updatedAt: Date;
        }
      | null;
  }) {
    return {
      code: route.code,
      name: route.name,
      neighborhood: route.neighborhood
        ? {
            name: route.neighborhood.name,
            city: route.neighborhood.city,
            uf: route.neighborhood.uf
          }
        : null,
      schedules: route.schedules.map((schedule) => ({
        weekday: schedule.weekday,
        timeStart: schedule.timeStart,
        timeEnd: schedule.timeEnd
      })),
      currentLocation: route.currentLocation
        ? {
            lat: Number(route.currentLocation.lat),
            lng: Number(route.currentLocation.lng),
            speed: route.currentLocation.speed ? Number(route.currentLocation.speed) : null,
            accuracy: route.currentLocation.accuracy ? Number(route.currentLocation.accuracy) : null,
            capturedAt: route.currentLocation.capturedAt,
            updatedAt: route.currentLocation.updatedAt
          }
        : null
    };
  }

  private async resolveNeighborhoodId(input: {
    name: string;
    city: string;
    uf: string;
  }): Promise<string> {
    const neighborhood = await this.prisma.neighborhood.upsert({
      where: {
        name_city_uf: {
          name: input.name.trim(),
          city: input.city.trim(),
          uf: input.uf.trim().toUpperCase()
        }
      },
      update: {},
      create: {
        name: input.name.trim(),
        city: input.city.trim(),
        uf: input.uf.trim().toUpperCase()
      }
    });

    return neighborhood.id;
  }

  private normalizeRouteCode(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeTime(value: string): string {
    const normalized = value.trim();
    return normalized.length === 5 ? `${normalized}:00` : normalized;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    );
  }
}
