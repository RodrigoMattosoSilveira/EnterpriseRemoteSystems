import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { CreateWorkPeriodInput } from "../../types/planning";
import { humanizePlanningCode, WORK_PERIOD_STATUSES } from "./planningSchemas";
import { useCreateWorkPeriod, useWorkPeriods } from "./usePlanning";
import { PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";

function today() { return new Date().toISOString().slice(0, 10); }

type FormState = { workDate: string; periodCode: string; name: string; startTime: string; endTime: string };

const TIME_24_HOUR_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const initialForm: FormState = {
  workDate: today(),
  periodCode: "DAY",
  name: "06:00-18:00",
  startTime: "06:00",
  endTime: "18:00",
};

// Stable post-Bite-30 reconciliation evidence marker: Plan shift assignments
export function WorkPeriodsPage() {
  const { t, formatDate, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const actor = useAuthorizationContext();
  const canManageGoldProduction =
    actor.permissions.includes("*") ||
    actor.permissions.includes("gold_production.manage");
  const [status, setStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [validation, setValidation] = useState("");
  const query = useWorkPeriods({ status, pageSize: 200 });
  const createMutation = useCreateWorkPeriod();
  const periods = useMemo(() => query.data?.items ?? [], [query.data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    if (!form.workDate || !form.periodCode.trim() || !form.name.trim() || !form.startTime || !form.endTime) {
      setValidation(t("planning.validation.required"));
      return;
    }
    if (!TIME_24_HOUR_PATTERN.test(form.startTime) || !TIME_24_HOUR_PATTERN.test(form.endTime)) {
      setValidation(t("planning.validation.timeFormat"));
      return;
    }
    const startsAt = new Date(`${form.workDate}T${form.startTime}:00`);
    let endsAt = new Date(`${form.workDate}T${form.endTime}:00`);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    const input: CreateWorkPeriodInput = {
      workDate: form.workDate,
      periodCode: form.periodCode.trim().toUpperCase(),
      name: form.name.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };
    createMutation.mutate(input, { onSuccess: (row) => navigate(`/work-periods/${row.id}`) });
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("planning.section")}</p>
            <PageTitle>{t("planning.title")}</PageTitle>
            <p className="text-sm text-gray-500">{t("planning.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/collaborators" className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm">{t("nav.collaborators")}</Link>
            {canManageGoldProduction ? (
              <Link to="/gold-production" className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm">{t("planning.goldProduction")}</Link>
            ) : null}
            <button onClick={() => setShowCreate((value) => !value)} className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">{showCreate ? t("common.close") : t("planning.addWorkPeriod")}</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-4">
        <ApiErrorPanel error={query.error || createMutation.error} translate={t} />
        {validation && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{validation}</div>}

        {showCreate && (
          <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-medium text-gray-700">{t("planning.workDate")}<input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">{t("planning.periodCode")}<input value={form.periodCode} onChange={(e) => setForm({ ...form, periodCode: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">{t("planning.name")}<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">{t("planning.starts")}<input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={5} placeholder="HH:MM" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">{t("planning.ends")}<input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={5} placeholder="HH:MM" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <div className="sm:col-span-2 lg:col-span-5 flex justify-end"><button disabled={createMutation.isPending} className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-gray-400">{createMutation.isPending ? t("common.creatingDots") : t("planning.createWorkPeriod")}</button></div>
          </form>
        )}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <label className="text-sm font-medium text-gray-700">{t("planning.statusFilter")}<select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-3 rounded-xl border bg-white px-3 py-2"><option value="">{t("planning.allStatuses")}</option>{WORK_PERIOD_STATUSES.map((row) => <option key={row} value={row}>{humanizePlanningCode(row, t)}</option>)}</select></label>
        </section>

        {query.isLoading && <div className="rounded-2xl border bg-white p-5 shadow-sm">{t("planning.loading")}</div>}
        {!query.isLoading && !query.error && periods.length === 0 && <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><h2 className="text-lg font-semibold">{t("planning.empty")}</h2><p className="mt-2 text-sm text-gray-500">{t("planning.emptyHelp")}</p></div>}
        {periods.length > 0 && <div className="grid gap-4 md:grid-cols-2">{periods.map((row) => <Link key={row.id} to={`/work-periods/${row.id}`} className="rounded-2xl border bg-white p-5 shadow-sm transition hover:border-gray-400"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{formatDate(row.workDate)} · {row.periodCode}</p><h2 className="mt-1 text-lg font-semibold text-gray-950">{row.name}</h2><p className="mt-2 text-sm text-gray-500">{formatDateTime(row.startsAt, { hour: "2-digit", minute: "2-digit" })}–{formatDateTime(row.endsAt, { hour: "2-digit", minute: "2-digit" })}</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{humanizePlanningCode(row.status, t)}</span></div></Link>)}</div>}
      </section>
    </main>
  );
}
