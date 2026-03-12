import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  name: string;
  email: string | null;
  phoneE164: string | null;
}
