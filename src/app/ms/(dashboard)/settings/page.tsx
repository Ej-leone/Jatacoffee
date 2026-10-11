import Link from "next/link";
import { SettingsForm } from "@/components/admin/settings-form";
import { PageHeader } from "@/components/admin/ui";
import { getSettings } from "@/lib/queries";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Name, contact details and social links. Saving updates the live site straight away."
      />

      <section className="card p-4">
        <SettingsForm settings={settings} />
      </section>

      <p className="prose-note mt-4">
        Delivery fees and the minimum order live on{" "}
        <Link href="/ms/delivery" className="font-semibold underline">
          the delivery page
        </Link>
        .
      </p>
    </>
  );
}
