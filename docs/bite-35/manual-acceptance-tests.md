# Bite 35.1 — Launch Baseline and Scope Freeze — Manual Acceptance

**Operator:** ERS developer. **Environment/context:** LOCAL Mac Terminal, ERS repository root, no ERS browser login, no credentials. **Starting branch:** `1032-byte---351-launch-baseline-and-scope-freezeselect-stable-code-identify-deferred-work-establish-the-release-baseline`. **Source SHA:** `9ecd5b075d08ec19c1f368690e95bc621b984fb1` (the parent baseline, not the SHA after committing 35.1). **No Test/Production mutation is permitted.**

Record for every test: exact current HEAD SHA, UTC execution date/time, operator, command exit status, observed output, PASS/FAIL/BLOCKED, and relevant CI run URL. Do not record credentials. Tests are deliberately short: 35.1 freezes scope, it does not rehearse or authorize Production.

## B35.1-01 — Revision and branch ancestry (LOCAL Terminal)

1. Open Terminal on the Mac. `cd` to the root of the ERS repository.
2. Execute:

   ```bash
   git fetch origin
   git branch --show-current
   git rev-parse HEAD
   git status --short
   git merge-base --is-ancestor 9ecd5b075d08ec19c1f368690e95bc621b984fb1 HEAD
   echo "ANCESTOR_EXIT=$?"
   ```

3. **Expected:** the current branch is exactly the 1032 branch above; the SHA reported by `git rev-parse HEAD` is the newly committed 35.1 revision; `git status --short` prints no lines; `ANCESTOR_EXIT=0`. **STOP/BLOCKED** if ancestry fails, current checkout is wrong, or state is dirty. If Git reports an unknown baseline commit, fetch the relevant history rather than assuming ancestry.
4. Record both the starting SHA and committed 35.1 HEAD. No deployed change occurs.

## B35.1-02 — Verify scope manifest and negative cases (LOCAL Terminal)

1. Execute from repository root:

   ```bash
   make byte351-baseline-check
   python3 -B scripts/ers-byte351-baseline-check.py --git-check --require-clean
   ```

2. **Expected:** the first target passes the manifest and its negative regressions; the second prints `PASS: Bite 35.1 scope frozen` and `NOT VERIFIED` for deployed operations, with exit code 0. **FAIL:** a different required sub-bite, missing deferred item, unsupported claimed acceptance, failing test, or missing baseline ancestor. The checker is read-only and cannot prove real backup security.
3. Record output and exact SHA. No temporary files or Docker containers are created by these commands.

## B35.1-03 — Compare current Development/Test tracked content (LOCAL Terminal)

1. Execute:

   ```bash
   git fetch origin
   git rev-parse origin/development
   git rev-parse origin/test
   git diff --quiet origin/development origin/test
   echo "TREE_COMPARISON_EXIT=$?"
   ```

2. **Expected for the previously observed baseline:** `TREE_COMPARISON_EXIT=0`, although commit SHAs may differ. If it is nonzero today, record **BLOCKED — branches diverged since recorded observation**; do not rewrite history to imply they always matched. Record the actual two commit SHAs and current exit status. This test does not overwrite Test or perform a promotion.

## B35.1-04 — Review scope and deferrals (LOCAL, repository documentation)

1. Open `docs/bite-35/launch-plan.md` with your normal editor and `docs/bite-35/launch-baseline.json` in a second tab.
2. Confirm all seven rows of 35.1–35.7 match the agreed November 2 launch plan; note the original 34.1/34.3/34.2 mappings; verify the Actual Sector/Location compensation statement, 1Password-only custody, signed Opening Balance Adjustment requirement, and distinction between Functional and Operational training.
3. Confirm 34.4, 34.5, 33.6.6+, 33.6.8E/F are **deferred**, not shown as implemented; no new S3 policy, bucket or credentials are created.
4. Confirm all six safety gates are listed and none is marked passed without evidence. **PASS** only if the records match the decisions. **FAIL** if planned work is mislabeled implemented or a deferred item is made an implicit launch prerequisite.

