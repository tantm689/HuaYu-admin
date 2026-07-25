import Link from "next/link"
import { createServerSupabase } from "@/lib/supabase/server"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Book } from "@/lib/db/types"

export default async function BooksPage() {
  const supabase = createServerSupabase()
  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false })

  const rows = (books ?? []) as Book[]

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sách</h1>
        <Button render={<Link href="/books/new">Thêm sách mới</Link>} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có sách nào. Hãy tải lên một tệp PDF để bắt đầu.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((book) => (
            <Link key={book.id} href={`/books/${book.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
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
