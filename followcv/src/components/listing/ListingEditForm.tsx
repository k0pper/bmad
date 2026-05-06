"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateListing } from "@/actions/listing"

type InitialValues = {
  title: string
  company: string
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  notes: string | null
  closingDate: Date | null
}

type Props = {
  listingId: string
  initialValues: InitialValues
}

function toDateInput(d: Date | null): string {
  if (!d) return ""
  return d.toISOString().slice(0, 10)
}

export function ListingEditForm({ listingId, initialValues }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await updateListing(listingId, formData)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-4 text-sm"
      aria-label="Edit listing"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title" name="title" defaultValue={initialValues.title} required />
        <Field label="Company" name="company" defaultValue={initialValues.company} required />
        <Field label="Location" name="location" defaultValue={initialValues.location ?? ""} />
        <Field
          label="Currency"
          name="salaryCurrency"
          defaultValue={initialValues.salaryCurrency ?? "USD"}
          maxLength={3}
        />
        <Field
          label="Salary min"
          name="salaryMin"
          type="number"
          defaultValue={initialValues.salaryMin?.toString() ?? ""}
        />
        <Field
          label="Salary max"
          name="salaryMax"
          type="number"
          defaultValue={initialValues.salaryMax?.toString() ?? ""}
        />
        <Field
          label="Closing date"
          name="closingDate"
          type="date"
          defaultValue={toDateInput(initialValues.closingDate)}
        />
      </div>
      <label className="block">
        <span
          className="block text-xs font-medium mb-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Notes
        </span>
        <textarea
          name="notes"
          defaultValue={initialValues.notes ?? ""}
          rows={4}
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-border, #e2e8f0)" }}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger, #b91c1c)" }}>
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm" style={{ color: "var(--color-success, #047857)" }}>
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = false,
  maxLength,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  required?: boolean
  maxLength?: number
}) {
  return (
    <label className="block">
      <span
        className="block text-xs font-medium mb-1"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        className="w-full rounded-md border px-3 py-2 text-sm"
        style={{ borderColor: "var(--color-border, #e2e8f0)" }}
      />
    </label>
  )
}
