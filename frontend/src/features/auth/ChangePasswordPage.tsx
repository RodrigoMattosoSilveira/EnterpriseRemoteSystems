import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../../api/auth.api";
import { endAuthSession } from "../../app/authStore";
import { useI18n } from "../../i18n";
import { AuthCard, AuthField, primaryButtonClass } from "./AuthCard";

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) return setError(t("auth.passwordMismatch"));
    setSubmitting(true); setError("");
    try {
      await changePassword({ currentPassword, newPassword });
      queryClient.clear();
      await endAuthSession();
      navigate("/login", { replace: true, state: { message: t("auth.change.success") } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("auth.change.unable")); }
    finally { setSubmitting(false); }
  }

  return <AuthCard title={t("auth.change.title")} subtitle={t("auth.change.subtitle")}>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <form onSubmit={submit} className="space-y-4">
      <AuthField label={t("auth.change.currentPassword")} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
      <AuthField label={t("auth.change.newPassword")} type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(e) => setNew(e.target.value)} required />
      <AuthField label={t("auth.change.confirmPassword")} type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
      <button className={primaryButtonClass} disabled={submitting}>{submitting ? t("auth.change.changing") : t("common.changePassword")}</button>
    </form>
  </AuthCard>;
}
