type ActionSuccessDialogProps = {
  message: string;
  onDismiss: () => void;
  title?: string;
};

export function ActionSuccessDialog({
  message,
  onDismiss,
  title = "Action completed",
}: ActionSuccessDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4">
      <div
        aria-describedby="action-success-description"
        aria-labelledby="action-success-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-green-200 bg-white p-6 shadow-2xl"
        role="alertdialog"
      >
        <h2 id="action-success-title" className="text-xl font-bold text-green-900">
          {title}
        </h2>
        <p id="action-success-description" className="mt-3 text-base font-semibold text-gray-800">
          {message}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            autoFocus
            className="rounded-xl bg-green-800 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            onClick={onDismiss}
            type="button"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
