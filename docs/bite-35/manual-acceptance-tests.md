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
