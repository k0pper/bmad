import { z } from "zod"

export const urlImportSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
})

export type UrlImportInput = z.infer<typeof urlImportSchema>
