import { DocumentDetailView } from "./document-detail-view";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DocumentDetailView documentId={id} />;
}
