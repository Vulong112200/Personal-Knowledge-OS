import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) redirect("/login");
  return data.session;
}
