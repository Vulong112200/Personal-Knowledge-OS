import { requireSession } from "@/lib/auth";
import { Sidebar } from "@/components/nav/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar email={session.user.email ?? ""} />
      <main className="flex min-h-screen flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
