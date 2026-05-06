import { auth, signOut } from "@/lib/auth"
import { Button } from "@/components/ui/button"

async function signOutAction() {
  "use server"
  await signOut({ redirectTo: "/login" })
}

export async function UserMenu() {
  const session = await auth()
  if (!session?.user) return null

  const { name, email } = session.user

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0">
        {name && (
          <p className="truncate text-sm font-medium text-text-primary">{name}</p>
        )}
        {email && (
          <p className="truncate text-xs text-text-secondary">{email}</p>
        )}
      </div>

      <form action={signOutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
        >
          Sign out
        </Button>
      </form>
    </div>
  )
}
