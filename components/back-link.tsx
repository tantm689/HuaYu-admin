import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BackLinkProps {
  href: string
  label: string
}

export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={
        <Link href={href}>
          <ChevronLeft />
          {label}
        </Link>
      }
    />
  )
}
