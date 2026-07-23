import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DocumentDetailView } from "./document-detail-view";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between p-8 pb-0">
        <Link
          href="/documents"
          className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          Back to documents
        </Link>
      </div>
      <DocumentDetailView documentId={id} />
    </div>
  );
}
