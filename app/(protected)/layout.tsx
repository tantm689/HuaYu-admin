import Link from "next/link"

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
          <span className="text-sm font-semibold">Admin</span>
          <Link
            href="/books"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Books
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
