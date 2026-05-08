import { signOutAccount } from "@/app/(dashboard)/settings/actions"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  return (
    <form action={signOutAccount}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        data-testid="sign-out-button"
      >
        Sign out
      </Button>
    </form>
  )
}
