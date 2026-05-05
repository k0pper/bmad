import { auth, signOut } from "@/lib/auth"

async function signOutAction() {
  "use server"
  await signOut({ redirectTo: "/login" })
}

export async function UserMenu() {
  const session = await auth()
  if (!session?.user) return null

  const { name, email } = session.user

  return (
    <div className="flex flex-col gap-2">
      <div className="min-w-0">
        {name && (
          <p className="truncate text-sm font-medium text-text-primary">{name}</p>
        )}
        {email && (
          <p className="truncate text-xs text-text-secondary">{email}</p>
        )}
      </div>

      <form action={signOutAction}>
        <button
          type="submit"
          className="w-full rounded-md px-3 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
