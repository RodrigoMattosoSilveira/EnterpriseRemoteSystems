# Byte 35.2 — Source Audit, Localized UI Corrections, and LOCAL Acceptance

**Implementation baseline:** Branch `1078-bite-356-application-administrator-and-operational-runbooks`, committed HEAD SHA `a55565b980486ca27f43e233568d5a30b22db2d1`.

**Scope:** Presentation-only correction for untranslated Portuguese UI identified during Bite 35.6 preparation. No authentication, authorization, Production initialization, migrations, API contracts, fixture provisioning or database writes are added by this change. The separate two-human 35.5/35.6 acceptance remains pending and must not be represented as passed.

## Diagnosis and decisions

The old Byte 35.2 source guard strictly enforced five TSX files, while its non-gating scan checked JSX text and a small subset of JSX attributes elsewhere. A green result did not establish complete translation. The supplied baseline actually contains **2,277 translation keys in each catalog**, rather than the 1,211 reported in the external review. The external reference to `docs/bite-35/byte-352-i18n-guard-spec.md` is not present in the supplied committed ZIP.

The revised static gate covers **all 107 non-test TSX files at this baseline** (the number may increase as files are added). It checks literal JSX text, selected user-facing attributes and component props, conditional string expressions rendered as JSX children, and literal `t()` keys in application TS/TSX. The gate is now invoked by `make local-check`, as well as CI and `make local-docker-check`.

The following were confirmed as UI gaps and corrected:

- Authorization Create Actor action and restricted-card names now use translated catalog entries.
- Audit Log Viewer loading status and singular/plural visible event counts use translated catalog entries.
- Tenant Role selector's empty/disabled prompts use translated catalog entries.
- Planning column abbreviations and Select/Unselect screen-reader names are localized.
- Session-verification error presentation uses a translated user-facing message, not a raw English internal exception.
- Previously omitted `translate={t}` arguments in administration/shared error panel call sites now localize panel labels and recovery hints.

**Intentional exclusions:** `Enterprise Remote Systems` remains branding; CPF/RG/BRL/HH:MM and identifiers remain untranslated; internal authorization eligibility reason strings are already mapped to translated text in `localizeAuthzReason` and retain their stable decision semantics; `GOLD_GRAM` has a display-boundary localization in `BalanceCard`. Do not translate database values, role codes, API error codes or authorization decisions directly.

**Limitations:** The gate is a **static high-confidence source check**, not an end-to-end guarantee. Strings built in helper functions, JavaScript exceptions, server-provided labels, backend Go error messages, some single-word strings, and dynamic API error messages require manual/runtime inspection. `npm run i18n:report` now prints non-gating source-string candidates from `.ts` and `.tsx` (including `new Error()` and `message`/`reason`/`label` properties); each must be classified at its actual display boundary. A PASS is not approval of complete runtime Portuguese coverage.

## Automated tests — on the patched source tree

**Environment:** LOCAL Mac/Linux developer checkout. **Identity:** None required. **Preconditions:** Same branch, a clean baseline before patch, local Node/npm dependencies already installed (`npm ci` if needed). Do not reset the LOCAL SQLite database or rerun fixture provisioning.

Execute from the repository root:

```bash
cd ~/projects/EnterpriseRemoteSystems
make byte352-i18n-check
```

**PASS:** Both catalog parity/static gate and eight guard unit tests pass. The gate reports all application TSX files guarded and `Static JSX/text-expression/attribute findings: 0`; unit tests report `8` tests, `0` failed. **FAIL:** Nonzero exit status, missing keys, untranslated static UI text or broken guard unit tests.

Inspect non-gating source candidates separately:

```bash
cd ~/projects/EnterpriseRemoteSystems/frontend
npm run i18n:report
```

**PASS:** Reports the review candidates without claiming they are resolved. **FAIL:** A purported no-untranslated-text guarantee based on this report alone.

Run the canonical suite before promotion:

```bash
cd ~/projects/EnterpriseRemoteSystems
make local-check
```

**PASS:** Entire target exits `0`, including i18n check, Go and frontend checks, Playwright and build. **FAIL:** Any required target fails. Do not call this result successful until it has actually run on the developer's machine/CI.

## UI-first manual LOCAL acceptance

These tests use **LOCAL**, normal frontend/backend startup and established **1Password** credentials. Do not run Production migrations, modify Production data, create/revoke roles or rotate passwords. Set locale using the visible Language selector. Recheck both `pt-BR` and `en-US` in the same browser profile.

### MT01 — Application Administrator, Authorization page

