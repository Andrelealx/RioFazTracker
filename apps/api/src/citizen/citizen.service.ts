import { Address, Prisma, Route, RouteSchedule } from "@prisma/client";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateCitizenProfileDto } from "./dto/update-citizen-profile.dto";

type RouteWithStatus = Route & {
  schedules: RouteSchedule[];
  currentLocation: {
    lat: Prisma.Decimal;
    lng: Prisma.Decimal;
    speed: Prisma.Decimal | null;
    accuracy: Prisma.Decimal | null;
    capturedAt: Date;
    updatedAt: Date;
  } | null;
};

@Injectable()
export class CitizenService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: {
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }]
        },
        preferences: true
      }
    });

    if (!user) {
      throw new NotFoundException("Usuario nao encontrado");
    }

    const primaryAddress = user.addresses[0] ?? null;
    const routes = primaryAddress
      ? await this.resolveRoutesForAddress(this.prisma, primaryAddress, true)
      : [];

    return {
      profile: {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        phoneE164: user.phoneE164,
        whatsappOk: true
      },
      preferences: {
        notifyEnabled: user.preferences?.notifyEnabled ?? false,
        notifyProximityMeters: user.preferences?.notifyProximityMeters ?? 500
      },
      address: primaryAddress
        ? {
            cep: primaryAddress.cep,
            logradouro: primaryAddress.logradouro,
            numero: primaryAddress.numero,
            complemento: primaryAddress.complemento,
            bairro: primaryAddress.bairro,
            cidade: primaryAddress.cidade,
            uf: primaryAddress.uf,
            lat: primaryAddress.lat ? Number(primaryAddress.lat) : null,
            lng: primaryAddress.lng ? Number(primaryAddress.lng) : null
          }
        : null,
      routes: routes.map((route) => this.mapRoute(route)),
      nextPickup: this.computeNextPickup(routes)
    };
  }

  async upsertProfile(userId: string, input: UpdateCitizenProfileDto) {
    const normalizedPhone = input.phoneE164.replace(/\D/g, "");
    const normalizedUf = input.address.uf.trim().toUpperCase();

    const conflictUser = await this.prisma.user.findUnique({
      where: { phoneE164: normalizedPhone }
    });
    if (conflictUser && conflictUser.id !== userId) {
      throw new BadRequestException("Telefone ja cadastrado por outro usuario");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: input.name.trim(),
          phoneE164: normalizedPhone
        }
      });

      const currentPrimary = await tx.address.findFirst({
        where: {
          userId,
          isPrimary: true
        },
        orderBy: { updatedAt: "desc" }
      });

      await tx.address.updateMany({
        where: { userId },
        data: { isPrimary: false }
      });

      const addressPayload = {
        cep: input.address.cep.trim(),
        logradouro: input.address.logradouro.trim(),
        numero: input.address.numero?.trim() || null,
        complemento: input.address.complemento?.trim() || null,
        bairro: input.address.bairro.trim(),
        cidade: input.address.cidade.trim(),
        uf: normalizedUf,
        lat: input.address.lat ?? null,
        lng: input.address.lng ?? null,
        geocodedAt:
          typeof input.address.lat === "number" && typeof input.address.lng === "number"
            ? new Date()
            : null,
        isPrimary: true
      };

      const address = currentPrimary
        ? await tx.address.update({
            where: { id: currentPrimary.id },
            data: addressPayload
          })
        : await tx.address.create({
            data: {
              userId,
              ...addressPayload
            }
          });

      await tx.userPreference.upsert({
        where: { userId },
        update: {
          notifyEnabled: input.notifyEnabled ?? false,
          notifyProximityMeters: input.notifyProximityMeters ?? 500
        },
        create: {
          userId,
          notifyEnabled: input.notifyEnabled ?? false,
          notifyProximityMeters: input.notifyProximityMeters ?? 500
        }
      });

      await this.relinkAddressRoutes(tx, address);
    });

    return this.getDashboard(userId);
  }

  private async relinkAddressRoutes(tx: Prisma.TransactionClient, address: Address) {
    await tx.addressRouteMap.deleteMany({
      where: { addressId: address.id }
    });

    const neighborhood = await tx.neighborhood.findFirst({
      where: {
        name: { equals: address.bairro, mode: "insensitive" },
        city: { equals: address.cidade, mode: "insensitive" },
        uf: { equals: address.uf, mode: "insensitive" }
      },
      include: {
        routes: {
          select: { id: true }
        }
      }
    });

    if (!neighborhood || neighborhood.routes.length === 0) {
      return;
    }

    await tx.addressRouteMap.createMany({
      data: neighborhood.routes.map((route) => ({
        addressId: address.id,
        routeId: route.id
      })),
      skipDuplicates: true
    });
  }

  private async resolveRoutesForAddress(
    client: Prisma.TransactionClient | PrismaService,
    address: Address,
    persistIfMissing: boolean
  ): Promise<RouteWithStatus[]> {
    const mappedRoutes = await client.addressRouteMap.findMany({
      where: { addressId: address.id },
      include: {
        route: {
          include: {
            schedules: { orderBy: { weekday: "asc" } },
            currentLocation: true
          }
        }
      }
    });

    if (mappedRoutes.length > 0) {
      return mappedRoutes.map((mapItem) => mapItem.route as RouteWithStatus);
    }

    const neighborhood = await client.neighborhood.findFirst({
      where: {
        name: { equals: address.bairro, mode: "insensitive" },
        city: { equals: address.cidade, mode: "insensitive" },
        uf: { equals: address.uf, mode: "insensitive" }
      }
    });

    if (!neighborhood) {
      return [];
    }

    const neighborhoodRoutes = await client.route.findMany({
      where: { neighborhoodId: neighborhood.id },
      include: {
        schedules: { orderBy: { weekday: "asc" } },
        currentLocation: true
      }
    });

    if (persistIfMissing && neighborhoodRoutes.length > 0) {
      await client.addressRouteMap.createMany({
        data: neighborhoodRoutes.map((route) => ({
          addressId: address.id,
          routeId: route.id
        })),
        skipDuplicates: true
      });
    }

    return neighborhoodRoutes as RouteWithStatus[];
  }

  private mapRoute(route: RouteWithStatus) {
    return {
      code: route.code,
      name: route.name,
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

  private computeNextPickup(routes: RouteWithStatus[]) {
    const now = new Date();
    let bestCandidate: {
      routeCode: string;
      routeName: string;
      datetime: Date;
      weekday: number;
      timeStart: string;
      timeEnd: string;
    } | null = null;

    for (const route of routes) {
      for (const schedule of route.schedules) {
        const candidate = this.findNextOccurrence(schedule.weekday, schedule.timeStart, now);
        if (!candidate) {
          continue;
        }

        if (!bestCandidate || candidate.getTime() < bestCandidate.datetime.getTime()) {
          bestCandidate = {
            routeCode: route.code,
            routeName: route.name,
            datetime: candidate,
            weekday: schedule.weekday,
            timeStart: schedule.timeStart,
            timeEnd: schedule.timeEnd
          };
        }
      }
    }

    if (!bestCandidate) {
      return null;
    }

    return {
      routeCode: bestCandidate.routeCode,
      routeName: bestCandidate.routeName,
      weekday: bestCandidate.weekday,
      timeStart: bestCandidate.timeStart,
      timeEnd: bestCandidate.timeEnd,
      datetime: bestCandidate.datetime.toISOString()
    };
  }

  private findNextOccurrence(weekday: number, timeStart: string, now: Date): Date | null {
    const [hourString, minuteString] = timeStart.split(":");
    const hour = Number.parseInt(hourString, 10);
    const minute = Number.parseInt(minuteString, 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    const normalizedWeekday = ((weekday % 7) + 7) % 7;

    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getDay() !== normalizedWeekday) {
        continue;
      }
      if (candidate.getTime() <= now.getTime()) {
        continue;
      }
      return candidate;
    }

    return null;
  }
}
