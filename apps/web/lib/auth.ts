import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireSession() {
  const supabase = await createClient();
  // Validate the user against the Supabase auth server first. getSession() alone only
  // decodes the cookie without revalidating it, so the auth gate must use getUser();
  // the session is still returned afterwards for its access_token (used by server fetches).
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/login");

  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/login");
  return data.session;
}
