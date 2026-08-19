import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { CreateWorkPeriodInput } from "../../types/planning";
import { humanizePlanningCode, WORK_PERIOD_STATUSES } from "./planningSchemas";
import { useCreateWorkPeriod, useWorkPeriods } from "./usePlanning";

function today() { return new Date().toISOString().slice(0, 10); }

type FormState = { workDate: string; periodCode: string; name: string; startTime: string; endTime: string };

const initialForm: FormState = {
  workDate: today(),
  periodCode: "DAY",
  name: "06:00-18:00",
  startTime: "06:00",
  endTime: "18:00",
};

export function WorkPeriodsPage() {
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
      setValidation("Complete the work date, period code, name, start time, and end time.");
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
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Planning</p>
            <h1 className="text-2xl font-bold text-gray-950">Work Periods</h1>
            <p className="text-sm text-gray-500">Plan shift assignments, inform collaborators, and record actual outcomes.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/collaborators" className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm">Collaborators</Link>
            {canManageGoldProduction ? (
              <Link to="/gold-production" className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm">Gold Production</Link>
            ) : null}
            <button onClick={() => setShowCreate((value) => !value)} className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">{showCreate ? "Close" : "Add Work Period"}</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-4">
        <ApiErrorPanel error={query.error || createMutation.error} />
        {validation && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{validation}</div>}

        {showCreate && (
          <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-medium text-gray-700">Work Date *<input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">Period Code *<input value={form.periodCode} onChange={(e) => setForm({ ...form, periodCode: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">Starts *<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <label className="text-sm font-medium text-gray-700">Ends *<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
            <div className="sm:col-span-2 lg:col-span-5 flex justify-end"><button disabled={createMutation.isPending} className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-gray-400">{createMutation.isPending ? "Creating..." : "Create Work Period"}</button></div>
          </form>
        )}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <label className="text-sm font-medium text-gray-700">Status filter<select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-3 rounded-xl border bg-white px-3 py-2"><option value="">All statuses</option>{WORK_PERIOD_STATUSES.map((row) => <option key={row} value={row}>{humanizePlanningCode(row)}</option>)}</select></label>
        </section>

        {query.isLoading && <div className="rounded-2xl border bg-white p-5 shadow-sm">Loading work periods...</div>}
        {!query.isLoading && !query.error && periods.length === 0 && <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><h2 className="text-lg font-semibold">No work periods yet</h2><p className="mt-2 text-sm text-gray-500">Create the first shift-like work period to begin planning.</p></div>}
        {periods.length > 0 && <div className="grid gap-4 md:grid-cols-2">{periods.map((row) => <Link key={row.id} to={`/work-periods/${row.id}`} className="rounded-2xl border bg-white p-5 shadow-sm transition hover:border-gray-400"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{row.workDate} · {row.periodCode}</p><h2 className="mt-1 text-lg font-semibold text-gray-950">{row.name}</h2><p className="mt-2 text-sm text-gray-500">{formatTime(row.startsAt)}–{formatTime(row.endsAt)}</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{humanizePlanningCode(row.status)}</span></div></Link>)}</div>}
      </section>
    </main>
  );
}

function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
