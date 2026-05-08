"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  deleteUserAccount,
  type SettingsActionState,
} from "@/app/(dashboard)/settings/actions"

const DELETE_KEYWORD = "DELETE"

export function AccountDangerZone() {
  const [deleteState, deleteAction, deleteIsPending] = useActionState<
    SettingsActionState,
    FormData
  >(deleteUserAccount, null)
  const [deleteConfirm, setDeleteConfirm] = useState("")

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium" style={{ color: "var(--color-danger)" }}>
          Delete account
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
      </div>
      {deleteState?.type === "error" && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {deleteState.message}
        </p>
      )}
      <form action={deleteAction} className="space-y-3">
        <div className="space-y-1.5">
          <label
            htmlFor="deleteConfirm"
            className="block text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Type{" "}
            <span className="font-mono font-semibold" style={{ color: "var(--color-text-primary)" }}>
              DELETE
            </span>{" "}
            to confirm
          </label>
          <input
            id="deleteConfirm"
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        <Button
          type="submit"
          variant="destructive"
          disabled={deleteConfirm !== DELETE_KEYWORD || deleteIsPending}
          aria-disabled={deleteConfirm !== DELETE_KEYWORD || deleteIsPending}
        >
          {deleteIsPending ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </div>
  )
}
