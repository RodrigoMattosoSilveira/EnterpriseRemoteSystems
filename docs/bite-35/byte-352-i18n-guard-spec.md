# Byte 35.2 — Untranslated UI Text Guard: specification

**Status:** Implemented for Bite 34.1 (#1056), with these differences from the draft below:
- **Checks A, C and D** run in `byte352-i18n-check` (scanner in `frontend/scripts/i18n-ui-literals.cjs`; exceptions in `frontend/i18n-exceptions.json`). Check D became a code change rather than a check: no fixed-locale formatting remains outside `src/i18n`.
- **Check C** also covers field rule codes: every backend package that returns field errors reports `fieldCodes`, uncoded field errors in those packages fail, and every rule code needs an `apiError.rule.*` key.
- **No known-strings list (§5.2):** every finding was fixed or excepted before the guard was switched on, so any new untranslated text fails immediately.
- **Not implemented:** the identical-value allow-list and new-key style check (§7.1 items 3–4), and the vetted custom-component config file (§4.5); text props are listed in the scanner instead.

The sections below are the original draft, kept for reference.
**Applies to:** `frontend/scripts/byte352-i18n-check.cjs` and its CI and `make` wiring.
**Purpose:** meet the Byte 35.2 scope item *"Automated coverage preventing new untranslated UI text"*, and make the guard's PASS mean what it appears to mean.

## 1. Why this is needed

On `development` (2026-11-07), `npm run i18n:check -- --require-complete` reports `Remaining untranslated JSX/attribute literals elsewhere: 0` and PASS. A broader scan of the same code still finds about 100 user-visible English strings, for example:

| Where | Example | Why the current check misses it |
|---|---|---|
| `AuditLogViewerPage.tsx:25-54` | `{ value: "current_accounts.zero_gold", label: "Zero gold settlement" }` | `label:` in a data object |
| `AuthzAdminPage.tsx:295` | `{pending ? "Creating..." : "Create Actor"}` | String inside a JSX expression or conditional |
| `TenantRoleDelegationPage.tsx:258` | `title={isCurrent ? "A Tenant Administrator cannot…" : …}` | Attribute value is an expression, not a plain string |
| `TenantRoleDelegationPage.tsx:606` | `return "Tenant Administrator";` | String returned from a helper function |
| `PriceListPage.tsx:449` | `return "Code is required.";` | Validation message returned from a function |
| `SupportAccessLeasesPage.tsx:359` | `` `${n} active Tenant${s}` `` | Template literal |
| `SupportAccessLeasesPage.tsx:755` | `label="Fixed expiration"` | `label` isn't in the checker's 4 attributes |
| `AuthzAdminPage.tsx:282` | `cardName="Create actor"` | Custom component prop |
| `app/authStore.ts:125` | `new Error("Unable to sign in")` | Error message that is shown in the UI |
| `GoldPricesPage.tsx:318` | `new Intl.NumberFormat("en-US", …)` | Fixed locale bypasses the user's chosen language |

The current check also:
- only verifies `t("…")` keys in 5 named files;
- isn't part of `make local-check` (it only runs in CI and in manual acceptance);
- doesn't look at backend error messages, which reach users as English text through `ApiErrorPanel`.

## 2. Goals and non-goals

**Goals**
1. Fail CI and `make local-check` whenever a change adds user-visible text that isn't from the i18n catalog.
2. Cover every customer-facing source file, not a named list.
3. Make every exception explicit, reviewed and justified.
4. Let existing leftovers be fixed step by step without blocking unrelated launch work, while guaranteeing they only decrease, and that Byte 35.2 acceptance requires zero.
5. Ensure every backend error code a user can receive has a translation.
6. Add no new dependencies: use only Node 24 and the `typescript` package already in `frontend/package.json`.

**Non-goals**
- Automatically rewriting source files or generating keys. The `i18n-migrator` on branch `i18n-dev-05aug` does this for `i18next`; ERS no longer uses `i18next`.
- Machine translation. All `pt-BR` text stays human-authored and reviewed.
- Runtime English detection in Playwright. It may be added later as non-blocking evidence.
- Adding locales beyond `en-US` and `pt-BR` (Bite 31.1 contract).

## 3. Overview

One command, `npm run i18n:check`, runs four checks and reports them together:

| Check | What it guarantees |
|---|---|
| **A. UI literals** | No user-visible English text in frontend source outside the catalog, except listed exceptions |
| **B. Catalog integrity** | Key and placeholder parity, no empty values, all referenced keys exist, and identical `en-US`/`pt-BR` values are intentional |
| **C. Backend error codes** | Every error code the backend can return has an `apiError.<code>` key |
| **D. Locale formatting** | No fixed locale or browser-locale formatting outside `src/i18n/` |

The detection engine for check A is ported from `frontend/tools/i18n-migrator` (`scanner.ts`, `classifier.ts`, `exclusions.ts`, `config.ts`) on `i18n-dev-05aug`. It is ported into `byte352-i18n-check.cjs` (or a sibling `.cjs` module) as plain CommonJS. The transformer, key generator and `i18next` locale writer are **not** ported.

## 4. Check A — UI literals

### 4.1 Files scanned
- **Included:** all `*.ts` and `*.tsx` under `frontend/src/`.
- **Excluded:**
  - `src/i18n/resources/**`;
  - `src/api/generated/**`;
  - `src/test/**` and `src/dev/**`;
  - `*.test.ts(x)`, `*.spec.ts(x)` and `*.d.ts`.
- **Parse errors fail the check.** A file that can't be parsed is never silently skipped.

### 4.2 What counts as a finding
A string is a finding when it looks human-readable (§4.4), isn't excluded (§4.3) and appears in one of these places:

| Category | Pattern | Example |
|---|---|---|
| `JSX_TEXT` | Text between JSX tags | `<p>Loading…</p>` |
| `JSX_ATTRIBUTE` | Literal value of a text attribute: `label`, `placeholder`, `title`, `alt`, `aria-label`, `aria-description`, `helperText`, plus vetted custom props (§4.5) | `label="Fixed expiration"` |
| `JSX_EXPRESSION` | Literal or template inside `{…}` in JSX or in a text attribute, including both branches of `?:` and `&&`/`||` operands | `{busy ? "Saving..." : "Save"}` |
| `OBJECT_PROPERTY` | Literal value of a display property in an object: `label`, `title`, `message`, `description`, `placeholder`, `helperText`, `heading`, `emptyMessage` | `{ label: "Partial payout" }` |
| `TEMPLATE_LITERAL` | Template whose fixed parts contain human-readable text, in a UI position (any category above, a return value, or a message setter) | `` `Gold price for ${d} recorded.` `` |
| `FUNCTION_RETURN` | Literal returned from a non-component helper | `return "Code is required.";` |
| `MESSAGE_SETTER` | First argument to a call matching `/^set[A-Za-z0-9]*(Message|Error|Notice|Status)$/` | `setError("Unable to save")` |
| `COMPONENT_DEFAULT` | Literal default value of a destructured component prop listed in §4.5 | `title = "Action completed"` |
| `UI_ERROR` | `new Error("…")` with a human-readable message, in `src/app/**`, `src/api/**` or any `.tsx` file (decision D2) | `new Error("Unable to sign in")` |

Anything already inside a translation call (`t(…)`, `translate(…)` or `translateForLocale(…)`) is never a finding.

### 4.3 Structural exclusions
These are ported from the migrator's `exclusions.ts` and `config.ts`. They decide by code context, not by whether the text contains letters.

- **Imports, types and logic:** module specifiers, TypeScript literal types, `===`/`!==` comparison operands, `switch`/`case` values and `Intl` constructor arguments.
- **Technical props:** `className`, `to`, `href`, `id`, `name`, `type`, `key`, `role`, `value`, `htmlFor`, `rel`, `target`, `method`, `action`, `data-*`, and the reference-type `aria-*` props (`aria-describedby`, `aria-controls`, `aria-labelledby` and so on).
- **Native element configuration** (on lowercase elements only): `inputMode`, `min`, `max`, `step`, `pattern`, `autoComplete`, `accept`, `maxLength`, `minLength`, `rows`, `cols`, `defaultValue`.
- **Value shapes:**
  - paths and URLs (`/…`, `…://…`);
  - BCP-47 locale tags;
  - `SCREAMING_SNAKE_CASE` codes;
  - dotted, kebab or snake identifiers with no spaces (`ledger_entry`, `authz.read`);
  - HTTP header names (`X-Tenant-ID`, `Content-Type`).
- **Technical display elements:** text inside `<code>`, `<pre>`, `<kbd>` or `<samp>` is reported as a *review* finding (§6), not a failure. An example is the curl command on the authorization page.
- **Function arguments that are technical by nature:** `console.*`, `queryKey`, `fetch`/`apiFetch` paths, storage keys, and DOM query selectors.

### 4.4 "Human-readable"
After trimming, text is human-readable when it contains at least two consecutive letters (`A–Z`, `a–z`, `À–ÿ`) **and** any of the following:
- it contains a space between two words;
- it starts with an uppercase letter followed by a lowercase letter (`Save`, `Pending`);
- it ends with `.`, `…`, `?` or `!`.

Text that is only punctuation, digits, units or symbols (`×`, `÷`, `—`, `g`) isn't human-readable. The tests in §9 pin down the borderline cases (`Cand.`, `ID`, `CPF:`, `BRL ÷`).

### 4.5 Vetted custom-component props
The file `frontend/i18n-guard.config.json` lists custom components whose props carry display text. It starts with these (`ActionSuccessDialog.title` and `continueLabel` also count as `COMPONENT_DEFAULT`):

```json
{
  "displayProps": {
    "ActionSuccessDialog": ["title", "message", "continueLabel"],
    "CardPermissionNotice": ["cardName"],
    "SortableHeader": ["label", "title"],
    "ReplacementCandidateToggle": ["label"],
    "TemporaryReplacementSelect": ["label"],
    "PriceListItemForm": ["title", "description", "submitLabel", "pendingLabel"],
    "SummaryCard": ["label"],
    "Item": ["label"],
    "Signature": ["label"]
  }
}
```

Adding a component here is a reviewed change, so props can be added without editing the scanner. Props of a custom component that isn't listed are reported as *review* findings: they're printed but don't fail the check.

## 5. Exceptions and the shrinking known-strings list

### 5.1 Exceptions file — `frontend/i18n-exceptions.json`
This file lists text that is user-visible but **intentionally untranslated**. It replaces the hardcoded `intentionalIdentifiers` set in today's checker.

```json
{
  "global": [
    { "text": "CPF",  "reason": "Brazilian tax identifier; same in both locales" },
    { "text": "CPF:", "reason": "Label form of the CPF identifier" },
    { "text": "RG:",  "reason": "Brazilian identity-document identifier" },
    { "text": "BRL",  "reason": "ISO 4217 currency code" },
    { "text": "Enterprise Remote Systems", "reason": "Product name" },
    { "text": "Pará", "reason": "Portuguese place name used as an example placeholder" }
  ],
  "files": [
    { "file": "features/authz/AuthzAdminPage.tsx", "text": "curl …", "category": "JSX_TEXT",
      "reason": "Executable command example; must stay literal" }
  ]
}
```

**Rules**
- **Matching** uses the file (for file-level entries), the text with whitespace collapsed, and the category if one is given. Line numbers are never used, so moving code doesn't break entries.
- **Every entry needs a non-empty `reason`.** Entries without one fail the check.
- **An entry that no longer matches anything fails the check** with `stale exception`, so the file can't build up dead entries.
- **Wildcards aren't allowed.** Each exception is a specific piece of text.

### 5.2 Known-strings list — `frontend/i18n-baseline.json`
This file records the leftovers that exist today, so the check can be required immediately without first fixing all ~100 strings.

```json
{
  "generated": "2026-11-07",
  "entries": [
    { "file": "features/authz/AuditLogViewerPage.tsx", "category": "OBJECT_PROPERTY",
      "text": "Zero gold settlement" }
  ]
}
```

**Rules**
- **Creating or refreshing it:** `npm run i18n:baseline` writes the current findings. Refreshing is only allowed when the result is a subset of the existing file; adding entries needs `--allow-growth` and must be reviewed.
- **New findings fail:** any finding not in the list or in the exceptions fails as `new untranslated text`.
- **Fixed strings must be removed:** a listed string that no longer occurs fails as `baseline entry fixed — remove it`. This guarantees the list only gets shorter.
- **Completion:** `npm run i18n:check -- --require-complete` fails while the list has entries. Byte 35.2 acceptance (B35.2-01, B35.2-09) uses this mode, and the list must end up empty or the file removed.
- **PASS wording:** while entries remain, PASS prints `PASS (N known untranslated strings remain — Byte 35.2 not complete)`. It prints `PASS: no untranslated UI text` only when the list is empty.

## 6. Output

Each problem is printed on one line:

```
FAIL new  features/authz/SupportAccessLeasesPage.tsx:755 JSX_ATTRIBUTE label="Fixed expiration"
FAIL stale-exception  global "Pará"
WARN review  features/authz/AuthzAdminPage.tsx:262 TECHNICAL_DISPLAY <code>curl -b …</code>
```

A summary follows, broken down by category and by check (A–D). `--report` lists all known and review findings. `--json` prints the same data in a machine-readable form for CI artifacts.

**Exit codes:**
- `0`: no FAIL lines;
- `1`: one or more FAIL lines;
- `2`: tool error (parse error, malformed config).

## 7. Checks B–D

### 7.1 Check B — catalog integrity
These rules already exist and are kept:
- key parity;
- matching placeholder names;
- no empty values;
- no duplicate keys;
- static string values only.

These rules are added:
1. **Unknown keys:** every `t("…")`, `translate("…")` and `translateForLocale(_, "…")` key in **all** scanned files must exist in `en-US`. Today this is only checked in 5 files.
2. **Dynamic keys:** template keys such as `` `journeyExtension.status.${s}` `` must have at least one matching key per prefix. The full list of matching keys is printed in `--report`.
3. **Identical values:** keys whose `pt-BR` value equals the `en-US` value must be on the `identicalAllowed` list in `i18n-guard.config.json`. Today there are 36, all legitimate (`Status`, `Total`, `CPF`, `PIX` and so on). A new identical pair fails unless it's added there, which catches untranslated copies.
4. **Key style for new keys:** decision D1. The check compares against `i18n-baseline.json`'s key snapshot so that only *new* keys are checked.

### 7.2 Check C — backend error codes
- **What it reads:** every literal `Code: "<code>"` in `backend/internal/**/*.go`, excluding `_test.go`. Today that's 65 sites and about 42 distinct codes.
- **What it requires:** a key `apiError.<code>` in `en-US.ts` for each code. Parity then guarantees `pt-BR` has it too.
- **Internal-only codes** (for example those used only by the CLI or operations tooling) go in `i18n-guard.config.json` → `backendCodesInternal`, each with a reason. They're exempt.
- **Dynamic codes:** if a code is built at runtime, the check can't see it. The rule is that error codes must be literal strings, and code review enforces this.
- **Frontend side:** a single function (for example `describeApiError(error, t)` in `src/i18n/`) turns an `ApiError` into translated text. `ApiErrorPanel`, the password reset/change pages, the reactivation request and `AppShell` must use it instead of `error.message`. Check A gets a rule that `error.message` / `cause.message` must not be rendered directly in `.tsx` outside that function; it's reported as `UI_ERROR`.
- **Unmapped codes and validation fields:** these fall back to a translated generic message plus the code (decision D3).

### 7.3 Check D — locale formatting
Outside `src/i18n/**`, these are findings:
- `new Intl.NumberFormat("<fixed locale>", …)` and `new Intl.DateTimeFormat("<fixed locale>", …)`;
- `.toLocaleString()`, `.toLocaleDateString()` and `.toLocaleTimeString()`, with or without `undefined` as the locale.

All formatting must use the `useI18n()` formatters or a formatter passed into the helper. Today's 9 sites (`GoldPricesPage.tsx:310,318`, `PriceListPage.tsx:488`, `paymentValue.ts:116`, `receiptLifecycle.ts:134`, `JourneyBonusAwardsPanel.tsx:80`, and three `toLocaleString()` calls) go into the known-strings list.

## 8. Integration
- **`frontend/package.json` scripts:**
  - `i18n:check`: unchanged name; runs checks A–D against the known-strings list.
  - `i18n:check:complete`: the same with `--require-complete`, used for acceptance.
  - `i18n:baseline`: regenerates the known-strings list (§5.2 rules).
  - `i18n:report`: unchanged.
  - `i18n:test`: unchanged; runs the node tests.
- **`make byte352-i18n-check`:** unchanged.
- **`make local-check`:** add the `byte352-i18n-check` call, so developers see failures before CI.
- **CI:** keep the existing step *"Verify Byte 35.2 locale resources and hard-coded UI regression gate"* in `.github/workflows/ci.yml`. It already runs before TypeScript checks on Node 24.
- **Runtime:** Node 24 (CI already uses it; the WSL default Node 18 can't run the frontend tests).
- **Dependencies:** none added. The check reads `backend/` files directly, so it needs no Go toolchain.
- **Speed:** the whole check should finish in under 10 seconds on CI hardware. It parses each file once.

## 9. Tests (`byte352-i18n-check.node.cjs`)
- **Fixtures:** keep the 4 existing tests. Add fixture files under `frontend/scripts/i18n-guard-fixtures/` (not under `src/`, so they aren't scanned as app code).
- **Per category:** for each category in §4.2, one positive fixture (must be found) and one negative fixture (technical lookalike, must not be found). The migrator's fixtures are the starting point, especially:
  - `ternary-strings`
  - `template-interpolation`
  - `helper-return-strings`
  - `message-setter-static` / `message-setter-dynamic`
  - `display-map`
  - `enum-label-pair`
  - `native-technical-props`
  - `technical-templates`
  - `technical-aria-describedby`
- **Borderline text:** `Cand.` and `Repl.` (found), `ID` (not found), `CPF:` (exception), `BRL ÷` (not human-readable), `X-Tenant-ID` (header, excluded), `ledger_entry, ledger_receipt` (identifier list, excluded).
- **Exceptions file:** matches by text and file; a missing `reason` fails; stale entries fail.
- **Known-strings list:** a new finding fails; a fixed entry fails until removed; regeneration that grows the list without `--allow-growth` fails; `--require-complete` fails while entries remain.
- **Check B:** an unknown key in any file fails; a new identical pair fails unless allowed.
- **Check C:** a Go fixture with a new `Code: "x"` fails until `apiError.x` exists; internal codes need a reason.
- **Check D:** fixed-locale `Intl` and `toLocaleString()` are found outside `src/i18n/` and ignored inside it.
- **Real code regression test:** running against today's `development` must find at least the examples in §1. This proves the gap described here is closed.

## 10. Rollout
These steps fit inside the Byte 35.2 sub-steps already planned.

1. **Upgrade the checker:** port the scanner, add checks B–D, generate the first known-strings list (about 100 UI entries plus 9 formatting entries), add the exceptions and config files, and add the call to `make local-check`. From this point no new English text can be merged.
2. **Translate the leftovers screen by screen:** Audit Logs, role delegation, `AuthzAdminPage`, Support Access, Price List validation, Plan tab, `authStore` errors, and the `ActionSuccessDialog` default. Fix the formatting sites. Each fix removes entries from the list.
3. **Backend errors:** add `apiError.*` keys for the ~42 codes and the shared `describeApiError`, then mark internal codes in the config.
4. **Acceptance:** `npm run i18n:check:complete` passes with an empty known-strings list. Record the result in `byte-352-manual-acceptance.md` B35.2-01 and B35.2-09, and then mark 35.2 complete in `launch-baseline.json`.

Bugs found during the analysis are fixed alongside, not by the guard itself:
- `JOURNEY_BONUS` missing from `financialLabels.ts` source-type mapping;
- `humanizeCode`, `humanize` and `humanizePlanningCode` falling back to lowercase English for unknown codes.

## 11. Decisions needed

| ID | Question | Recommendation |
|---|---|---|
| D1 | Key naming for **new** keys: hash-suffixed generated keys (363 today, e.g. `guard.loading.your.session_c706bf`) or semantic names (`common.saving`)? | Semantic names for new keys; existing keys stay unchanged. Hash keys stay accurate only while the English text never changes |
| D2 | Should `new Error("…")` count as UI text? | Yes in `src/app/**`, `src/api/**` and `.tsx` files; no elsewhere |
| D3 | Backend validation messages without a specific code | Add codes only for customer-facing validation; otherwise show a translated generic message plus the code |
| D4 | Audit Logs: translate stored metadata values? | No. Translate labels and operation names only; recorded data stays as stored |
| D5 | Who reviews new `pt-BR` text? | A named Brazilian Portuguese reviewer before 35.2 acceptance |

## 12. Acceptance criteria for the guard
- Every example in §1 makes the check fail when it isn't in the known-strings list or exceptions.
- No check has to be weakened to pass on today's `development` with the generated known-strings list.
- `--require-complete` fails today and passes only once the list is empty.
- `make local-check` and CI both run the guard.
- All §9 tests pass on Node 24.
- PASS output never claims completion while known strings remain.
