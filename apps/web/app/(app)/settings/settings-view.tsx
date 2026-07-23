"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

interface Me {
  id: string;
  email: string;
  displayName: string | null;
}

export function SettingsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState("");
  const [displayName, setDisplayName] = useState("");

  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => apiFetch("/me"),
  });

  useEffect(() => {
    if (me) setDisplayName(me.displayName ?? "");
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: (name: string) =>
      apiFetch("/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const deleteAccount = useMutation({
    mutationFn: () => apiFetch("/me", { method: "DELETE" }),
    onSuccess: async () => {
      await createClient().auth.signOut();
      router.push("/login");
    },
  });

  const canDelete = !!me && confirmText.trim().toLowerCase() === me.email.toLowerCase();

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your display name is shown around the app.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="display-name">
            Display name
          </label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          {saveProfile.isError && (
            <p className="text-sm text-danger">{(saveProfile.error as Error).message}</p>
          )}
          {saveProfile.isSuccess && !saveProfile.isPending && (
            <p className="text-xs text-success">Saved.</p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            disabled={saveProfile.isPending || displayName === (me?.displayName ?? "")}
            onClick={() => saveProfile.mutate(displayName)}
          >
            {saveProfile.isPending ? "Saving..." : "Save"}
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-danger/30">
        <CardHeader>
          <CardTitle className="text-danger">Danger zone</CardTitle>
          <CardDescription>
            Deleting your account permanently removes your workspace, every document you&apos;ve uploaded, and
            all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="confirm-email">
            Type your email ({me?.email ?? "..."}) to confirm
          </label>
          <Input
            id="confirm-email"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={me?.email}
            autoComplete="off"
          />
          {deleteAccount.isError && (
            <p className="text-sm text-danger">{(deleteAccount.error as Error).message}</p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            variant="danger"
            disabled={!canDelete || deleteAccount.isPending}
            onClick={() => deleteAccount.mutate()}
          >
            {deleteAccount.isPending ? "Deleting..." : "Delete account"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
