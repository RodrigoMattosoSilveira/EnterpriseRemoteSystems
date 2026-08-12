import { randomInt } from "node:crypto";

const PERSON_SUFFIX_TAIL_SPACE = 1_000_000;
const MAX_WORKER_INDEX = 89;

// Each Playwright worker gets its own two-digit namespace in the eight digits
// that ERS Person test helpers use to derive tenant-unique CPF/cellular values.
// A process-local salt keeps repeated deployed E2E runs from deterministically
// reusing the same values, while the monotonic sequence prevents duplicates
// inside one worker even when multiple records are created in the same tick.
const processSalt =
  (Date.now() + randomInt(0, PERSON_SUFFIX_TAIL_SPACE)) %
  PERSON_SUFFIX_TAIL_SPACE;
let personSuffixSequence = 0;

export function uniquePersonSuffix(workerIndex: number): number {
  if (
    !Number.isInteger(workerIndex) ||
    workerIndex < 0 ||
    workerIndex > MAX_WORKER_INDEX
  ) {
    throw new Error(
      `Playwright workerIndex must be between 0 and ${MAX_WORKER_INDEX}, got ${workerIndex}`,
    );
  }

  personSuffixSequence += 1;
  if (personSuffixSequence >= PERSON_SUFFIX_TAIL_SPACE) {
    throw new Error("Exhausted Playwright Person suffixes for this worker");
  }

  const workerNamespace = workerIndex + 10;
  const tail = (processSalt + personSuffixSequence) % PERSON_SUFFIX_TAIL_SPACE;
  return workerNamespace * PERSON_SUFFIX_TAIL_SPACE + tail;
}
