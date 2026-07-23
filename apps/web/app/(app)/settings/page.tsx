import { SettingsView } from "./settings-view";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your account." />
      <SettingsView />
    </>
  );
}
