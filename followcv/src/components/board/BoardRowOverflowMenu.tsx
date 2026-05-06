"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Menu } from "@base-ui/react/menu"
import { MoreHorizontal } from "lucide-react"
import { archiveListing, unarchiveListing } from "@/actions/listing"

type Props = {
  listingId: string
  archived: boolean
}

export function BoardRowOverflowMenu({ listingId, archived }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleAction() {
    startTransition(async () => {
      const action = archived ? unarchiveListing : archiveListing
      const result = await action(listingId)
      if (result.error === null) {
        router.refresh()
      }
    })
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={archived ? "Unarchive listing" : "Archive listing"}
        disabled={isPending}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        render={<button type="button" />}
      >
        <MoreHorizontal size={16} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end">
          <Menu.Popup
            className="min-w-[150px] rounded-md border bg-white py-1 shadow-md text-sm"
            style={{ borderColor: "var(--color-border, #e2e8f0)" }}
          >
            <Menu.Item
              onClick={handleAction}
              className="px-3 py-1.5 cursor-pointer data-[highlighted]:bg-slate-100 outline-none"
            >
              {archived ? "Unarchive" : "Archive"}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
