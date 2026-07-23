import { TagsView } from "./tags-view";
import { PageHeader } from "@/components/page-header";

export default function TagsPage() {
  return (
    <>
      <PageHeader title="Tags" description="Browse your knowledge base by tag." />
      <TagsView />
    </>
  );
}
