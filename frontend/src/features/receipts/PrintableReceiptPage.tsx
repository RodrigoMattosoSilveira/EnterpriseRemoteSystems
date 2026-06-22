import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { PrintableReceipt } from "../../types/receipts";
import {
  canPrintReceipt,
  canReturnReceipt,
  isReceiptTerminal,
  receiptLifecycleSteps,
  receiptStatusLabel,
  receiptStatusTone,
} from "./receiptLifecycle";
import { usePrintableReceipt, usePrintReceipt, useReturnReceipt } from "./useReceipt";

export function PrintableReceiptPage() {
  const { entryId = "" } = useParams();
  const receipt = usePrintableReceipt(entryId);
  const printReceipt = usePrintReceipt(entryId);
  const returnReceipt = useReturnReceipt(entryId);
  const [signedDocumentRef, setSignedDocumentRef] = useState("");
  const [notes, setNotes] = useState("");

  async function print() {
    await printReceipt.mutateAsync();
    window.print();
  }

  async function recordReturned() {
    await returnReceipt.mutateAsync({ signedDocumentRef, notes });
  }

  if (receipt.isLoading) return <main className="p-6">Loading receipt...</main>;
  if (receipt.error) return <main className="p-6"><ApiErrorPanel error={receipt.error} /></main>;
  if (!receipt.data) return <main className="p-6">Receipt not found.</main>;

  const data = receipt.data;
  const canPrint = canPrintReceipt(data);
  const canReturn = canReturnReceipt(data);
  const terminal = isReceiptTerminal(data.status);
  const signedDocumentReady = signedDocumentRef.trim().length > 0;

  return (
    <main className="min-h-screen bg-gray-100 p-4 print:bg-white print:p-0">
      <section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
        <div className="print:hidden">
          <Link className="text-sm font-semibold underline" to={`/collaborators/${data.collaboratorId}`}>Back to Collaborator</Link>

          <ReceiptLifecyclePanel receipt={data} />

          <div className="mt-4 grid gap-4 rounded-2xl border p-4">
            <div>
              <h2 className="text-lg font-bold">Print lifecycle step</h2>
              <p className="mt-1 text-sm text-gray-600">
                Print uses the current authorized actor from Authz Admin. Operators do not enter an internal receipt key or actor override.
              </p>
            </div>
            {terminal ? (
              <p className="rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-700">
                {receiptStatusLabel(data.status)} is a terminal status. This receipt cannot be printed again from the lifecycle workflow.
              </p>
            ) : null}
            <button type="button" disabled={!canPrint || printReceipt.isPending} onClick={print} className="rounded-xl bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {printReceipt.isPending ? "Preparing..." : canPrint ? "Print Receipt" : `Receipt ${receiptStatusLabel(data.status).toLowerCase()}`}
            </button>
            {printReceipt.error ? <ApiErrorPanel error={printReceipt.error} /> : null}
          </div>

          <div className="mt-4 grid gap-4 rounded-2xl border p-4">
            <div>
              <h2 className="text-lg font-bold">Signed receipt return</h2>
              <p className="mt-1 text-sm text-gray-600">
                Record this once the collaborator has signed the printed receipt and returned it to the office. The backend records the current authorized actor as the receiver.
              </p>
            </div>
            {terminal ? (
              <p className="rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-700">
                {receiptStatusLabel(data.status)} is a terminal status. Return details are locked.
              </p>
            ) : null}
            <label className="grid gap-1 text-sm font-medium">
              <span>Signed document reference <span className="text-red-700">*</span></span>
              <input className="rounded-xl border px-3 py-2" placeholder="Binder, scan filename, or storage reference" value={signedDocumentRef} onChange={(e) => setSignedDocumentRef(e.target.value)} disabled={!canReturn} required aria-describedby="signed-document-ref-help" />
              <span id="signed-document-ref-help" className="text-xs text-gray-500">Required before a receipt can be marked returned.</span>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span>Notes</span>
              <textarea className="min-h-20 rounded-xl border px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canReturn} />
            </label>
            <button type="button" disabled={!canReturn || !signedDocumentReady || returnReceipt.isPending} onClick={recordReturned} className="rounded-xl bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {returnReceipt.isPending ? "Recording..." : data.status === "RETURNED" ? "Receipt returned" : !signedDocumentReady && canReturn ? "Enter signed document reference first" : "Record signed return"}
            </button>
            {returnReceipt.error ? <ApiErrorPanel error={returnReceipt.error} /> : null}
          </div>
        </div>

        <header className="mt-8 border-b pb-5 text-center print:mt-0">
          <p className="text-sm font-semibold uppercase tracking-widest">Enterprise Remote Systems</p>
          <h1 className="mt-2 text-3xl font-bold">Receipt</h1>
          <p className="mt-2 font-mono text-sm">{data.receiptNumber}</p>
        </header>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Collaborator" value={data.collaboratorLabel} />
          <Item label="Legal name" value={data.collaboratorLegalName} />
          <Item label="CPF" value={data.collaboratorCpf} />
          <Item label="Effective date" value={data.effectiveDate} />
          <Item label="Transaction" value={humanize(data.entryType)} />
          <Item label="Amount" value={formatAmount(data.amount, data.valueUnitCode)} />
          <Item label="Status" value={receiptStatusLabel(data.status)} />
          <Item label="Issued by" value={data.issuedBy || "Pending print"} />
          <Item label="Printed at" value={formatDateTime(data.printedAt) || "Not printed"} />
          <Item label="Signed at" value={formatDateTime(data.signedAt) || "Not signed"} />
          <Item label="Returned at" value={formatDateTime(data.returnedAt) || "Not returned"} />
          <Item label="Received by" value={data.receivedBy || "Not returned"} />
          <Item label="Signed document" value={data.signedDocumentRef || "Not recorded"} />
        </dl>

        <div className="mt-6 rounded-xl border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</p>
          <p className="mt-2">{data.description || "Account deduction"}</p>
        </div>

        {data.notes ? <div className="mt-4 rounded-xl border p-4 print:hidden"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Return notes</p><p className="mt-2 whitespace-pre-wrap">{data.notes}</p></div> : null}

        <div className="mt-16 grid gap-10 sm:grid-cols-2">
          <Signature label="Collaborator signature" />
          <Signature label="Office administrator" />
        </div>
        <p className="mt-10 text-xs text-gray-500">By signing, the collaborator acknowledges this deduction from their current account.</p>
      </section>
    </main>
  );
}

