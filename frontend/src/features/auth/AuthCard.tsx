import { PageTitle } from "../../components/layout/PageHeading";
import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12">
      <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Enterprise Remote Systems</p>
        <PageTitle className="mt-3">{title}</PageTitle>
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}

export function AuthField({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      <input {...props} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" />
    </label>
  );
}

export const primaryButtonClass = "w-full rounded-xl bg-slate-900 px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60";
