import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { usePrintableReceipt, usePrintReceipt, useReturnReceipt } from "./useReceipt";

export function PrintableReceiptPage() {
  const { entryId = "" } = useParams();
  const receipt = usePrintableReceipt(entryId);
  const printReceipt = usePrintReceipt(entryId);
  const returnReceipt = useReturnReceipt(entryId);
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [signedDocumentRef, setSignedDocumentRef] = useState("");
  const [notes, setNotes] = useState("");

  async function print() {
    await printReceipt.mutateAsync(authorizedBy);
    window.print();
  }

  async function recordReturned() {
    await returnReceipt.mutateAsync({
      authorizedBy: receivedBy,
      payload: { signedDocumentRef, notes },
    });
  }

  if (receipt.isLoading) return <main className="p-6">Loading receipt...</main>;
  if (receipt.error) return <main className="p-6"><ApiErrorPanel error={receipt.error} /></main>;
  if (!receipt.data) return <main className="p-6">Receipt not found.</main>;

  const data = receipt.data;
  const isReturned = data.status === "RETURNED";
  const isCancelled = data.status === "CANCELLED";

  return (
    <main className="min-h-screen bg-gray-100 p-4 print:bg-white print:p-0">
      <section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
        <div className="print:hidden">
          <Link className="text-sm font-semibold underline" to={`/collaborators/${data.collaboratorId}`}>Back to Collaborator</Link>
          <div className="mt-4 grid gap-4 rounded-2xl border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="grid flex-1 gap-1 text-sm font-medium">
                <span>Printed by</span>
                <input className="rounded-xl border px-3 py-2" value={authorizedBy} onChange={(e) => setAuthorizedBy(e.target.value)} />
              </label>
              <button type="button" disabled={!authorizedBy.trim() || printReceipt.isPending || isCancelled} onClick={print} className="rounded-xl bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
                {printReceipt.isPending ? "Preparing..." : "Print Receipt"}
              </button>
            </div>
            {printReceipt.error ? <ApiErrorPanel error={printReceipt.error} /> : null}
          </div>

          <div className="mt-4 grid gap-4 rounded-2xl border p-4">
            <div>
              <h2 className="text-lg font-bold">Signed receipt return</h2>
              <p className="mt-1 text-sm text-gray-600">Record this once the collaborator has signed the printed receipt and returned it to the office.</p>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              <span>Received by</span>
              <input className="rounded-xl border px-3 py-2" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} disabled={isReturned || isCancelled} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span>Signed document reference</span>
              <input className="rounded-xl border px-3 py-2" placeholder="Binder, scan filename, or storage reference" value={signedDocumentRef} onChange={(e) => setSignedDocumentRef(e.target.value)} disabled={isReturned || isCancelled} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span>Notes</span>
              <textarea className="min-h-20 rounded-xl border px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isReturned || isCancelled} />
            </label>
            <button type="button" disabled={!receivedBy.trim() || returnReceipt.isPending || isReturned || isCancelled} onClick={recordReturned} className="rounded-xl bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {returnReceipt.isPending ? "Recording..." : isReturned ? "Receipt returned" : "Record signed return"}
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
          <Item label="Status" value={humanize(data.status)} />
          <Item label="Issued by" value={data.issuedBy || "Pending print"} />
          <Item label="Printed at" value={formatDateTime(data.printedAt) || "Not printed"} />
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

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-gray-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Signature({ label }: { label: string }) { return <div className="border-t pt-2 text-center text-sm">{label}</div>; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " "); }
function formatAmount(value: number, unit: string) { return unit === "BRL" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value) : `${value.toFixed(8)} g`; }
function formatDateTime(value?: string) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : ""; }