1. Start LOCAL backend and frontend using `make local-backend` and `make local-frontend` in separate terminals.
2. Sign in as **APP-ADMIN**, the LOCAL Application Administrator.
3. Switch the UI to **Português (Brasil)**.
4. Open **Administration → Authorization** (`/admin/authorization`).
5. Inspect the Create Actor action; if a permissions notice is shown, inspect its card name for Create Actor, Actors, Roles and Permissions. Do not create an Actor.
6. Switch to **English (United States)** and inspect the same controls.

**PASS:** Visible action labels and any displayed restricted-card names follow selected language; no English-only Create Actor text leaks in pt-BR. **FAIL:** English action/notice text appears where the associated localized catalog entry should display. **BLOCKED:** Notice is not shown because the signed-in Actor has sufficient permission; that restricted notice must instead be verified with a safely provisioned read-only test identity.

### MT02 — Application Administrator, Audit Log Viewer

1. While signed in as **APP-ADMIN**, set locale to `pt-BR`.
2. Open **Administration → Audit logs** (`/admin/audit-logs`).
3. Observe loading feedback if a loading state is visible.
4. Observe the event-count caption after events load. Apply safe filters to find both a single result and multiple results if existing data permits; do not create audit events just to achieve a count.
5. Switch to `en-US` and repeat.

**PASS:** Portuguese caption shows `1 evento exibido` or `<N> eventos exibidos`; English shows `1 event shown` or `<N> events shown`, as appropriate. Loading feedback is translated when visible. **FAIL:** English `Loading audit events...`, `event shown` or `events shown` appears under pt-BR. **BLOCKED:** Test data does not permit observing a singular result or transient loading state; record which observation was blocked rather than fabricating it.

### MT03 — Tenant Administrator, Role selector

1. Sign out from APP-ADMIN.
2. Sign in as **TENANT-A**, the LOCAL Tenant A Administrator, using established 1Password credentials.
3. Select the **Tenant A** operating context and `pt-BR`.
4. Open the tenant Role delegation interface from Administration/Authorization.
5. Inspect the closed Role selector before selecting a Role; open and close it without submitting any grant. Repeat in `en-US`.

**PASS:** Portuguese closed prompt is `Selecione uma Função`, and English is `Select a Role`; no role grant is created. **FAIL:** Portuguese screen still displays `Select a Role`. **BLOCKED:** Existing identity lacks permissions or no selectable Actor is present.

### MT04 — Tenant A, Planning accessibility labels

1. Sign in as **TENANT-A** or **EARNINGS-A**, whichever has the existing planning read permission.
2. Select Tenant A, then `pt-BR`.
3. Open an existing Work Period and the **Plan** tab. Do not change any saved plan.
4. Verify the candidate/replacement column abbreviations and full hover titles; for a Collaborator's selection checkbox, use macOS VoiceOver or a comparable screen reader to hear its accessible name.
5. Switch to `en-US` and repeat without checking/unchecking rows.

**PASS:** `pt-BR` uses `Cand.` / `Subst.` and an accessible `Selecionar <Collaborator>` or `Desmarcar <Collaborator>` label; `en-US` uses `Cand.` / `Repl.` with Select/Unselect. **FAIL:** Screen reader still announces English Select/Unselect under pt-BR. **BLOCKED:** No accessible Work Period/Collaborator row is available.

### MT05 — Error and session handling (non-destructive)

1. As an authorized LOCAL Tenant Administrator, keep `pt-BR` selected and navigate to a normal admin screen that includes the shared API error panel.
2. If a naturally occurring, non-destructive permission/connection error appears, check the panel's field captions and session/tenant guidance; do not deliberately suspend an account or corrupt data.
3. Repeat in `en-US` where possible.

**PASS:** Shared panel captions/guidance are localized. **FAIL:** English field captions or recovery hints appear under `pt-BR`. **BLOCKED:** No appropriate error can be exercised safely. Backend-origin raw message translations require separate handling; do not certify them based on this test.

## Promotion and custody

This change is independent of 35.5 Production initialization and 35.6 two-human emergency access. Keep their acceptance status unchanged. Do not merge/promote based on focused tests alone: require the full `make local-check` and the applicable UI acceptance evidence.

**Glossary impact:** No new ERS domain concepts or role codes. Existing Portuguese terminology **Função**, **Entidade**, and **Colaborador** is retained. Short label `Subst.` is a UI abbreviation of *substituição*, not a new domain term. No Glossary update required unless the project Glossary explicitly catalogs presentation abbreviations.
