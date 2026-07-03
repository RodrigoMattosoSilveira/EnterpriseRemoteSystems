import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanTab } from "./PlanTab";
import type {
  BulkPlanWorkPeriodAssignmentsInput,
  PlanAssignmentRefinementInput,
  PlanAssignmentRefinementResult,
  WorkPeriodPlanningTemplate,
} from "../../types/planning";
import type { ReferenceDataItem } from "../../types/referenceData";

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("PlanTab", () => {
  it("refines a collaborator assignment locally before selected-only plan save", async () => {
    const onBulkPlan = vi.fn();
    const onRefineAssignment = vi.fn(
      async (
        input: PlanAssignmentRefinementInput,
      ): Promise<PlanAssignmentRefinementResult> => ({
        ...input,
        futureDefaultsUpdated: false,
      }),
    );

    await renderPlanTab({ onBulkPlan, onRefineAssignment });

    await clickRowButton("Mineiro", "Plan Assignment");
    await changeVisibleSelect("Sector", "sector-processing");
    await changeVisibleSelect("Local", "location-yard");
    await changeVisibleSelect("Task", "task-loader");
    await clickButton("Apply refinement");

    expect(onRefineAssignment).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Assignment refinement applied to this Work Period plan",
    );

    await clickButton("Save plan (2 selected)");

    expect(onBulkPlan).toHaveBeenCalledWith({
      rows: [
        {
          collaboratorId: "collab-selected",
          selected: true,
          sectorId: "sector-mining",
          locationId: "location-main",
          taskId: "task-miner",
          planningAvailability: "ACTIVE",
          availabilityChanged: false,
        },
        {
          collaboratorId: "collab-mineiro",
          selected: true,
          sectorId: "sector-processing",
          locationId: "location-yard",
          taskId: "task-loader",
          planningAvailability: "ACTIVE",
          availabilityChanged: false,
        },
      ],
    });
  });

  it("updates future planning defaults only when explicitly selected", async () => {
    const onBulkPlan = vi.fn();
    const onRefineAssignment = vi.fn(
      async (
        input: PlanAssignmentRefinementInput,
      ): Promise<PlanAssignmentRefinementResult> => ({
        ...input,
        sectorLabel: "Processing",
        locationLabel: "Yard",
        taskLabel: "Loader",
        futureDefaultsUpdated: input.applyToFutureDefaults,
      }),
    );

    await renderPlanTab({ onBulkPlan, onRefineAssignment });

    await clickRowButton("Mineiro", "Plan Assignment");
    await changeVisibleSelect("Sector", "sector-processing");
    await changeVisibleSelect("Local", "location-yard");
    await changeVisibleSelect("Task", "task-loader");
    await changeCheckbox(
      "Use these values as future planning defaults for this Collaborator",
      true,
    );
    await clickButton("Apply refinement");

    expect(onRefineAssignment).toHaveBeenCalledWith({
      collaboratorId: "collab-mineiro",
      sectorId: "sector-processing",
      locationId: "location-yard",
      taskId: "task-loader",
      applyToFutureDefaults: true,
    });
    expect(container.textContent).toContain("future planning defaults updated");
  });

  it("saves changed availability for an unselected collaborator snapshot", async () => {
    const onBulkPlan = vi.fn();

    await renderPlanTab({
      onBulkPlan,
      onRefineAssignment: vi.fn(),
    });

    await changeTableSelect("Availability for Mineiro", "LEAVE_OF_ABSENCE");
    await clickButton("Save plan (1 selected)");

    expect(onBulkPlan).toHaveBeenCalledWith({
      rows: [
        {
          collaboratorId: "collab-selected",
          selected: true,
          sectorId: "sector-mining",
          locationId: "location-main",
          taskId: "task-miner",
          planningAvailability: "ACTIVE",
          availabilityChanged: false,
        },
        {
          collaboratorId: "collab-mineiro",
          selected: false,
          sectorId: "sector-mining",
          locationId: "location-main",
          taskId: "task-miner",
          planningAvailability: "LEAVE_OF_ABSENCE",
          availabilityChanged: true,
        },
      ],
    });
  });


  it("uses compact planning table controls so Task remains visible", async () => {
    await renderPlanTab({
      onBulkPlan: vi.fn(),
      onRefineAssignment: vi.fn(),
    });

    const headerText = Array.from(container.querySelectorAll("thead th"))
      .map((header) => header.textContent?.trim())
      .join("|");

    expect(headerText).toContain("✓");
    expect(headerText).toContain("Nick");
    expect(headerText).toContain("D Left");
    expect(headerText).toContain("Avail.");
    expect(headerText).toContain("Task");
    expect(headerText).not.toContain("Projected Journey End");
    expect(headerText).not.toContain("Availability");
    expect(headerText).not.toContain("Journey");

    const firstBodyRow = container.querySelector("tbody tr");
    if (!firstBodyRow) throw new Error("Missing planning row");

    expect(firstBodyRow.textContent).not.toContain("Selected");
    expect(firstBodyRow.textContent).not.toContain("Not selected");
    expect(firstBodyRow.textContent).toContain("D");
    const availabilitySelect = firstBodyRow.querySelector<HTMLSelectElement>(
      'select[aria-label^="Availability for"]',
    );
    expect(availabilitySelect).toBeTruthy();
    expect(
      Array.from(availabilitySelect?.options ?? []).map((option) =>
        option.text.trim(),
      ),
    ).toEqual(["A", "D", "L"]);
    expect(
      firstBodyRow.querySelector('select[aria-label^="Task for"]'),
    ).toBeTruthy();
  });

  it("does not offer inactive sector, local, or task values as planning choices", async () => {
    await renderPlanTab({
      onBulkPlan: vi.fn(),
      onRefineAssignment: vi.fn(),
    });

    expect(
      container.querySelector('option[value="sector-retired"]'),
    ).toBeNull();
    expect(
      container.querySelector('option[value="location-retired"]'),
    ).toBeNull();
    expect(container.querySelector('option[value="task-retired"]')).toBeNull();

    await clickRowButton("Mineiro", "Plan Assignment");

    const dialog = container.querySelector('[role="dialog"]');
    if (!dialog) throw new Error("Missing refinement dialog");
    expect(dialog.querySelector('option[value="sector-retired"]')).toBeNull();
    expect(dialog.querySelector('option[value="location-retired"]')).toBeNull();
    expect(dialog.querySelector('option[value="task-retired"]')).toBeNull();
  });
});

