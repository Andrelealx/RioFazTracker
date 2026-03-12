import { PrismaClient, UserRole } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

interface ParsedInsert {
  columns: string[];
  rows: Record<string, unknown>[];
}

function extractInsert(sql: string, table: string): ParsedInsert {
  const regex = new RegExp(`INSERT INTO \\`${table}\\` \\(([^)]+)\\) VALUES\\s*([\\s\\S]*?);`, "g");
  const rows: Record<string, unknown>[] = [];
  let columns: string[] = [];

  for (const match of sql.matchAll(regex)) {
    columns = match[1]
      .split(",")
      .map((value) => value.replace(/`/g, "").trim());

    const parsedRows = splitRows(match[2]).map((rawRow) => {
      const values = splitValues(rawRow).map(parseValue);
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = values[index] ?? null;
      });
      return row;
    });

    rows.push(...parsedRows);
  }

  return { columns, rows };
}

function splitRows(valuesBlock: string): string[] {
  const rows: string[] = [];
  let inString = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < valuesBlock.length; i += 1) {
    const current = valuesBlock[i];
    const previous = i > 0 ? valuesBlock[i - 1] : "";

    if (current === "'" && previous !== "\\") {
      inString = !inString;
    }

    if (inString) {
      continue;
    }

    if (current === "(") {
      if (depth === 0) {
        start = i + 1;
      }
      depth += 1;
    } else if (current === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        rows.push(valuesBlock.slice(start, i));
        start = -1;
      }
    }
  }

  return rows;
}

function splitValues(row: string): string[] {
  const values: string[] = [];
  let inString = false;
  let current = "";

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    const previous = i > 0 ? row[i - 1] : "";

    if (char === "'" && previous !== "\\") {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString && char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    values.push(current.trim());
  }

  return values;
}

function parseValue(raw: string): unknown {
  const value = raw.trim();

  if (/^NULL$/i.test(value)) {
    return null;
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");
  }

  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }

  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return value;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value.replace(" ", "T"));
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp);
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const sqlPath = process.argv[2] || "C:/Users/Lealx/Downloads/u305836601_coleta.sql";
    const absolutePath = path.resolve(sqlPath);
    const sql = fs.readFileSync(absolutePath, "utf8");

    const neighborhoods = extractInsert(sql, "neighborhoods").rows;
    const routes = extractInsert(sql, "routes").rows;
    const schedules = extractInsert(sql, "route_schedules").rows;
    const users = extractInsert(sql, "users").rows;
    const addresses = extractInsert(sql, "addresses").rows;
    const currentLocations = extractInsert(sql, "current_location").rows;
    const preferences = extractInsert(sql, "user_preferences").rows;
    const notificationLogs = extractInsert(sql, "notification_log").rows;

    const neighborhoodLegacyMap = new Map<number, string>();
    const routeLegacyMap = new Map<number, string>();
    const routeCodeMap = new Map<string, string>();
    const userLegacyMap = new Map<number, string>();

    for (const row of neighborhoods) {
      const legacyId = asNumber(row.id);
      const name = asString(row.name);
      const city = asString(row.city);
      const uf = asString(row.uf);
      if (!legacyId || !name || !city || !uf) {
        continue;
      }

      const neighborhood = await prisma.neighborhood.upsert({
        where: { legacyId },
        update: { name, city, uf },
        create: { legacyId, name, city, uf }
      });
      neighborhoodLegacyMap.set(legacyId, neighborhood.id);
    }

    for (const row of routes) {
      const legacyId = asNumber(row.id);
      const code = asString(row.code);
      const name = asString(row.name);
      const neighborhoodLegacyId = asNumber(row.neighborhood_id);

      if (!legacyId || !code || !name) {
        continue;
      }

      const neighborhoodId = neighborhoodLegacyId ? neighborhoodLegacyMap.get(neighborhoodLegacyId) ?? null : null;
      const route = await prisma.route.upsert({
        where: { legacyId },
        update: {
          code,
          name,
          neighborhoodId
        },
        create: {
          legacyId,
          code,
          name,
          neighborhoodId
        }
      });

      routeLegacyMap.set(legacyId, route.id);
      routeCodeMap.set(route.code, route.id);
    }

    for (const row of schedules) {
      const legacyId = asNumber(row.id);
      const routeLegacyId = asNumber(row.route_id);
      const weekday = asNumber(row.weekday);
      const timeStart = asString(row.time_start);
      const timeEnd = asString(row.time_end);

      if (!legacyId || !routeLegacyId || weekday === null || !timeStart || !timeEnd) {
        continue;
      }

      const routeId = routeLegacyMap.get(routeLegacyId);
      if (!routeId) {
        continue;
      }

      await prisma.routeSchedule.upsert({
        where: { legacyId },
        update: {
          routeId,
          weekday,
          timeStart,
          timeEnd
        },
        create: {
          legacyId,
          routeId,
          weekday,
          timeStart,
          timeEnd
        }
      });
    }

    for (const row of users) {
      const legacyId = asNumber(row.id);
      const name = asString(row.name);
      const phoneE164 = asString(row.phone_e164);
      if (!legacyId || !name) {
        continue;
      }

      const user = await prisma.user.upsert({
        where: { legacyId },
        update: {
          name,
          phoneE164,
          role: UserRole.CITIZEN,
          isActive: true
        },
        create: {
          legacyId,
          name,
          phoneE164,
          role: UserRole.CITIZEN,
          isActive: true
        }
      });
      userLegacyMap.set(legacyId, user.id);
    }

    for (const row of addresses) {
      const legacyId = asNumber(row.id);
      const userLegacyId = asNumber(row.user_id);
      const userId = userLegacyId ? userLegacyMap.get(userLegacyId) : null;
      if (!legacyId || !userId) {
        continue;
      }

      const cep = asString(row.cep);
      const logradouro = asString(row.logradouro);
      const bairro = asString(row.bairro);
      const cidade = asString(row.cidade);
      const uf = asString(row.uf);
      if (!cep || !logradouro || !bairro || !cidade || !uf) {
        continue;
      }

      await prisma.address.upsert({
        where: { legacyId },
        update: {
          userId,
          cep,
          logradouro,
          numero: asString(row.numero),
          complemento: asString(row.complemento),
          bairro,
          cidade,
          uf,
          lat: asNumber(row.lat),
          lng: asNumber(row.lng),
          geocodedAt: asDate(row.geocoded_at),
          isPrimary: Boolean(row.is_primary)
        },
        create: {
          legacyId,
          userId,
          cep,
          logradouro,
          numero: asString(row.numero),
          complemento: asString(row.complemento),
          bairro,
          cidade,
          uf,
          lat: asNumber(row.lat),
          lng: asNumber(row.lng),
          geocodedAt: asDate(row.geocoded_at),
          isPrimary: Boolean(row.is_primary)
        }
      });
    }

    for (const row of currentLocations) {
      const routeCode = asString(row.route_id);
      const lat = asNumber(row.lat);
      const lng = asNumber(row.lng);
      if (!routeCode || lat === null || lng === null) {
        continue;
      }

      let routeId = routeCodeMap.get(routeCode);
      if (!routeId) {
        const route = await prisma.route.upsert({
          where: { code: routeCode },
          update: {
            name: `Rota ${routeCode}`
          },
          create: {
            code: routeCode,
            name: `Rota ${routeCode}`
          }
        });
        routeId = route.id;
        routeCodeMap.set(routeCode, route.id);
      }

      const capturedAt = asDate(row.updated_at) || new Date();

      await prisma.currentLocation.upsert({
        where: { routeId },
        update: {
          lat,
          lng,
          capturedAt
        },
        create: {
          routeId,
          lat,
          lng,
          capturedAt
        }
      });

      await prisma.locationHistory.create({
        data: {
          routeId,
          lat,
          lng,
          capturedAt
        }
      });
    }

    for (const row of preferences) {
      const userLegacyId = asNumber(row.user_id);
      if (!userLegacyId) {
        continue;
      }
      const userId = userLegacyMap.get(userLegacyId);
      if (!userId) {
        continue;
      }

      await prisma.userPreference.upsert({
        where: { userId },
        update: {
          notifyEnabled: Boolean(row.notify_enabled),
          notifyProximityMeters: asNumber(row.notify_proximity_meters) ?? 500
        },
        create: {
          userId,
          notifyEnabled: Boolean(row.notify_enabled),
          notifyProximityMeters: asNumber(row.notify_proximity_meters) ?? 500
        }
      });
    }

    for (const row of notificationLogs) {
      const legacyId = asNumber(row.id);
      const userLegacyId = asNumber(row.user_id);
      const routeLegacyId = asNumber(row.route_id);
      const reason = asString(row.reason);

      if (!legacyId || !userLegacyId || !routeLegacyId || !reason) {
        continue;
      }

      const userId = userLegacyMap.get(userLegacyId);
      const routeId = routeLegacyMap.get(routeLegacyId);

      if (!userId || !routeId) {
        continue;
      }

      await prisma.notificationLog.upsert({
        where: { legacyId },
        update: {
          userId,
          routeId,
          reason,
          createdAt: asDate(row.created_at) ?? new Date()
        },
        create: {
          legacyId,
          userId,
          routeId,
          reason,
          createdAt: asDate(row.created_at) ?? new Date()
        }
      });
    }

    console.log("Legacy SQL migration completed.");
    console.log(`Neighborhoods: ${neighborhoodLegacyMap.size}`);
    console.log(`Routes: ${routeLegacyMap.size}`);
    console.log(`Users: ${userLegacyMap.size}`);
    console.log(`Current locations: ${currentLocations.length}`);
    console.log("Skipped: user_tokens table (legacy session tokens incompatible with JWT refresh model).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
