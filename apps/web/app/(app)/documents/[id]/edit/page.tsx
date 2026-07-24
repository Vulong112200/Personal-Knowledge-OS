import { EditNoteView } from "./edit-note-view";

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditNoteView documentId={id} />;
}