## B35.1-05 — CI and cleanup (LOCAL Terminal and GitHub UI)

1. After committing 35.1, open GitHub → repository → Actions, locate the CI run for the **exact** `git rev-parse HEAD` revision on the 1032 branch, and review the `Bite 35.1 launch baseline and scope freeze` step as well as the existing jobs. Record CI run URL, SHA, and result. Prior-SHA green CI does not count.
2. From LOCAL Terminal, execute:

   ```bash
   git status --short
   docker ps -a --format '{{.ID}} {{.Names}}' | grep -E 'ers.*(byte351|bite35)' || true
   lsof -nP -iTCP:8080 -sTCP:LISTEN || true
   ```

3. **Expected:** clean working tree, no test-created 35.1 Docker containers, and port 8080 is free or has a pre-existing documented owner. These 35.1 tests create **no** Docker containers; do not stop unrelated containers. If a container is definitely identified as test-created by a separate 35.1 attempt, stop and remove **only that recorded container ID**, then repeat inspection. **PASS** only if the matching-sha CI and cleanup inspection succeed; otherwise record **BLOCKED**.

## Acceptance decision

**Bite 35.1 PASS:** B35.1-01 through -05 are complete with recorded evidence. This approves the **planning and source baseline only**, not Production deployment. Launch functionality, seed data, off-host restore and security remain pending for their designated sub-bites.

---

# Byte 35.2 — Brazilian Portuguese Completion — Manual Acceptance

**Starting source:** branch `1035-byte---352-brazilian-portuguese-completion`, base SHA `cb55d6fc1dc1fff0258742b394f8214f7ba97fd8`. Record the SHA after committing the patch separately. **Environment:** LOCAL only; no Production deployment. **Credentials:** use existing authorized, disposable LOCAL accounts; never share passwords or access keys. **No database reset is necessary.**

**Important:** The static-literal scanner is a regression control, not proof that every backend-supplied error or conditional application message is translated. Bite 35.2 acceptance requires the UI review below. An unexpected English user-facing message is a FAIL, not something to waive because key parity passes.

## B35.2-01 — Source and locale integrity (LOCAL Terminal)

1. Open Terminal in the ERS repository root. Run `git branch --show-current`, `git rev-parse HEAD`, and `git status --short`.
2. Confirm the branch is the Byte 35.2 branch and the base SHA above is an ancestor: `git merge-base --is-ancestor cb55d6fc1dc1fff0258742b394f8214f7ba97fd8 HEAD; echo $?`. Expected: `0`; STOP otherwise.
3. Run `make byte352-i18n-check` after `npm ci` in `frontend` if dependencies have not yet been installed. Expected: both the resource checker and four negative/positive checks pass. The resource checker must report zero outstanding ordinary static JSX/attribute literals after excluding technical tokens (such as `CPF`, `BRL`, `g`, and example IDs).
4. Run `make local-check`. Expected: exit status `0`. Do not claim PASS for checks that did not execute.

## B35.2-02 — Portuguese financial administration (LOCAL browser)

1. Start ERS using `make local-backend` and `make local-frontend` in separate Terminal windows. Use the established LOCAL URL printed by the frontend; do not change deployed Test/Production.
2. In a normal browser tab, sign in using an existing LOCAL Application Administrator with permission to view the administration pages. Select **Português (Brasil)** using the Language selector. Confirm the selection persists after page refresh and the page's `<html lang>` is `pt-BR` (the latter can be inspected with browser DevTools only for this locale contract check).
3. Through the application navigation, open Administration → Gold Prices (select a permitted Tenant context first if needed). Verify the heading, explanatory text, links, form field labels, buttons, no-data states, and history table display Portuguese. If there are pre-existing test gold prices, verify status text and date/amount presentation without modifying real financial data.
4. Open Administration → Price List. Verify navigation labels, category filter, inactive-items checkbox, table headings, create/edit forms, and empty-filter guidance are in Portuguese. On disposable LOCAL data, create a price-list item and edit it; verify confirmation messages are Portuguese and the existing version-history behavior is unchanged. If you lack authorization or safe test data, record BLOCKED for the mutation checks, not PASS.
5. Open Administration → Current Account Settings as an authorized user. Verify descriptive text, warning, policy status, and action labels are Portuguese. Do not change an active approval policy in a shared environment. On isolated LOCAL test data, changing the setting should yield a Portuguese success message and preserve authorization requirements.
6. **PASS:** all applicable text above appears in Portuguese and existing permissions and effects are unchanged. **FAIL:** untranslated English, broken interpolation, missing messages, or a wrong-tenant data leak. **BLOCKED:** missing authorized identity or safe LOCAL fixture.

