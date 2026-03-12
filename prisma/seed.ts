import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await hash("Admin@123", 12);
  const operatorPassword = await hash("Operador@123", 12);
  const trackerApiKey = process.env.TRACKING_SHARED_KEY || "change_me_tracking_fallback_key";
  const trackerApiKeyHash = await hash(trackerApiKey, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@riofaz.local" },
    update: {
      name: "Administrador RioFaz",
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      isActive: true
    },
    create: {
      name: "Administrador RioFaz",
      email: "admin@riofaz.local",
      passwordHash: adminPassword,
      role: UserRole.ADMIN
    }
  });

  await prisma.user.upsert({
    where: { email: "operador@riofaz.local" },
    update: {
      name: "Operador RioFaz",
      passwordHash: operatorPassword,
      role: UserRole.OPERATOR,
      isActive: true
    },
    create: {
      name: "Operador RioFaz",
      email: "operador@riofaz.local",
      passwordHash: operatorPassword,
      role: UserRole.OPERATOR
    }
  });

  const neighborhood = await prisma.neighborhood.upsert({
    where: {
      name_city_uf: {
        name: "Centro",
        city: "Guapimirim",
        uf: "RJ"
      }
    },
    update: {},
    create: {
      name: "Centro",
      city: "Guapimirim",
      uf: "RJ"
    }
  });

  const route = await prisma.route.upsert({
    where: { code: "coleta1" },
    update: {
      name: "Rota Generica",
      neighborhoodId: neighborhood.id
    },
    create: {
      code: "coleta1",
      name: "Rota Generica",
      neighborhoodId: neighborhood.id
    }
  });

  await prisma.routeSchedule.upsert({
    where: {
      routeId_weekday: {
        routeId: route.id,
        weekday: 3
      }
    },
    update: {
      timeStart: "08:00:00",
      timeEnd: "12:00:00"
    },
    create: {
      routeId: route.id,
      weekday: 3,
      timeStart: "08:00:00",
      timeEnd: "12:00:00"
    }
  });

  await prisma.trackerDevice.upsert({
    where: { code: "device-coleta1" },
    update: {
      name: "Dispositivo Coleta 1",
      routeId: route.id,
      apiKeyHash: trackerApiKeyHash,
      isActive: true
    },
    create: {
      code: "device-coleta1",
      name: "Dispositivo Coleta 1",
      routeId: route.id,
      apiKeyHash: trackerApiKeyHash
    }
  });

  await prisma.userPreference.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      notifyEnabled: false,
      notifyProximityMeters: 500
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
