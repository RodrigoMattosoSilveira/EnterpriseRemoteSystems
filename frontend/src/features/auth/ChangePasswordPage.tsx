import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../../api/auth.api";
import { endAuthSession } from "../../app/authStore";
import { AuthCard, AuthField, primaryButtonClass } from "./AuthCard";

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) return setError("The new passwords do not match.");
    setSubmitting(true); setError("");
    try {
      await changePassword({ currentPassword, newPassword });
      queryClient.clear();
      await endAuthSession();
      navigate("/login", { replace: true, state: { message: "Password changed. Sign in with your new password." } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change password."); }
    finally { setSubmitting(false); }
  }

  return <AuthCard title="Change password" subtitle="Choose a strong password of at least 12 characters.">
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <form onSubmit={submit} className="space-y-4">
      <AuthField label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
      <AuthField label="New password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
      <AuthField label="Confirm new password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
      <button className={primaryButtonClass} disabled={submitting}>{submitting ? "Changing…" : "Change password"}</button>
    </form>
  </AuthCard>;
}
