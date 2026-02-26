import { z } from 'zod'

export const ProjectSchema = z.object({
  content: z.string(),
  createdAt: z.string().datetime(),
  tags: z.array(z.string()).optional().default([]),
  visible: z.boolean().optional().default(false),
  images: z.array(z.string()).optional().default([]), // Array of image hashes/URLs
})

export type Project = z.infer<typeof ProjectSchema>
