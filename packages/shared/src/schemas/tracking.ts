import { z } from "zod";

export const updateLocationSchema = z.object({
  routeCode: z.string().min(1).max(64),
  vehicleCode: z.string().min(1).max(64).optional(),
  teamCode: z.string().min(1).max(64).optional(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  speed: z.number().nonnegative().optional(),
  accuracy: z.number().nonnegative().optional(),
  capturedAt: z.coerce.date().optional()
});

export const historyQuerySchema = z.object({
  routeCode: z.string().min(1).max(64),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100)
});

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
