import { DocumentsView } from "./documents-view";
import { PageHeader } from "@/components/page-header";

export default function DocumentsPage() {
  return (
    <>
      <PageHeader title="Documents" description="Upload and manage your knowledge base." />
      <DocumentsView />
    </>
  );
}
