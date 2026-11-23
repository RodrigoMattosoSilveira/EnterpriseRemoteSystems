#!/usr/bin/env python3
"""Offline tests: TRN contracts and rejection of unsafe release/host conditions."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('preflight', ROOT/'scripts/ers-trn-preflight.py')
trn=importlib.util.module_from_spec(spec)
spec.loader.exec_module(trn)

def read(path): return (ROOT/path).read_text()

class TrainingEnvironmentTests(unittest.TestCase):
    def test_capacity_threshold_pass(self):
        trn.verify_capacity(trn.MIN_AVAILABLE_RAM+1,trn.MIN_FREE_DISK+1,0.1,2)

    def test_ram_reject(self):
        with self.assertRaises(trn.Blocked): trn.verify_capacity(1,trn.MIN_FREE_DISK+1,0,4)

    def test_disk_reject(self):
        with self.assertRaises(trn.Blocked): trn.verify_capacity(trn.MIN_AVAILABLE_RAM+1,1,0,4)

    def test_load_reject(self):
        with self.assertRaises(trn.Blocked): trn.verify_capacity(trn.MIN_AVAILABLE_RAM+1,trn.MIN_FREE_DISK+1,4.0,2)

    def test_one_cpu_reject(self):
        with self.assertRaises(trn.Blocked): trn.verify_capacity(trn.MIN_AVAILABLE_RAM+1,trn.MIN_FREE_DISK+1,0.1,1)

    def test_read_meminfo(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'meminfo';p.write_text('MemAvailable: 2097152 kB\n')
            self.assertEqual(trn.read_mem_available(p),2*1024**3)
            p.write_text('MemTotal: 500 kB\n')
            with self.assertRaises(trn.Blocked):trn.read_mem_available(p)

    def test_missing_marker_refused(self):
        with self.assertRaises(trn.Blocked): trn.verify_marker(Path('/nonexistent/missing'), 'a'*40,'b'*40)

    def test_malformed_revision_refused(self):
        with self.assertRaises(trn.Blocked): trn.verify_marker(Path('/nonexistent/missing'), 'HEAD','b'*40)

    def test_marker_revision_tree_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'marker';p.write_text('revision='+ 'a'*40+'\ntree_sha='+ 'b'*40+'\n')
            with self.assertRaises(trn.Blocked):trn.verify_marker(p, 'c'*40,'b'*40)
            with self.assertRaises(trn.Blocked):trn.verify_marker(p, 'a'*40,'c'*40)

    def test_marker_duplicate_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'marker';p.write_text('revision='+ 'a'*40+'\nrevision='+ 'a'*40+'\ntree_sha='+ 'b'*40+'\n')
            with self.assertRaises(trn.Blocked):trn.verify_marker(p,'a'*40,'b'*40)

    def test_marker_symlink_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'marker';p.write_text('x')
            link=Path(tmp)/'link';link.symlink_to(p)
            with self.assertRaises(trn.Blocked):trn.verify_marker(link,'a'*40,'b'*40)

    def test_marker_canonical_valid_and_tampered(self):
        with tempfile.TemporaryDirectory() as tmp:
            sha,tree='a'*40,'b'*40
            artifact=f'deployed-playwright-evidence-test-{sha}-{tree}-123-1'
            p=Path(tmp)/'marker';p.write_text(''.join(f'{k}={v}\n' for k,v in {
                'revision':sha,'tree_sha':tree,'deployed_playwright_evidence_sha256':'c'*64,
                'deployed_playwright_evidence_artifact':artifact,'baseline':'pre-bite30i.db',
                'baseline_sha256':'d'*64,'baseline_last_migration':'000062_tenant_administrator_cardinality.up.sql',
                'migration_under_rehearsal':'000063_global_administration_control_plane.up.sql',
                'final_migration':'000071_cross_tenant_delegated_role_isolation.up.sql',
                'deployment_final_migration':'000080_production_opening_balance.up.sql',
                'passed_at':'2026-11-16T16:00:00Z',}.items()))
            result=trn.verify_marker(p,sha,tree)
            self.assertEqual(result['test_revision'],sha)
            p.write_text(p.read_text().replace('c'*64,'not-a-digest'))
            with self.assertRaises(trn.Blocked):trn.verify_marker(p,sha,tree)

    def test_project_config_is_unique(self):
        make=read('Makefile')
        self.assertIn('COMPOSE_PROJECT := ers-trn',make)
        self.assertIn('ENV_FILE := .env.training',make)
        self.assertIn('SERVER_COMPOSE_OVERRIDE := -f docker-compose.training.yml',make)
        self.assertIn('ENV_DIR := $(SERVER_ROOT)/training',make)
        self.assertIn('BLOCKED: use an approved, pinned Test commit for TRN',make)
        override=read('docker-compose.training.yml')
        self.assertEqual(override.count('mem_limit:'),3)
        self.assertEqual(override.count('cpus:'),3)
        self.assertNotIn('ports:',override)
        self.assertNotIn('volumes:',override)

    def test_edge_isolated_and_https(self):
        self.assertIn('trn.enterpriseremotesystems.com {',read('edge/Caddyfile'))
        self.assertIn('ers-trn-caddy:80',read('edge/Caddyfile'))
        self.assertIn('ers-trn_default',read('edge/docker-compose.edge.yml'))

    def test_existing_production_guard_and_training_guard(self):
        guard=ROOT/'scripts/ers-environment-guard.sh'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'.env.training'
            good='''APP_ENV=training
CONTAINER_PREFIX=ers-trn
APP_DOMAIN=trn.enterpriseremotesystems.com
JWT_ISSUER=enterprise-remote-systems-training
AUTH_SESSION_COOKIE_NAME=ers_trn_session
DATABASE_PATH=/app/data/app.db
APP_AUTO_MIGRATE=false
AUTHZ_ACTOR_HEADER_MODE=disabled
AUTHZ_BOOTSTRAP_ENABLED=false
AUTHZ_DISABLE_ROUTE_AUTHORIZATION=false
AUTH_LOCAL_SESSION_HEADER_ENABLED=false
AUTH_SESSION_COOKIE_SECURE=true
DEV_SEED_ADMIN=false
SERVER_OFFHOST_BACKUP_ENABLED=true
SERVER_OFFHOST_BACKUP_TRANSPORT=s3
SERVER_OFFHOST_BACKUP_S3_ENDPOINT=https://hel1.your-objectstorage.com
SERVER_OFFHOST_BACKUP_S3_REGION=hel1
SERVER_OFFHOST_BACKUP_S3_BUCKET=ers
SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups/training
AWS_SHARED_CREDENTIALS_FILE=/opt/EnterpriseRemoteSystems/secrets/training-aws-credentials
AWS_PROFILE=ers-training-backup
CORS_ALLOW_ORIGINS=https://trn.enterpriseremotesystems.com
'''
            p.write_text(good)
            def check(mode): return subprocess.run([str(guard),mode,'training',str(p) if mode!='require-non-production' else 'volume deletion'],capture_output=True,text=True)
            self.assertEqual(check('require-server-contract').returncode,0)
            for variant in ('APP_AUTO_MIGRATE=true','AUTHZ_BOOTSTRAP_ENABLED=true','DEV_SEED_ADMIN=true','SERVER_OFFHOST_BACKUP_ENABLED=false','SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups/production','AUTH_SESSION_COOKIE_SECURE=false','CORS_ALLOW_ORIGINS=https://tst.enterpriseremotesystems.com'):
                k=variant.split('=')[0];bad=re.sub(rf'^{k}=.*$',variant,good,flags=re.M)
                p.write_text(bad)
                self.assertNotEqual(check('require-server-contract').returncode,0,variant)
            p.write_text(good)
            self.assertNotEqual(check('require-non-production').returncode,0)
            self.assertEqual(subprocess.run([str(guard),'require-server-contract','production',str(p)],capture_output=True).returncode,2)

    def test_no_e2e_auto_provision_in_trn_workflow(self):
        flow=read('.github/workflows/deploy-training.yml')
        self.assertIn('workflow_dispatch:',flow)
        self.assertIn('environment: training',flow)
        self.assertIn('ers-trn-preflight.py verify-test',flow)
        self.assertIn('server-migration-recovery-gate',flow)
        self.assertNotIn('server-provision-e2e-admin',flow)
        self.assertNotIn('server-replace-development-db',flow)
        self.assertNotIn(' down -v',flow)

    def test_sensitive_tools_require_explicit_training(self):
        for path in ('backend/internal/app/config.go','backend/internal/backup/backup.go','backend/internal/offhost/offhost.go','scripts/server-migration-recovery-gate.sh'):
            self.assertIn('training',read(path),path)
        self.assertIn('training',read('backend/cmd/enroll-human-admins/main.go'))

    def test_1password_training_aws_profile_and_scope(self):
        spec=importlib.util.spec_from_file_location('op_fragments',ROOT/'scripts/ers-op-validate-fragments.py')
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        valid='JWT_SECRET=another-unique-secret\nLEDGER_CORRECTION_KEY=other-unique-secret\nLEDGER_SETTLEMENT_KEY=third-unique-secret\n'
        aws='[ers-training-backup]\naws_access_key_id=training-only-id\naws_secret_access_key=training-only-key\n'
        mod.validate(valid,'training')
        mod.validate(aws,'training',aws=True)
        # Actual Training template has a leading comment. Preserve support
        # without relaxing the expected profile or credentials checks.
        trn_aws_template=read('ops/1password/training-aws-credentials.tpl')
        self.assertTrue(trn_aws_template.startswith('# Training-only S3 credentials.'))
        rendered_aws=(trn_aws_template
                      .replace('{{op://ers-training/backup-credentials/aws_access_key_id}}','training-only-id')
                      .replace('{{op://ers-training/backup-credentials/aws_secret_access_key}}','training-only-key'))
        mod.validate(rendered_aws,'training',aws=True)
        with self.assertRaises(ValueError):
            mod.validate(rendered_aws.replace('[ers-training-backup]','[ers-backup]'),'training',aws=True)
        with self.assertRaises(ValueError):mod.validate(aws,'production',aws=True)
        with self.assertRaises(ValueError):mod.validate(aws.replace('ers-training-backup','ers-backup'),'training',aws=True)
        with self.assertRaises(ValueError):mod.validate('JWT_SECRET={{op://ers-training}}\nLEDGER_CORRECTION_KEY=x\nLEDGER_SETTLEMENT_KEY=y\n','training')
        flow=read('.github/workflows/deploy-training.yml')
        self.assertIn('op vault get ers-training',flow)
        self.assertNotIn('op vault get ers-deployment >/dev/null',flow)
        self.assertIn('ers-deployment ers-recovery',flow)
        # CI must materialize the separate Training AWS profile and pass it
        # to the mandatory validator. Without it, every TRN workflow stops.
        self.assertIn('--template ops/1password/training-aws-credentials.tpl',flow)
        self.assertIn('--output "$scratch/aws-credentials" --expected-root "$scratch"',flow)
        self.assertIn('--aws-credentials "$scratch/aws-credentials"',flow)
        self.assertNotIn('--environment training --fragment "$scratch/training.env"\n          echo',flow)

    def test_training_initializer_create_only_and_scoped_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            init=ROOT/'scripts/init-server-env.sh'
            first=subprocess.run(['bash',str(init),'training'],cwd=tmp,capture_output=True,text=True)
            self.assertEqual(first.returncode,0,first.stderr)
            cfg=Path(tmp)/'.env.training'
            self.assertEqual(cfg.stat().st_mode & 0o777,0o600)
            values=dict(x.split('=',1) for x in cfg.read_text().splitlines() if '=' in x)
            for k,v in {'APP_ENV':'training','DEV_SEED_ADMIN':'false','AUTH_SESSION_COOKIE_SECURE':'true',
                        'AUTHZ_BOOTSTRAP_ENABLED':'false','SERVER_OFFHOST_BACKUP_S3_PREFIX':'ers-backups/training',
                        'JWT_ISSUER':'enterprise-remote-systems-training','LEDGER_CORRECTION_KEY':'',
                        'LEDGER_SETTLEMENT_KEY':'','AWS_PROFILE':'ers-training-backup'}.items():
                self.assertEqual(values.get(k),v,k)
            before=cfg.read_bytes()
            again=subprocess.run(['bash',str(init),'training'],cwd=tmp,capture_output=True,text=True)
            self.assertNotEqual(again.returncode,0)
            self.assertEqual(cfg.read_bytes(),before)

    def test_training_runtime_secrets_merge_preserves_other_configuration(self):
        spec=importlib.util.spec_from_file_location('trn_secrets',ROOT/'scripts/ers-trn-install-runtime-secrets.py')
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        existing='# Training only\nAPP_ENV=training\nJWT_SECRET=old\nLEDGER_CORRECTION_KEY=old\nLEDGER_SETTLEMENT_KEY=old\nDATABASE_PATH=/app/data/app.db\n'
        frag='JWT_SECRET=new-unique-jwt\nLEDGER_CORRECTION_KEY=new-ledger-key\nLEDGER_SETTLEMENT_KEY=new-settlement-key\n'
        out=mod.merge(existing,frag)
        self.assertEqual(mod.entries(out)['JWT_SECRET'],'new-unique-jwt')
        self.assertEqual(mod.entries(out)['DATABASE_PATH'],'/app/data/app.db')
        self.assertIn('# Training only',out)
        for bad in ('APP_ENV=production\n'+existing,existing.replace('APP_ENV=training','APP_ENV=test')):
            with self.assertRaises(mod.Blocked): mod.merge(bad,frag)
        for bad in (frag+'JWT_SECRET=duplicate\n',frag.replace('JWT_SECRET=new-unique-jwt','JWT_SECRET={{unresolved}}'),frag.replace('LEDGER_SETTLEMENT_KEY=new-settlement-key','UNEXPECTED_SECRET=value')):
            with self.assertRaises(mod.Blocked): mod.merge(existing,bad)
        script=read('scripts/ers-trn-install-runtime-secrets.py')
        self.assertIn('docker',script)
        self.assertIn('ers-trn_backend-data',script)
        self.assertIn('INITIALIZE-TRAINING-SECRETS',script)
        self.assertIn('os.fchmod(fd,0o600)',script)

    def test_offline_human_enrollment_tenant_safe(self):
        script=ROOT/'scripts/ers-trn-enroll.sh'
        result=subprocess.run(['bash','-n',str(script)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        s=script.read_text()
        for key in ('TRN_ENROLL_CONFIRM','TRN_ENROLL_APPROVAL','TRN_ENROLL_OPERATOR','TRN_ENROLL_BACKUP_FILE',
                    'server-backup-verify','server-offhost-backup-verify','ers-trn-backend','--environment training','--offline-confirmed'):
            self.assertIn(key,s)
        self.assertNotIn('server-replace-development-db',s)
        self.assertNotIn(' down -v',s)
        self.assertIn('scripts/ers-two-human-admin-input.py |',s)

    def test_training_documentation_operator_ready(self):
        runbook=read('docs/bite-35/byte-35-6s1a-trn-deployment.md')
        manual=read('docs/bite-35/byte-35-6s1a-manual-acceptance.md')
        for tid in range(1,13): self.assertRegex(manual,rf'(?m)^## T{tid:02d} —')
        for needle in ('ers-trn-install-runtime-secrets.py','ers-op-materialize.py',
                       'ers-op-validate-fragments.py','ers-trn-enroll.sh','TRN_ENROLL_BACKUP_FILE',
                       'GitHub','latest','server-backup','1Password','Glossary Impact'):
            self.assertIn(needle,runbook)
        for needle in ('server-restore-materialize-offhost','server-restore-verify','Never execute `server-restore-apply`'):
            self.assertIn(needle,manual)
        self.assertIn('https://trn.enterpriseremotesystems.com',read('docs/bite-35/byte-35-6s1-onboarding-operator-guide.md'))

    def test_deploy_workflow_does_not_alias_training_to_test_or_production(self):
        flow=read('.github/workflows/deploy-training.yml')
        self.assertIn('github.ref_name == \'test\'',flow)
        self.assertIn('REQUESTED_REVISION',flow)
        self.assertIn('approval_reference',flow)
        self.assertIn('environment: training',flow)
        self.assertIn('MIGRATION_TARGET_REVISION',flow)
        self.assertIn('server-backup ENV=training',flow)
        self.assertIn('make server-down ENV=training || true',flow)
        self.assertNotIn('server-up ENV=production',flow)
        self.assertNotIn('server-up ENV=test',flow)
        self.assertNotIn('server-replace-development-db',flow)

if __name__=='__main__':unittest.main(verbosity=2)
