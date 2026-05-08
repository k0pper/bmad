"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateListing } from "@/actions/listing"
import { Button } from "@/components/ui/button"
import { Toast } from "@/components/ui/Toast"

type InitialValues = {
  title: string
  company: string
  companyDomain: string | null
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
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
  const [showSavedToast, setShowSavedToast] = useState(false)
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await updateListing(listingId, formData)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      setShowSavedToast(true)
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
        <Field
          label="Company email domain"
          name="companyDomain"
          defaultValue={initialValues.companyDomain ?? ""}
          help="e.g. acme.com — used by Gmail auto-tracking to match employer replies."
        />
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
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger, #b91c1c)" }}>
          {error}
        </p>
      )}
      <Button type="submit" variant="brand" size="lg" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>

      {showSavedToast && (
        <Toast
          message="Changes saved."
          durationSeconds={5}
          onDismiss={() => setShowSavedToast(false)}
        />
      )}
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
  help,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  required?: boolean
  maxLength?: number
  help?: string
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
      {help && (
        <span
          className="mt-1 block text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {help}
        </span>
      )}
    </label>
  )
}
