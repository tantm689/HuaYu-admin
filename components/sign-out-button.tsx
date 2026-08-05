"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { createBrowserSupabase } from "@/lib/supabase/browser"

export default function SignOutButton() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="ml-auto"
    >
      {isSigningOut ? "Đang đăng xuất..." : "Đăng xuất"}
    </Button>
  )
}
