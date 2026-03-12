import { z } from "zod";

export const addressSchema = z.object({
  cep: z.string().min(8).max(9),
  logradouro: z.string().min(2).max(200),
  numero: z.string().max(30).optional(),
  complemento: z.string().max(120).optional(),
  bairro: z.string().min(2).max(120),
  cidade: z.string().min(2).max(120),
  uf: z.string().length(2),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional()
});

export const citizenProfileSchema = z.object({
  name: z.string().min(2).max(150),
  phoneE164: z.string().regex(/^\d{10,15}$/),
  whatsappOk: z.boolean().default(true),
  address: addressSchema,
  notifyEnabled: z.boolean().default(false),
  notifyProximityMeters: z.number().int().positive().max(5000).default(500)
});

export type CitizenProfileInput = z.infer<typeof citizenProfileSchema>;
