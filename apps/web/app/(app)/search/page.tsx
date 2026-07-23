import { SearchView } from "./search-view";
import { PageHeader } from "@/components/page-header";

export default function SearchPage() {
  return (
    <>
      <PageHeader title="Search" description="Full-text search across your documents." />
      <SearchView />
    </>
  );
}
