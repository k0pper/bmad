import { z } from "zod"

export const urlImportSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
})

export type UrlImportInput = z.infer<typeof urlImportSchema>

export const manualImportSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company name is required"),
  location: z.string().optional(),
  salaryMin: z.coerce.number().int().positive().optional().or(z.literal("")),
  salaryMax: z.coerce.number().int().positive().optional().or(z.literal("")),
  sourceUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
})

export type ManualImportInput = z.infer<typeof manualImportSchema>
