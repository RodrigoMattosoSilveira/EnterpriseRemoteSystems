import { act } from "react";
import { I18nextProvider } from "react-i18next";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../app/i18n";
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
  void i18n.changeLanguage("en");
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("PlanTab", () => {
  it("renders planning copy in Portuguese when the locale is switched", async () => {
    await i18n.changeLanguage("pt-BR");

    await renderPlanTab({
      onBulkPlan: vi.fn(),
      onRefineAssignment: vi.fn(),
    });

    expect(container.textContent).toContain("Planejar atribuições");
    expect(container.textContent).toContain("Salvar plano");
  });

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

  it("filters planning rows without changing the save payload", async () => {
    const onBulkPlan = vi.fn();

    await renderPlanTab({
      onBulkPlan,
      onRefineAssignment: vi.fn(),
    });

    await changeFilterInput("Search collaborators", "Mineiro");

    expect(container.textContent).toContain("Showing 1 of 2");
    expect(visibleBodyRows()).toHaveLength(1);
    expect(rowNicknameCellText(visibleBodyRows()[0])).toContain("Mineiro");
    expect(rowNicknameCellText(visibleBodyRows()[0])).not.toContain("Aline");

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
      ],
    });
  });

  it("filters by selection, availability, and reference values", async () => {
    await renderPlanTab({
      onBulkPlan: vi.fn(),
      onRefineAssignment: vi.fn(),
    });

    await changeTableSelect("Availability for Mineiro", "DAY_OFF");
    await changeFilterSelect("Selection", "UNSELECTED");
    await changeFilterSelect("Avail.", "DAY_OFF");
    await changeFilterSelect("Sector", "sector-mining");
    await changeFilterSelect("Local", "location-main");
    await changeFilterSelect("Task", "task-miner");

    expect(container.textContent).toContain("Showing 1 of 2");
    expect(visibleBodyRows()).toHaveLength(1);
    expect(rowNicknameCellText(visibleBodyRows()[0])).toContain("Mineiro");

    await changeFilterSelect("Task", "task-loader");

    expect(container.textContent).toContain("Showing 0 of 2");
    expect(container.textContent).toContain(
      "No collaborators match the current planning filters",
    );

    await clickButton("Clear filters");

    expect(container.textContent).toContain("Showing 2 of 2");
    expect(visibleBodyRows()).toHaveLength(2);
  });

  it("keeps visible row order stable when a collaborator is selected", async () => {
    const stableOrderTemplate: WorkPeriodPlanningTemplate = {
      ...template,
      rows: [
        planningRow("collab-aline", "Aline"),
        planningRow("collab-bruno", "Bruno"),
        planningRow("collab-camila", "Camila"),
        planningRow("collab-davi", "Davi"),
      ],
    };

    await renderPlanTab({
      onBulkPlan: vi.fn(),
      onRefineAssignment: vi.fn(),
      templateOverride: stableOrderTemplate,
    });

    expect(visibleRowNicknames()).toEqual([
      "Aline",
      "Bruno",
      "Camila",
      "Davi",
    ]);

    await changeSelectionCheckboxForRow("Davi", true);

    expect(visibleRowNicknames()).toEqual([
      "Aline",
      "Bruno",
      "Camila",
      "Davi",
    ]);
    expect(selectionCheckboxForRow("Davi").checked).toBe(true);
    expect(selectionCheckboxForRow("Bruno").checked).toBe(false);
  });

  it("marks replacement candidates locally without saving assignment data", async () => {
    const onBulkPlan = vi.fn();

    await renderPlanTab({
      onBulkPlan,
      onRefineAssignment: vi.fn(),
    });

    await changeTableCheckbox("Replacement candidate for Mineiro", true);

    expect(container.textContent).toContain("1 candidate");
    expect(visibleBodyRows()[1].textContent).toContain("Candidate");

    await changeFilterSelect("Candidate", "CANDIDATES");

    expect(container.textContent).toContain("Showing 1 of 2");
    expect(visibleBodyRows()).toHaveLength(1);
    expect(rowNicknameCellText(visibleBodyRows()[0])).toContain("Mineiro");

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
      ],
    });
  });

  it("offers only unassigned day-off or leave rows as temporary replacement targets", async () => {
    const onBulkPlan = vi.fn();
    const replacementTargetTemplate: WorkPeriodPlanningTemplate = {
      ...template,
      rows: [
        { ...planningRow("collab-selected", "Aline"), selected: true },
        planningRow("collab-mineiro", "Mineiro"),
        planningRow("collab-camila", "Camila"),
      ],
    };

    await renderPlanTab({
      onBulkPlan,
      onRefineAssignment: vi.fn(),
      templateOverride: replacementTargetTemplate,
    });

    await changeTableCheckbox("Replacement candidate for Mineiro", true);

    expect(
      tableSelectOptionLabels("Temporary replacement target for Mineiro"),
    ).toEqual(["No temporary replacement"]);

    await changeTableSelect("Availability for Aline", "DAY_OFF");

    expect(
      tableSelectOptionLabels("Temporary replacement target for Mineiro"),
    ).toEqual(["No temporary replacement", "Aline · D · selected"]);

    await changeTableSelect(
      "Temporary replacement target for Mineiro",
      "collab-selected",
    );

    expect(container.textContent).toContain("1 temporary replacement");
    expect(
      tableSelectOptionLabels("Temporary replacement target for Mineiro"),
    ).toEqual(["No temporary replacement", "Aline · D · selected"]);

    await changeTableCheckbox("Replacement candidate for Camila", true);

    expect(
      tableSelectOptionLabels("Temporary replacement target for Camila"),
    ).toEqual(["No temporary replacement"]);

    await clickButton("Save plan (2 selected)");

    expect(onBulkPlan).toHaveBeenCalledWith({
      rows: [
        {
          collaboratorId: "collab-selected",
          selected: true,
          sectorId: "sector-mining",
          locationId: "location-main",
          taskId: "task-miner",
          planningAvailability: "DAY_OFF",
          availabilityChanged: true,
        },
        {
          collaboratorId: "collab-mineiro",
          selected: true,
          sectorId: "sector-mining",
          locationId: "location-main",
          taskId: "task-miner",
          planningAvailability: "ACTIVE",
          availabilityChanged: false,
          temporaryReplacementForCollaboratorId: "collab-selected",
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
    expect(headerText).toContain("Cand.");
    expect(headerText).toContain("Repl.");
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
  templateOverride?: WorkPeriodPlanningTemplate;
}) {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <I18nextProvider i18n={i18n}>
        <PlanTab
          template={props.templateOverride ?? template}
          sectors={sectors}
          locations={locations}
          tasks={tasks}
          editable
          loading={false}
          pending={false}
          onBulkPlan={props.onBulkPlan}
          onRefineAssignment={props.onRefineAssignment}
        />
      </I18nextProvider>,
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

function planningRow(
  collaboratorId: string,
  collaboratorNickname: string,
): WorkPeriodPlanningTemplate["rows"][number] {
  return {
    collaboratorId,
    collaboratorNickname,
    collaboratorName: `${collaboratorNickname} Silva`,
    projectedEndDate: "2026-09-01",
    planningAvailability: "ACTIVE",
    selected: false,
    sectorId: "sector-mining",
    sectorLabel: "Mining",
    locationId: "location-main",
    locationLabel: "Main Mine",
    taskId: "task-miner",
    taskLabel: "Miner",
  };
}

function visibleBodyRows() {
  return Array.from(container.querySelectorAll("tbody tr"));
}

function visibleRowNicknames() {
  return visibleBodyRows().map((row) => rowNicknameCellText(row).trim());
}

function selectionCheckboxForRow(rowText: string) {
  const row = Array.from(container.querySelectorAll("tbody tr")).find((item) =>
    rowNicknameCellText(item).includes(rowText),
  );
  if (!row) throw new Error(`Missing row ${rowText}`);
  const checkbox = row.querySelector<HTMLInputElement>(
    'td:first-child input[type="checkbox"]',
  );
  if (!checkbox) throw new Error(`Missing selection checkbox for ${rowText}`);
  return checkbox;
}

async function changeSelectionCheckboxForRow(
  rowText: string,
  checked: boolean,
) {
  const checkbox = selectionCheckboxForRow(rowText);
  await act(async () => {
    if (checkbox.checked !== checked) {
      checkbox.click();
    }
  });
}

function rowNicknameCellText(row: Element) {
  return (
    row.querySelector("td:nth-child(4) > div[title]")?.textContent ?? ""
  );
}

async function changeFilterInput(labelText: string, value: string) {
  const label = findFilterLabel(labelText);
  const input = label.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error(`Missing filter input ${labelText}`);
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function changeFilterSelect(labelText: string, value: string) {
  const label = findFilterLabel(labelText);
  const select = label.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error(`Missing filter select ${labelText}`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function findFilterLabel(labelText: string) {
  const labels = Array.from(container.querySelectorAll("label")).filter(
    (item) => !item.closest('[role="dialog"]'),
  );
  const label = labels.find((item) =>
    item.textContent?.trim().startsWith(labelText),
  );
  if (!label) throw new Error(`Missing filter label ${labelText}`);
  return label;
}

async function clickRowButton(rowText: string, buttonText: string) {
  const row = Array.from(container.querySelectorAll("tbody tr")).find((item) =>
    rowNicknameCellText(item).includes(rowText),
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

async function changeTableCheckbox(labelText: string, checked: boolean) {
  const checkbox = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ).find((item) => item.getAttribute("aria-label") === labelText);
  if (!checkbox) throw new Error(`Missing table checkbox ${labelText}`);
  await act(async () => {
    if (checkbox.checked !== checked) {
      checkbox.click();
    }
  });
}

function tableSelectOptionLabels(labelText: string) {
  const select = Array.from(container.querySelectorAll("select")).find(
    (item) => item.getAttribute("aria-label") === labelText,
  );
  if (!select) throw new Error(`Missing table select ${labelText}`);
  return Array.from(select.options).map((option) => option.text.trim());
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
