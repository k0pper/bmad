"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  deleteUserAccount,
  revokeGmailToken,
  type SettingsActionState,
} from "@/app/(dashboard)/settings/actions"

const DELETE_KEYWORD = "DELETE"

export function AccountDangerZone({ gmailConnected }: { gmailConnected: boolean }) {
  const [revokeState, revokeAction, revokeIsPending] = useActionState<
    SettingsActionState,
    FormData
  >(revokeGmailToken, null)
  const [deleteState, deleteAction, deleteIsPending] = useActionState<
    SettingsActionState,
    FormData
  >(deleteUserAccount, null)
  const [deleteConfirm, setDeleteConfirm] = useState("")

  const gmailRevoked = revokeState?.type === "success"
  const canRevoke = gmailConnected && !gmailRevoked && !revokeIsPending

  return (
    <div className="space-y-8">
      {/* Revoke Gmail */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            Gmail integration
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Disconnect your Gmail account. Your job listings and application data are not affected.
          </p>
        </div>
        {revokeState?.type === "success" && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm font-medium"
            style={{ color: "var(--color-success)" }}
          >
            Gmail access revoked successfully.
          </p>
        )}
        {revokeState?.type === "error" && (
          <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
            {revokeState.message}
          </p>
        )}
        <form action={revokeAction}>
          <Button
            type="submit"
            variant="outline"
            disabled={!canRevoke}
            aria-disabled={!canRevoke}
          >
            {revokeIsPending ? "Revoking…" : "Revoke Gmail access"}
          </Button>
        </form>
        {!gmailConnected && !gmailRevoked && (
          <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            No Gmail account connected.
          </p>
        )}
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Delete Account */}
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
    </div>
  )
}
