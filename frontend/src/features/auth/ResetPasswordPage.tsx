import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../api/auth.api";
import { endAuthSession } from "../../app/authStore";
import { AuthCard, AuthField, primaryButtonClass } from "./AuthCard";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) return setError("The new passwords do not match.");
    setSubmitting(true); setError("");
    try {
      const result = await resetPassword({ token, newPassword });
      queryClient.clear();
      await endAuthSession();
      navigate("/login", {
        replace: true,
        state: {
          message: `Password reset for ${result.login}. Sign in with your new password.`,
          login: result.login,
        },
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reset password."); }
    finally { setSubmitting(false); }
  }

  return <AuthCard title="Reset password" subtitle="Enter the one-time token issued by an Application Administrator.">
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <form onSubmit={submit} className="space-y-4">
      <AuthField label="Reset token" value={token} onChange={(e) => setToken(e.target.value)} required />
      <AuthField label="New password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
      <AuthField label="Confirm new password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
      <button className={primaryButtonClass} disabled={submitting}>{submitting ? "Resetting…" : "Reset password"}</button>
    </form>
    <p className="mt-5 text-center text-sm"><Link className="underline" to="/login">Back to sign in</Link></p>
  </AuthCard>;
}
