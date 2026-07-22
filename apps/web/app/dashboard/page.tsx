import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

interface Me {
  id: string;
  email: string;
  displayName: string | null;
  defaultWorkspaceId: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    redirect("/login");
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-red-600">
          API returned {res.status} — is apps/api running on {process.env.NEXT_PUBLIC_API_BASE_URL}?
        </p>
      </div>
    );
  }

  const me: Me = await res.json();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Dashboard</h1>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">User ID</dt>
            <dd className="truncate text-black dark:text-zinc-50">{me.id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Email</dt>
            <dd className="truncate text-black dark:text-zinc-50">{me.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Workspace ID</dt>
            <dd className="truncate text-black dark:text-zinc-50">{me.defaultWorkspaceId}</dd>
          </div>
        </dl>
        <LogoutButton />
      </div>
    </div>
  );
}