function ReceiptLifecyclePanel({ receipt }: { receipt: PrintableReceipt }) {
  const steps = receiptLifecycleSteps(receipt);

  return (
    <section className="mt-4 rounded-2xl border p-4" aria-label="Receipt lifecycle">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Receipt lifecycle</h2>
          <p className="mt-1 text-sm text-gray-600">Follow the required status sequence before the receipt leaves the outstanding list.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${receiptStatusTone(receipt.status)}`}>
          {receiptStatusLabel(receipt.status)}
        </span>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-4">
        {steps.map((step) => (
          <li key={step.key} className={`rounded-xl border p-3 ${step.completed ? "bg-green-50" : "bg-gray-50"}`}>
            <p className="text-sm font-bold">{step.completed ? "✓" : "○"} {step.label}</p>
            <p className="mt-1 text-xs text-gray-600">{step.detail}</p>
          </li>
        ))}
      </ol>
      {isReceiptTerminal(receipt.status) ? (
        <p className="mt-3 rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-700">Terminal status: no further lifecycle mutations are allowed.</p>
      ) : null}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-gray-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Signature({ label }: { label: string }) { return <div className="border-t pt-2 text-center text-sm">{label}</div>; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " "); }
function formatAmount(value: number, unit: string) { return unit === "BRL" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value) : `${value.toFixed(2)} g`; }
function formatDateTime(value?: string) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : ""; }