## B35.2-03 — Portuguese authorization and reference data (LOCAL browser)

1. While signed in as an authorized LOCAL Application Administrator with Portuguese selected, open Administration → Authorization via the navigation. Check the headings, Actor cards, Role selectors, filters, eligibility guidance, and current-role table. Do not grant or revoke roles merely to test translation.
2. Open Administration → Audit Logs. Verify page title, filter labels, evidence headings, empty states, and messages. Authorization controls must continue to reject unauthorized actors.
3. Open Administration → Support Access. Verify both the request and history areas, the Tenant filter, permission guidance, warnings, and buttons. Do not submit or approve a real lease merely for translation verification.
4. If a disposable LOCAL Tenant Administrator account is available, sign out and sign in with it, select that Tenant, and open its Authorization and Reference Data pages via normal navigation. Verify role names and controls, filter prompts, and reference-data labels display Portuguese.
5. **PASS:** these surfaces are translated without changing role, lease, or tenant boundaries. **FAIL:** unexpected English labels or authorization behavior changes. **BLOCKED:** required disposable account unavailable; record the exact untested screen.

## B35.2-04 — English and locale persistence regressions (LOCAL browser)

1. Switch the Language selector to English (United States). Revisit Gold Prices, Price List, and one authorization screen. Expected: English labels return, with no technical key names displayed.
2. Switch back to Português (Brasil); refresh. Expected: Portuguese remains selected; the selector and `<html lang>` agree.
3. Open a second normal tab in the **same browser profile**; change the locale there and return to the first tab. Expected: tabs synchronize according to the existing storage/focus mechanisms. Do not use InPrivate for this shared-storage test.
4. Exercise a representative invalid form submission on disposable LOCAL data. Expected: Portuguese validation is understandable; no raw translation key (`byte352.*`) appears.
5. **PASS:** both locales, persistence, interpolation and shared-profile synchronization behave correctly. **FAIL:** incorrect locale, untranslated messages, or layout-breaking text.

## B35.2-05 — Full customer workflow language sweep and closure (LOCAL browser)

1. In Portuguese, follow the main navigation as the appropriate LOCAL roles: Application Administrator, Tenant Administrator, Earnings Operator, Expenses Operator, and Collaborator. Use UI navigation, not direct URL shortcuts. Review People, Collaborators, Journeys, planning, Work Periods, assignments, work recording, earnings, expenses, receipts and financial history. Record the screen and exact unexpected English message for each finding.
2. For each role, inspect at least one ordinary state and one empty or validation/error state available without destructive changes. Test the sign-in, sign-out and password-change surfaces where safe.
3. Record a **FAIL** if any customer-facing English remains, if numbers/dates are incorrectly formatted for the selected locale, or if text is hidden/clipped. Static resources and automated scans alone cannot establish completion.
4. Record the exact committed HEAD SHA and GitHub Actions CI run for that SHA. Both CI and `make local-check` must be green. Verify `git status --short` is empty and that tests left no new Docker containers (`docker ps -a --format '{{.ID}} {{.Names}}'`). For containers you explicitly created, stop/remove **only** those IDs, and verify port 8080 is released if tests owned it (`lsof -nP -iTCP:8080 -sTCP:LISTEN`). Do not stop unrelated containers.
5. **Bite 35.2 PASS:** Tests 01–05 all pass with no untranslated customer-facing message. **BLOCKED:** any required workflow or CI check cannot be exercised. **FAIL:** any reproducible unexpected English or a regression. Do not promote Byte 35.2 on the basis of static string parity alone.
