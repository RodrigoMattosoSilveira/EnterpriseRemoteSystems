const millisecondsPerDay = 24 * 60 * 60 * 1000;

type JourneyDaysRemainingProps = {
  projectedEndDate: string;
  closedAt?: string;
  className?: string;
};

type JourneyDaysPresentation = {
  daysRemaining: number;
  label: string;
  colorClass: string;
};

export function getJourneyDaysPresentation(
  projectedEndDate: string,
  now = new Date(),
  closedAt = "",
): JourneyDaysPresentation | null {
  if (closedAt.trim()) {
    return {
      daysRemaining: 0,
      label: "0 days remaining",
      colorClass: "text-red-700",
    };
  }

  const endDate = parseDateOnly(projectedEndDate);

  if (!endDate) {
    return null;
  }

  const today = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const daysRemaining = Math.round((endDate - today) / millisecondsPerDay);

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return {
      daysRemaining,
      label: `${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`,
      colorClass: "text-red-700",
    };
  }

  if (daysRemaining === 0) {
    return {
      daysRemaining,
      label: "Ends today",
      colorClass: "text-red-700",
    };
  }

  return {
    daysRemaining,
    label: `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} remaining`,
    colorClass:
      daysRemaining > 30
        ? "text-green-700"
        : daysRemaining > 7
          ? "text-yellow-700"
          : "text-red-700",
  };
}

export function JourneyDaysRemaining({
  projectedEndDate,
  closedAt = "",
  className = "",
}: JourneyDaysRemainingProps) {
  const presentation = getJourneyDaysPresentation(
    projectedEndDate,
    new Date(),
    closedAt,
  );

  if (!presentation) {
    return null;
  }

  return (
    <span
      className={["font-bold", presentation.colorClass, className]
        .filter(Boolean)
        .join(" ")}
    >
      {presentation.label}
    </span>
  );
}

function parseDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}
