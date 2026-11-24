#!/usr/bin/env python3
"""Stage 1 TRN deploy contract: offline mocks only; never contacts Hetzner/Docker/1Password."""
from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'scripts/ers-trn-deploy-remote.sh'
BACKUP = ROOT / 'scripts/server-sqlite-backup.sh'
WORKFLOW = ROOT / '.github/workflows/deploy-training.yml'


def invoke(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, check=False, **kwargs)


class TrainingDeploymentTests(unittest.TestCase):
    def test_workflow_does_not_stream_remote_bash_program(self):
        workflow = WORKFLOW.read_text()
        deploy = workflow.split('      - name: Deploy pinned TST-approved revision using standard SSH command execution', 1)[1].split('      - name: Record release selection', 1)[0]
        self.assertIn('ssh -n -o BatchMode=yes', deploy)
        self.assertIn('bash -euo pipefail -c', deploy)
        self.assertIn('exec bash scripts/ers-trn-deploy-remote.sh', deploy)
        self.assertNotIn('<<', deploy, 'streaming script to SSH stdin can be consumed by docker compose run')
        self.assertIn('set -euo pipefail', deploy)
        self.assertIn('2>&1 | tee "$deployment_log"', deploy)
        self.assertIn('grep -Fxq', deploy, 'a green job must require final verification evidence')
        self.assertIn('TRN DEPLOYMENT VERIFIED revision=', deploy)
        self.assertIn("if: github.ref_name == 'test'", workflow)
        self.assertIn('environment: training', workflow)
        self.assertIn('ers-trn-preflight.py verify-test', workflow)
        self.assertIn('git checkout --detach $REQUESTED_REVISION', deploy)
        self.assertNotIn('make edge-', deploy)

    def test_runner_step_executes_proven_ssh_command_and_rejects_false_success(self):
        # Exercise the actual GitHub Actions bash text, with only SSH mocked.
        # No network calls, remote deployment, or Docker operations occur.
        workflow = WORKFLOW.read_text()
        deployment = workflow.split('      - name: Deploy pinned TST-approved revision using standard SSH command execution', 1)[1]
        deployment = deployment.split('      - name: Record release selection', 1)[0]
        step = deployment.split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] if line.startswith('          ') else line
                           for line in step.splitlines()) + '\n'
        tree, sha = 'b'*40, 'a'*40
        script = script.replace('${{ steps.source.outputs.tree }}', tree)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin_dir = root/'bin'
            bin_dir.mkdir()
            ssh = bin_dir/'ssh'
            ssh.write_text(textwrap.dedent('''\
                #!/usr/bin/env bash
                set -euo pipefail
                printf '%s\n' "$*" > "$TRN_TEST_SSH_COMMAND"
                if [[ "${TRN_TEST_SSH_MODE:-}" != missing ]]; then
                  printf 'PASS: TRN DEPLOYMENT VERIFIED revision=%s tree=%s\n' "$REQUESTED_REVISION" "$TRN_TEST_TREE"
                fi
                [[ "${TRN_TEST_SSH_MODE:-}" != failed ]]
                ''').lstrip())
            ssh.chmod(0o755)
            env = dict(os.environ)
            env.update(PATH=str(bin_dir)+':'+env.get('PATH',''),
                       RUNNER_TEMP=str(root), DEPLOY_USER='fixture', DEPLOY_HOST='mock.invalid',
                       REQUESTED_REVISION=sha, TRN_TEST_TREE=tree,
                       TRN_TEST_SSH_COMMAND=str(root/'ssh-command'))
            for mode, passes in [('success', True), ('missing', False), ('failed', False)]:
                env['TRN_TEST_SSH_MODE'] = mode
                got = invoke(['bash', '-c', script], cwd=ROOT, env=env)
                self.assertEqual(got.returncode == 0, passes,
                                 f'{mode}: stdout={got.stdout} stderr={got.stderr}')
                remote = (root/'ssh-command').read_text()
                self.assertIn('-n -o BatchMode=yes -o IdentitiesOnly=yes', remote)
                self.assertIn('bash -euo pipefail -c', remote)
                self.assertIn('$(git rev-parse FETCH_HEAD)', remote,
                              'runner must not execute remote git before SSH')
                self.assertIn(f'exec bash scripts/ers-trn-deploy-remote.sh {sha} {tree}', remote)
                self.assertNotIn('server-up ENV=production', remote)

    def test_remote_shell_syntax(self):
        self.assertEqual(invoke(['bash', '-n', str(RUNTIME)]).returncode, 0)
        self.assertEqual(invoke(['bash', '-n', str(BACKUP)]).returncode, 0)

    def setup_runtime(self, tmp):
        root = Path(tmp)
        (root / '.env.training').write_text('APP_ENV=training\n')
        (root / 'docker-compose.training.yml').write_text('services: {}\n')
        invoke(['git', 'init', '-q'], cwd=root)
        invoke(['git', 'config', 'user.name', 'Offline Test'], cwd=root)
        invoke(['git', 'config', 'user.email', 'test@example.invalid'], cwd=root)
        invoke(['git', 'add', '.'], cwd=root)
        checked = invoke(['git', 'commit', '-qm', 'test fixture'], cwd=root)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        revision = invoke(['git', 'rev-parse', 'HEAD'], cwd=root).stdout.strip()
        tree = invoke(['git', 'rev-parse', 'HEAD^{tree}'], cwd=root).stdout.strip()
        bin_dir = root / 'bin'
        bin_dir.mkdir()
        make = bin_dir / 'make'
        make.write_text(textwrap.dedent('''\
            #!/usr/bin/env bash
            set -euo pipefail
            printf '%s\\n' "$*" >> "$TRN_TEST_LOG"
            if [[ "${TRN_TEST_FAIL:-}" == "$1" ]]; then exit 41; fi
            state=recovery/migration-gates/current.state
            if [[ "$1" == server-migration-recovery-gate ]]; then
              mkdir -p "$(dirname "$state")"
              printf 'status=armed\\nenvironment=training\\ntarget_revision=%s\\ntarget_tree_sha=%s\\n' \\
                "$TRN_TEST_SHA" "$TRN_TEST_TREE" > "$state"
            elif [[ "$1" == server-migration-recovery-commit ]]; then
              sed -i.bak 's/^status=armed$/status=committed/' "$state"
              rm -f "$state.bak"
            elif [[ "$1" == server-migration-recovery-rollback ]]; then
              sed -i.bak 's/^status=armed$/status=rolled_back/' "$state"
              rm -f "$state.bak"
            fi
            ''').lstrip())
        make.chmod(0o755)
        docker = bin_dir / 'docker'
        docker.write_text('#!/usr/bin/env bash\nset -euo pipefail\n[[ "$*" == "volume inspect ers-trn_backend-data" ]]\n')
        docker.chmod(0o755)
        log = root / 'make.log'
        env = dict(os.environ)
        env.update(PATH=f'{bin_dir}:{env.get("PATH", "")}', TRN_TEST_LOG=str(log),
                   TRN_TEST_SHA=revision, TRN_TEST_TREE=tree)
        return root, revision, tree, log, env

    def run_runtime(self, root, revision, tree, env):
        return invoke(['bash', str(RUNTIME), revision, tree], cwd=root, env=env)

    def test_fresh_approved_training_revision_runs_full_existing_make_sequence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            result = self.run_runtime(root, sha, tree, env)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = log.read_text().splitlines()
            self.assertEqual(calls, [
                'server-environment-contract-check ENV=training',
                'server-build ENV=training',
                'server-migration-recovery-gate ENV=training MIGRATION_PREVIOUS_REVISION= MIGRATION_PREVIOUS_TREE_SHA= MIGRATION_TARGET_REVISION='+sha+' MIGRATION_TARGET_TREE_SHA='+tree,
                'server-up ENV=training', 'server-backend-health ENV=training',
                'server-migrated-db-verify ENV=training', 'server-env-caddy-health ENV=training',
                'server-migration-recovery-commit ENV=training', 'server-backup ENV=training',
            ])
            self.assertIn('status=committed', (root/'recovery/migration-gates/current.state').read_text())
            self.assertEqual((root/'.last-training-deployment-revision').read_text(), sha+'\n')
            self.assertIn(f'PASS: TRN DEPLOYMENT VERIFIED revision={sha} tree={tree}', result.stdout)
            self.assertNotIn('server-down', log.read_text())

    def test_exact_committed_gate_resumes_without_new_migration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            state = root/'recovery/migration-gates/current.state'
            state.parent.mkdir(parents=True)
            state.write_text(f'status=committed\nenvironment=training\ntarget_revision={sha}\ntarget_tree_sha={tree}\nfirst_deployment=1\n')
            result = self.run_runtime(root, sha, tree, env)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = log.read_text()
            self.assertNotIn('server-migration-recovery-gate', calls)
            self.assertNotIn('server-migration-recovery-commit', calls)
            self.assertIn('server-up ENV=training', calls)
            self.assertIn('server-backup ENV=training', calls)
            self.assertIn('RESUME:', result.stdout)
            self.assertEqual((root/'.last-training-deployment-revision').read_text(), sha+'\n')

    def test_new_revision_reuses_prior_committed_gate_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            old_sha, old_tree = 'c'*40, 'd'*40
            state = root/'recovery/migration-gates/current.state'
            state.parent.mkdir(parents=True)
            state.write_text(f'status=committed\nenvironment=training\ntarget_revision={old_sha}\ntarget_tree_sha={old_tree}\n')
            result = self.run_runtime(root, sha, tree, env)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = log.read_text()
            self.assertIn('server-migration-recovery-gate ENV=training', calls)
            self.assertIn(f'MIGRATION_PREVIOUS_REVISION={old_sha}', calls)
            self.assertIn(f'MIGRATION_PREVIOUS_TREE_SHA={old_tree}', calls)
            self.assertIn('server-migration-recovery-commit ENV=training', calls)
            self.assertEqual((root/'.last-training-deployment-revision').read_text(), sha+'\n')

    def test_committed_gate_with_wrong_tree_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            state = root/'recovery/migration-gates/current.state'
            state.parent.mkdir(parents=True)
            state.write_text(f'status=committed\nenvironment=training\ntarget_revision={sha}\ntarget_tree_sha={"e"*40}\n')
            result = self.run_runtime(root, sha, tree, env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('conflicting tree', result.stderr)
            self.assertNotIn('server-build', log.read_text())
            self.assertNotIn('server-up', log.read_text())

    def test_armed_gate_fails_closed_without_touching_services(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            state = root/'recovery/migration-gates/current.state'
            state.parent.mkdir(parents=True)
            state.write_text(f'status=armed\nenvironment=training\ntarget_revision={sha}\ntarget_tree_sha={tree}\n')
            result = self.run_runtime(root, sha, tree, env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('ARMED', result.stderr)
            self.assertNotIn('server-up', log.read_text())
            self.assertNotIn('server-build', log.read_text())
            self.assertNotIn('server-backup', log.read_text())

    def test_failed_backup_stops_only_training_and_never_claims_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            env['TRN_TEST_FAIL'] = 'server-backup'
            result = self.run_runtime(root, sha, tree, env)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('PASS: TRN DEPLOYMENT VERIFIED', result.stdout)
            self.assertIn('server-down ENV=training', log.read_text())
            self.assertNotIn('server-down ENV=production', log.read_text())
            self.assertFalse((root/'.last-training-deployment-revision').exists())
            self.assertIn('status=committed', (root/'recovery/migration-gates/current.state').read_text())

    def test_health_failure_rolls_back_armed_training_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            env['TRN_TEST_FAIL'] = 'server-backend-health'
            result = self.run_runtime(root, sha, tree, env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('server-migration-recovery-rollback ENV=training', log.read_text())
            self.assertNotIn('server-backup', log.read_text())
            self.assertFalse((root/'.last-training-deployment-revision').exists())

    def test_revision_mismatch_refuses_all_deployment_mutations(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, sha, tree, log, env = self.setup_runtime(tmp)
            result = self.run_runtime(root, 'f'*40, tree, env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('checkout does not match approved', result.stderr)
            self.assertFalse(log.exists())

    def test_backup_shell_accepts_training_and_preserves_other_environment_contracts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'scripts').mkdir()
            (root/'bin').mkdir()
            backup = root/'scripts/server-sqlite-backup.sh'
            backup.write_bytes(BACKUP.read_bytes())
            helper = root/'scripts/run-backup-go-tool.sh'
            helper.write_text(textwrap.dedent('''\
                #!/usr/bin/env bash
                set -euo pipefail
                printf '%s\\n' "$*" >> "$MOCK_BACKUP_LOG"
                if [[ "$2" == create-manifest ]]; then
                  while [[ $# -gt 0 ]]; do
                    if [[ "$1" == --manifest ]]; then touch "$2"; exit 0; fi
                    shift
                  done
                fi
                [[ "$2" == prune ]]
                ''').lstrip())
            helper.chmod(0o755)
            docker = root/'bin/docker'
            docker.write_text(textwrap.dedent('''\
                #!/usr/bin/env bash
                set -euo pipefail
                if [[ "$1" == exec && "$3" == sh ]]; then echo /app/data/app.db
                elif [[ "$1" == exec && "$3" == sqlite3 ]]; then
                  case "$*" in
                    *integrity_check*) echo ok ;;
                    *foreign_key_check*) : ;;
                    *) : ;;
                  esac
                elif [[ "$1" == exec && "$3" == rm ]]; then :
                elif [[ "$1" == cp ]]; then printf 'offline mock SQLite artifact' > "$3"
                else echo "unexpected docker call: $*" >&2; exit 3
                fi
                ''').lstrip())
            docker.chmod(0o755)
            env = dict(os.environ)
            env['PATH'] = str(root/'bin') + ':' + env.get('PATH','')
            env['MOCK_BACKUP_LOG'] = str(root/'backup.log')
            env['BACKUP_CONTAINER'] = 'ers-trn-backend'
            env['BACKUP_DIRECTORY'] = str(root/'backups')
            env['BACKUP_REPOSITORY_REVISION'] = 'a'*40
            env['BACKUP_REPOSITORY_TREE_SHA'] = 'b'*40
            for identity in ('training', 'test', 'production', 'development'):
                env['BACKUP_ENVIRONMENT'] = identity
                result = invoke(['bash', str(backup)], cwd=root, env=env)
                self.assertEqual(result.returncode, 0, f'{identity}: {result.stderr}')
                self.assertIn('Verified backup:', result.stdout)
            log = (root/'backup.log').read_text()
            for identity in ('training', 'test', 'production', 'development'):
                self.assertIn(f'--environment {identity}', log)
            env['BACKUP_ENVIRONMENT'] = 'not-training'
            bad = invoke(['bash', str(backup)], cwd=root, env=env)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn('explicitly identify', bad.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
