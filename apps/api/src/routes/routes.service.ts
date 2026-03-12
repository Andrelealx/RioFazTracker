import { Injectable } from "@nestjs/common";
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

    return routes.map((route) => ({
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
    }));
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
}
