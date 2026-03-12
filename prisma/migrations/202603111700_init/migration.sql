CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "user_role" AS ENUM ('ADMIN', 'OPERATOR', 'CITIZEN', 'TRACKER_DEVICE');

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE,
  "phone_e164" TEXT UNIQUE,
  "password_hash" TEXT,
  "role" "user_role" NOT NULL DEFAULT 'CITIZEN',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "refresh_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id");

CREATE TABLE "neighborhoods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "uf" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "uq_neighborhoods_name_city_uf" UNIQUE ("name", "city", "uf")
);

CREATE TABLE "routes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "neighborhood_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_routes_neighborhood" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL
);

CREATE TABLE "route_schedules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "route_id" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "time_start" TEXT NOT NULL,
  "time_end" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_route_schedules_route" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE,
  CONSTRAINT "uq_route_schedules_route_weekday" UNIQUE ("route_id", "weekday")
);
CREATE INDEX "idx_route_schedules_weekday" ON "route_schedules" ("weekday");

CREATE TABLE "tracker_devices" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "api_key_hash" TEXT NOT NULL,
  "route_id" UUID,
  "vehicle_code" TEXT,
  "team_code" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_tracker_devices_route" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL
);

CREATE TABLE "current_locations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "route_id" UUID NOT NULL UNIQUE,
  "device_id" UUID,
  "vehicle_code" TEXT,
  "team_code" TEXT,
  "lat" DECIMAL(10,7) NOT NULL,
  "lng" DECIMAL(10,7) NOT NULL,
  "speed" DECIMAL(8,2),
  "accuracy" DECIMAL(8,2),
  "captured_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_current_locations_route" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_current_locations_device" FOREIGN KEY ("device_id") REFERENCES "tracker_devices"("id") ON DELETE SET NULL
);
CREATE INDEX "idx_current_locations_updated_at" ON "current_locations" ("updated_at");

CREATE TABLE "location_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "route_id" UUID NOT NULL,
  "device_id" UUID,
  "vehicle_code" TEXT,
  "team_code" TEXT,
  "lat" DECIMAL(10,7) NOT NULL,
  "lng" DECIMAL(10,7) NOT NULL,
  "speed" DECIMAL(8,2),
  "accuracy" DECIMAL(8,2),
  "captured_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_location_history_route" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_location_history_device" FOREIGN KEY ("device_id") REFERENCES "tracker_devices"("id") ON DELETE SET NULL
);
CREATE INDEX "idx_location_history_route_captured_at" ON "location_history" ("route_id", "captured_at");

CREATE TABLE "addresses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "user_id" UUID NOT NULL,
  "cep" TEXT NOT NULL,
  "logradouro" TEXT NOT NULL,
  "numero" TEXT,
  "complemento" TEXT,
  "bairro" TEXT NOT NULL,
  "cidade" TEXT NOT NULL,
  "uf" TEXT NOT NULL,
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "geocoded_at" TIMESTAMPTZ,
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_addresses_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "idx_addresses_user_id" ON "addresses" ("user_id");
CREATE INDEX "idx_addresses_bairro" ON "addresses" ("bairro");
CREATE INDEX "idx_addresses_cidade_uf" ON "addresses" ("cidade", "uf");

CREATE TABLE "address_route_map" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "address_id" UUID NOT NULL,
  "route_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_address_route_map_address" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_address_route_map_route" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE,
  CONSTRAINT "uq_address_route_map_address_route" UNIQUE ("address_id", "route_id")
);

CREATE TABLE "user_preferences" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "notify_enabled" BOOLEAN NOT NULL DEFAULT false,
  "notify_proximity_meters" INTEGER NOT NULL DEFAULT 500,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_user_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "notification_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacy_id" INTEGER UNIQUE,
  "user_id" UUID NOT NULL,
  "route_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_notification_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_notification_logs_route" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE
);
CREATE INDEX "idx_notification_logs_user_created_at" ON "notification_logs" ("user_id", "created_at");

CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "action" TEXT NOT NULL,
  "resource" TEXT,
  "resource_id" TEXT,
  "metadata" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_audit_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" ("created_at");
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" ("user_id");
