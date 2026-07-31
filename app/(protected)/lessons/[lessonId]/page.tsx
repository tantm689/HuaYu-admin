import { redirect } from "next/navigation"

interface Props {
  params: Promise<{ lessonId: string }>
}

// The dedicated read-only lesson page was merged into the edit page, which
// already renders every tab read-only via its isEditable gate whenever the
// lesson isn't a draft. This redirect keeps old bookmarks/links working.
export default async function LessonPage({ params }: Props) {
  const { lessonId } = await params
  redirect(`/lessons/${lessonId}/edit`)
}
