import { compare } from "bcryptjs";
import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { HistoryQueryDto } from "./dto/history-query.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";

interface UpdateLocationInput {
  deviceCode?: string;
  deviceKey?: string;
  payload: UpdateLocationDto;
}

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentLocation(routeCode: string) {
    const route = await this.prisma.route.findUnique({
      where: { code: routeCode },
      include: { currentLocation: true }
    });

    if (!route || !route.currentLocation) {
      throw new NotFoundException("Current location not found for the given route");
    }

    return {
      routeCode: route.code,
      lat: Number(route.currentLocation.lat),
      lng: Number(route.currentLocation.lng),
      speed: route.currentLocation.speed ? Number(route.currentLocation.speed) : null,
      accuracy: route.currentLocation.accuracy ? Number(route.currentLocation.accuracy) : null,
      vehicleCode: route.currentLocation.vehicleCode,
      teamCode: route.currentLocation.teamCode,
      capturedAt: route.currentLocation.capturedAt,
      updatedAt: route.currentLocation.updatedAt
    };
  }

  async getHistory(query: HistoryQueryDto) {
    const route = await this.prisma.route.findUnique({
      where: { code: query.routeCode }
    });

    if (!route) {
      throw new NotFoundException("Route not found");
    }

    const where: { routeId: string; capturedAt?: { gte?: Date; lte?: Date } } = {
      routeId: route.id
    };

    if (query.from || query.to) {
      where.capturedAt = {};
      if (query.from) {
        where.capturedAt.gte = query.from;
      }
      if (query.to) {
        where.capturedAt.lte = query.to;
      }
    }

    const history = await this.prisma.locationHistory.findMany({
      where,
      orderBy: { capturedAt: "desc" },
      take: query.limit ?? 100
    });

    return {
      routeCode: route.code,
      items: history.map((item: {
        lat: PrismaDecimalLike;
        lng: PrismaDecimalLike;
        speed: PrismaDecimalLike | null;
        accuracy: PrismaDecimalLike | null;
        vehicleCode: string | null;
        teamCode: string | null;
        capturedAt: Date;
        createdAt: Date;
      }) => ({
        lat: Number(item.lat),
        lng: Number(item.lng),
        speed: item.speed ? Number(item.speed) : null,
        accuracy: item.accuracy ? Number(item.accuracy) : null,
        vehicleCode: item.vehicleCode,
        teamCode: item.teamCode,
        capturedAt: item.capturedAt,
        createdAt: item.createdAt
      }))
    };
  }

  async updateLocation(input: UpdateLocationInput) {
    const device = await this.validateDevice(input.deviceCode, input.deviceKey);
    const route = await this.getOrCreateRoute(input.payload.routeCode);
    const capturedAt = input.payload.capturedAt ?? new Date();

    await this.prisma.$transaction([
      this.prisma.currentLocation.upsert({
        where: { routeId: route.id },
        update: {
          deviceId: device.id,
          vehicleCode: input.payload.vehicleCode ?? device.vehicleCode ?? null,
          teamCode: input.payload.teamCode ?? device.teamCode ?? null,
          lat: input.payload.lat,
          lng: input.payload.lng,
          speed: input.payload.speed ?? null,
          accuracy: input.payload.accuracy ?? null,
          capturedAt
        },
        create: {
          routeId: route.id,
          deviceId: device.id,
          vehicleCode: input.payload.vehicleCode ?? device.vehicleCode ?? null,
          teamCode: input.payload.teamCode ?? device.teamCode ?? null,
          lat: input.payload.lat,
          lng: input.payload.lng,
          speed: input.payload.speed ?? null,
          accuracy: input.payload.accuracy ?? null,
          capturedAt
        }
      }),
      this.prisma.locationHistory.create({
        data: {
          routeId: route.id,
          deviceId: device.id,
          vehicleCode: input.payload.vehicleCode ?? device.vehicleCode ?? null,
          teamCode: input.payload.teamCode ?? device.teamCode ?? null,
          lat: input.payload.lat,
          lng: input.payload.lng,
          speed: input.payload.speed ?? null,
          accuracy: input.payload.accuracy ?? null,
          capturedAt
        }
      }),
      this.prisma.trackerDevice.update({
        where: { id: device.id },
        data: {
          routeId: route.id,
          vehicleCode: input.payload.vehicleCode ?? device.vehicleCode ?? null,
          teamCode: input.payload.teamCode ?? device.teamCode ?? null
        }
      })
    ]);

    return {
      ok: true,
      routeCode: route.code,
      capturedAt,
      deviceCode: device.code
    };
  }

  private async getOrCreateRoute(code: string) {
    const existing = await this.prisma.route.findUnique({ where: { code } });
    if (existing) {
      return existing;
    }

    return this.prisma.route.create({
      data: {
        code,
        name: `Rota ${code}`
      }
    });
  }

  private async validateDevice(deviceCode?: string, deviceKey?: string) {
    if (!deviceCode || !deviceKey) {
      throw new UnauthorizedException("Missing device credentials");
    }

    const device = await this.prisma.trackerDevice.findUnique({
      where: { code: deviceCode }
    });

    if (!device || !device.isActive) {
      throw new UnauthorizedException("Invalid device credentials");
    }

    const validKey = await compare(deviceKey, device.apiKeyHash);
    if (!validKey) {
      throw new UnauthorizedException("Invalid device credentials");
    }

    return device;
  }
}

interface PrismaDecimalLike {
  toString(): string;
}
