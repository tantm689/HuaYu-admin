import Link from "next/link"

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/80">
        <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/books" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              HY
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              HuaYu Admin
            </span>
          </Link>
          <Link
            href="/books"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Books
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
