import Link from "next/link";
import { FileText, Search, Share2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Me {
  id: string;
  email: string;
  displayName: string | null;
  defaultWorkspaceId: string;
}

const QUICK_ACTIONS = [
  { href: "/documents", label: "Documents", description: "Upload and browse your files", icon: FileText },
  { href: "/search", label: "Search", description: "Full-text search your knowledge base", icon: Search },
  { href: "/graph", label: "Graph", description: "Explore how your documents connect", icon: Share2 },
];

export default async function DashboardPage() {
  const session = await requireSession();

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="p-6">
          <Card className="border-danger/30">
            <CardContent>
              <p className="text-sm text-danger">
                API returned {res.status} — is apps/api running on {process.env.NEXT_PUBLIC_API_BASE_URL}?
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const me: Me = await res.json();
  const displayName = me.displayName ?? me.email.split("@")[0];

  return (
    <>
      <PageHeader title={`Welcome back, ${displayName}`} description="Here's what's in your workspace." />
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">User ID</dt>
                <dd className="truncate text-foreground">{me.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate text-foreground">{me.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Workspace ID</dt>
                <dd className="truncate text-foreground">{me.defaultWorkspaceId}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-background-muted"
              >
                <action.icon className="size-4 text-primary" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
