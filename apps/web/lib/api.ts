import { createClient } from "@/lib/supabase/client";

export async function apiFetch(path: string, init?: RequestInit) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Token expired / invalid — sign out and bounce to login rather than leaving the user
    // staring at silent failures until the next navigation.
    if (res.status === 401 && typeof window !== "undefined") {
      await supabase.auth.signOut().catch(() => {});
      window.location.href = "/login";
    }
    throw new Error(body.message ?? `Request failed with ${res.status}`);
  }

  if (res.status === 204) return undefined;
  return res.json();
}