async function renderPlanTab(props: {
  onBulkPlan: (input: BulkPlanWorkPeriodAssignmentsInput) => void;
  onRefineAssignment: (
    input: PlanAssignmentRefinementInput,
  ) => Promise<PlanAssignmentRefinementResult>;
}) {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <PlanTab
        template={template}
        sectors={sectors}
        locations={locations}
        tasks={tasks}
        editable
        loading={false}
        pending={false}
        onBulkPlan={props.onBulkPlan}
        onRefineAssignment={props.onRefineAssignment}
      />,
    );
  });
}

const template: WorkPeriodPlanningTemplate = {
  workPeriodId: "wp-1",
  sourceWorkPeriodId: "wp-prev",
  sourceWorkDate: "2026-06-04",
  sourcePeriodName: "06:00-18:00",
  rows: [
    {
      collaboratorId: "collab-selected",
      collaboratorNickname: "Aline",
      collaboratorName: "Aline Silva",
      projectedEndDate: "2026-09-01",
      planningAvailability: "ACTIVE",
      selected: true,
      sectorId: "sector-mining",
      sectorLabel: "Mining",
      locationId: "location-main",
      locationLabel: "Main Mine",
      taskId: "task-miner",
      taskLabel: "Miner",
    },
    {
      collaboratorId: "collab-mineiro",
      collaboratorNickname: "Mineiro",
      collaboratorName: "Bruno Costa",
      projectedEndDate: "2026-09-02",
      planningAvailability: "ACTIVE",
      selected: false,
      sectorId: "sector-mining",
      sectorLabel: "Mining",
      locationId: "location-main",
      locationLabel: "Main Mine",
      taskId: "task-miner",
      taskLabel: "Miner",
    },
  ],
};

const sectors: ReferenceDataItem[] = [
  referenceItem("sector-mining", "sector", "Mining"),
  referenceItem("sector-processing", "sector", "Processing"),
  referenceItem("sector-retired", "sector", "Retired Sector", false),
];
const locations: ReferenceDataItem[] = [
  referenceItem("location-main", "location", "Main Mine"),
  referenceItem("location-yard", "location", "Yard"),
  referenceItem("location-retired", "location", "Retired Local", false),
];
const tasks: ReferenceDataItem[] = [
  referenceItem("task-miner", "task", "Miner"),
  referenceItem("task-loader", "task", "Loader"),
  referenceItem("task-retired", "task", "Retired Task", false),
];

function referenceItem(
  id: string,
  type: string,
  label: string,
  active = true,
): ReferenceDataItem {
  return {
    id,
    tenantId: "default",
    type,
    code: id.toUpperCase().replaceAll("-", "_"),
    label,
    description: "",
    active,
    sortOrder: 10,
  };
}

async function clickRowButton(rowText: string, buttonText: string) {
  const row = Array.from(container.querySelectorAll("tbody tr")).find((item) =>
    item.textContent?.includes(rowText),
  );
  if (!row) throw new Error(`Missing row ${rowText}`);
  const button = Array.from(row.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === buttonText,
  );
  if (!button) throw new Error(`Missing row button ${buttonText}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickButton(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function changeTableSelect(labelText: string, value: string) {
  const select = Array.from(container.querySelectorAll("select")).find(
    (item) => item.getAttribute("aria-label") === labelText,
  );
  if (!select) throw new Error(`Missing table select ${labelText}`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeVisibleSelect(labelText: string, value: string) {
  const dialog = container.querySelector('[role="dialog"]');
  if (!dialog) throw new Error("Missing refinement dialog");
  const label = Array.from(dialog.querySelectorAll("label")).find((item) =>
    item.textContent?.trim().startsWith(labelText),
  );
  const select = label?.querySelector("select");
  if (!select) throw new Error(`Missing select ${labelText}`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeCheckbox(labelText: string, checked: boolean) {
  const dialog = container.querySelector('[role="dialog"]');
  if (!dialog) throw new Error("Missing refinement dialog");
  const label = Array.from(dialog.querySelectorAll("label")).find((item) =>
    item.textContent?.includes(labelText),
  );
  const checkbox = label?.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!checkbox) throw new Error(`Missing checkbox ${labelText}`);
  await act(async () => {
    if (checkbox.checked !== checked) {
      checkbox.click();
    }
  });
}
