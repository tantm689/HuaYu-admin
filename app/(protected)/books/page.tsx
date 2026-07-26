import Link from "next/link"
import { createServerSupabase } from "@/lib/supabase/server"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Book } from "@/lib/db/types"

// This page reads live DB state on every request; without this, Next.js
// prerenders it once at build time and it goes permanently stale in prod.
export const dynamic = "force-dynamic"

export default async function BooksPage() {
  const supabase = createServerSupabase()
  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false })

  const rows = (books ?? []) as Book[]

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sách</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý sách giáo khoa và các bài học được trích xuất.
          </p>
        </div>
        <Button render={<Link href="/books/new">Thêm sách mới</Link>} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Chưa có sách nào. Hãy tải lên một tệp PDF để bắt đầu.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((book) => (
            <Link key={book.id} href={`/books/${book.id}`}>
              <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
                <CardHeader>
                  <CardTitle>{book.title}</CardTitle>
                  <CardDescription>
                    {book.volume ? `Tập ${book.volume} · ` : ""}
                    {new Date(book.created_at).toLocaleDateString("vi-VN")}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
