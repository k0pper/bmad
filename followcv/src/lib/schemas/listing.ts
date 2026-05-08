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

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? null : v))

const optionalPositiveInt = z
  .union([z.coerce.number().int().positive(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v))

const optionalDate = z
  .union([z.coerce.date(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : (v as Date)))

export const updateListingSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    company: z.string().min(1, "Company is required").max(200),
    location: optionalString(200),
    salaryMin: optionalPositiveInt,
    salaryMax: optionalPositiveInt,
    salaryCurrency: z
      .string()
      .length(3)
      .optional()
      .transform((v) => (v === undefined || v === "" ? "USD" : v)),
    closingDate: optionalDate,
  })
  .refine(
    (d) => d.salaryMin === null || d.salaryMax === null || d.salaryMax >= d.salaryMin,
    { message: "Maximum salary must be greater than or equal to minimum", path: ["salaryMax"] }
  )

export type UpdateListingInput = z.infer<typeof updateListingSchema>
