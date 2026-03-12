import { z } from "zod";

export const routeInfoQuerySchema = z.object({
  bairro: z.string().min(2).max(120),
  city: z.string().min(2).max(120),
  uf: z.string().length(2)
});

export type RouteInfoQueryInput = z.infer<typeof routeInfoQuerySchema>;
