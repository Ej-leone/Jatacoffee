import { PasswordForm } from "@/components/admin/password-form";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Change password" };

export default async function PasswordPage() {
  const user = await requireAdmin();
  const forced = Boolean(user.must_change_password);

  return (
    <div className="card p-5">
      <h1 className="font-display text-xl font-bold text-espresso-900">
        {forced ? "Set a new password" : "Change password"}
      </h1>
      <p className="prose-note mt-1 mb-4">
        {forced
          ? "This account still uses the password it was set up with. Choose your own before you carry on."
          : "You will be signed out everywhere once the password changes."}
      </p>

      <PasswordForm />
    </div>
  );
}
