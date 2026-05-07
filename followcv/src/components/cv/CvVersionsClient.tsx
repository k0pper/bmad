"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, FileText, MoreHorizontal } from "lucide-react"
import { Menu } from "@base-ui/react/menu"
import { Button } from "@/components/ui/button"
import { Toast } from "@/components/ui/Toast"
import { CvUploadDialog } from "./CvUploadDialog"
import { CvPreview } from "./CvPreview"
import { formatFileSize } from "./formatFileSize"
import {
  renameCvVersion,
  restoreCvVersion,
  deleteCvVersion,
} from "@/actions/manage-cv"

type CvVersionRow = {
  id: string
  name: string
  fileSize: number
  uploadedAt: Date
  hasSnapshots: boolean
}

type CapInfo = {
  count: number
  cap: number | null
  isPro: boolean
}

type Props = {
  versions: CvVersionRow[]
  cap: CapInfo
}

export function CvVersionsClient({ versions, cap }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [renameErrors, setRenameErrors] = useState<Record<string, string>>({})
  const [restorePendingId, setRestorePendingId] = useState<string | null>(null)
  const [deleteInFlight, setDeleteInFlight] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function getDisplayName(id: string, fallback: string) {
    return nameOverrides[id] ?? fallback
  }

  function clearRenameError(id: string) {
    setRenameErrors((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function handleRename(id: string, newName: string, oldName: string) {
    setNameOverrides((prev) => ({ ...prev, [id]: newName }))
    clearRenameError(id)
    setEditingId(null)
    const result = await renameCvVersion({ id, name: newName })
    if (result.error) {
      setNameOverrides((prev) => ({ ...prev, [id]: oldName }))
      setRenameErrors((prev) => ({ ...prev, [id]: result.error! }))
    } else {
      router.refresh()
    }
  }

  async function handleRestore(id: string) {
    if (restorePendingId) return
    setRestorePendingId(id)
    try {
      const result = await restoreCvVersion({ id })
      if (result.error) {
        setToast(result.error)
      } else {
        router.refresh()
      }
    } finally {
      setRestorePendingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (deleteInFlight) return
    setDeleteInFlight(true)
    try {
      const result = await deleteCvVersion({ id })
      setPendingDeleteId(null)
      if (result.error) {
        setToast(result.error)
      } else {
        router.refresh()
      }
    } finally {
      setDeleteInFlight(false)
    }
  }

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">CVs</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {cap.isPro ? (
              <>Unlimited storage on Pro.</>
            ) : (
              <>
                {cap.count} / {cap.cap} versions used.
                {cap.cap !== null && cap.count >= cap.cap && (
                  <>
                    {" "}
                    <span style={{ color: "var(--color-danger)" }}>
                      Upgrade to Pro for unlimited.
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="brand"
          size="lg"
          onClick={() => setDialogOpen(true)}
        >
          Upload CV
        </Button>
      </div>

      {versions.length === 0 ? (
        <EmptyState onUpload={() => setDialogOpen(true)} />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {versions.map((cv, index) => (
            <CvCard
              key={cv.id}
              cv={{ ...cv, name: getDisplayName(cv.id, cv.name) }}
              isActive={index === 0}
              isEditing={editingId === cv.id}
              isPendingDelete={pendingDeleteId === cv.id}
              renameError={renameErrors[cv.id] ?? null}
              restorePending={restorePendingId === cv.id}
              deleteInFlight={deleteInFlight && pendingDeleteId === cv.id}
              onEditStart={() => {
                clearRenameError(cv.id)
                setEditingId(cv.id)
              }}
              onRename={(newName) =>
                handleRename(cv.id, newName, getDisplayName(cv.id, cv.name))
              }
              onEditCancel={() => setEditingId(null)}
              onRestore={() => handleRestore(cv.id)}
              onDeleteRequest={() => setPendingDeleteId(cv.id)}
              onDeleteConfirm={() => handleDelete(cv.id)}
              onDeleteCancel={() => setPendingDeleteId(null)}
            />
          ))}
        </ul>
      )}

      <CvUploadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {toast && (
        <Toast message={toast} durationSeconds={5} onDismiss={() => setToast(null)} />
      )}
    </>
  )
}

type CvCardProps = {
  cv: CvVersionRow
  isActive: boolean
  isEditing: boolean
  isPendingDelete: boolean
  renameError: string | null
  restorePending: boolean
  deleteInFlight: boolean
  onEditStart: () => void
  onRename: (newName: string) => void
  onEditCancel: () => void
  onRestore: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

function CvCard({
  cv,
  isActive,
  isEditing,
  isPendingDelete,
  renameError,
  restorePending,
  deleteInFlight,
  onEditStart,
  onRename,
  onEditCancel,
  onRestore,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: CvCardProps) {
  const cardRef = useRef<HTMLLIElement>(null)

  function focusTrigger() {
    cardRef.current
      ?.querySelector<HTMLButtonElement>('[aria-label="CV version actions"]')
      ?.focus()
  }

  const dateLabel = new Date(cv.uploadedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  return (
    <li
      ref={cardRef}
      id={cv.id}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-background transition-shadow duration-150 hover:shadow-md"
    >
      <div className="relative">
        <CvPreview url={`/api/cv/${cv.id}/file`} name={cv.name} />
        {isActive && (
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shadow-sm"
            style={{
              backgroundColor: "var(--color-vitality-active-bg)",
              color: "var(--color-vitality-active-text)",
            }}
          >
            Active
          </span>
        )}
      </div>
      <div className="flex flex-col border-t border-border p-3 gap-2">
        {/* Name row — editable or static */}
        {isEditing ? (
          <RenameInput
            initialName={cv.name}
            cardId={cv.id}
            renameError={renameError}
            onCommit={onRename}
            onCancel={() => {
              onEditCancel()
              focusTrigger()
            }}
            onCommitFinish={focusTrigger}
          />
        ) : (
          <p
            className="truncate text-sm font-medium text-text-primary"
            title={cv.name}
          >
            {cv.name}
          </p>
        )}
        {renameError && (
          <p
            id={`${cv.id}-rename-error`}
            role="alert"
            className="text-xs"
            style={{ color: "var(--color-danger, #dc2626)" }}
          >
            {renameError}
          </p>
        )}
        <p className="text-xs text-text-tertiary">
          {dateLabel} · {formatFileSize(cv.fileSize)}
        </p>

        {/* Footer actions */}
        {isPendingDelete ? (
          <DeleteConfirmRow
            inFlight={deleteInFlight}
            onConfirm={onDeleteConfirm}
            onCancel={() => {
              onDeleteCancel()
              focusTrigger()
            }}
          />
        ) : (
          <div className="flex items-center gap-1">
            <a
              href={`/api/cv/${cv.id}/file?download=1`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Download ${cv.name}`}
              className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Download size={14} aria-hidden />
              Download
            </a>
            <div className="ml-auto">
              <CardActionsMenu
                isActive={isActive}
                hasSnapshots={cv.hasSnapshots}
                restorePending={restorePending}
                onRename={onEditStart}
                onRestore={onRestore}
                onDelete={onDeleteRequest}
              />
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

function RenameInput({
  initialName,
  cardId,
  renameError,
  onCommit,
  onCancel,
  onCommitFinish,
}: {
  initialName: string
  cardId: string
  renameError: string | null
  onCommit: (newName: string) => void
  onCancel: () => void
  onCommitFinish: () => void
}) {
  const [value, setValue] = useState(initialName)
  // Guard against double-fire when Enter triggers commit and a follow-up blur
  // (or programmatic focus loss) re-enters before the input unmounts.
  const submittedRef = useRef(false)

  function commit() {
    if (submittedRef.current) return
    const trimmed = value.trim()
    if (!trimmed || trimmed === initialName) {
      onCancel()
      return
    }
    submittedRef.current = true
    onCommit(trimmed)
    onCommitFinish()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commit()
    } else if (e.key === "Escape") {
      onCancel()
    }
  }

  return (
    <input
      className="w-full rounded border border-brand px-2 py-0.5 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/40"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      autoFocus
      aria-label="Rename CV version"
      aria-invalid={renameError ? "true" : undefined}
      aria-describedby={renameError ? `${cardId}-rename-error` : undefined}
    />
  )
}

function DeleteConfirmRow({
  inFlight,
  onConfirm,
  onCancel,
}: {
  inFlight: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1 text-xs text-text-secondary">Delete this version?</span>
      <button
        type="button"
        onClick={onConfirm}
        disabled={inFlight}
        className="rounded px-2 py-0.5 text-[0.8rem] font-medium text-white transition-colors disabled:opacity-60"
        style={{ backgroundColor: "var(--color-danger, #dc2626)" }}
      >
        {inFlight ? "Deleting…" : "Delete"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={inFlight}
        className="rounded px-2 py-0.5 text-[0.8rem] font-medium text-text-secondary transition-colors hover:bg-muted disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  )
}

type CardActionsMenuProps = {
  isActive: boolean
  hasSnapshots: boolean
  restorePending: boolean
  onRename: () => void
  onRestore: () => void
  onDelete: () => void
}

function CardActionsMenu({
  isActive,
  hasSnapshots,
  restorePending,
  onRename,
  onRestore,
  onDelete,
}: CardActionsMenuProps) {
  const itemBase =
    "flex items-center px-3 py-1.5 outline-none data-[highlighted]:bg-slate-100"
  const itemEnabled = "cursor-pointer"
  const itemDisabled = "cursor-not-allowed opacity-50"

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="CV version actions"
        className="inline-flex h-7 w-7 items-center justify-center rounded-[min(var(--radius-md),12px)] text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        render={<button type="button" />}
      >
        <MoreHorizontal size={16} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-[60]">
          <Menu.Popup
            className="z-[60] rounded-md border bg-white py-1 text-sm shadow-md"
            style={{
              borderColor: "var(--color-border, #e2e8f0)",
              minWidth: "140px",
            }}
          >
            <Menu.Item
              onClick={onRename}
              className={`${itemBase} ${itemEnabled}`}
            >
              Rename
            </Menu.Item>
            {!isActive && (
              <Menu.Item
                onClick={restorePending ? undefined : onRestore}
                disabled={restorePending}
                className={`${itemBase} ${restorePending ? itemDisabled : itemEnabled}`}
              >
                {restorePending ? "Setting active…" : "Use as current"}
              </Menu.Item>
            )}
            <Menu.Item
              onClick={hasSnapshots ? undefined : onDelete}
              disabled={hasSnapshots}
              title={
                hasSnapshots
                  ? "This CV is attached to an application and cannot be deleted."
                  : undefined
              }
              className={`${itemBase} ${hasSnapshots ? itemDisabled : itemEnabled}`}
              style={{ color: "var(--color-danger, #dc2626)" }}
            >
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-12 text-center">
      <FileText size={28} className="text-text-tertiary" aria-hidden />
      <p className="text-sm text-text-secondary">
        No CVs uploaded yet. Upload your first one to get started.
      </p>
      <Button type="button" variant="brand" size="sm" onClick={onUpload}>
        Upload CV
      </Button>
    </div>
  )
}
