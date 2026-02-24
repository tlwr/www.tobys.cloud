import { z } from 'zod'

export const UserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric with underscores'),
  hashedPassword: z.string().min(1, 'Hashed password cannot be empty'),
  // Future fields can be added here, e.g.:
  // role: z.enum(['admin', 'user']).optional(),
  // createdAt: z.date().optional(),
})

export type User = z.infer<typeof UserSchema>
