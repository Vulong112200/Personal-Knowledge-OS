"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

interface Me {
  id: string;
  email: string;
}

export function SettingsView() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");

  const { data: me } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => apiFetch("/me"),
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
