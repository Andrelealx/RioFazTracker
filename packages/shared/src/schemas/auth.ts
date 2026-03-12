import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().min(3).max(150),
  password: z.string().min(6).max(128)
});

export const registerSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email().optional(),
  phoneE164: z.string().regex(/^\d{10,15}$/).optional(),
  password: z.string().min(6).max(128)
}).refine((value) => Boolean(value.email || value.phoneE164), {
  message: "Email or phoneE164 is required",
  path: ["identifier"]
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
