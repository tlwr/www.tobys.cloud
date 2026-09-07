import { z } from "zod";

/** KV key is the email (stored as username). Devise hashes are bcrypt. */
export const UserSchema = z.object({
  username: z.string().min(3).max(200),
  hashedPassword: z.string().min(1, "Hashed password cannot be empty"),
});

export type User = z.infer<typeof UserSchema>;
