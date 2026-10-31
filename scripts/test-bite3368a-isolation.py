#!/usr/bin/env python3
"""Adversarial offline tests of the actual isolated recovery container helper.

No Docker daemon, deployed Test volume or credentials are used. A separate
Docker-level test is required before promotion to Test.
"""
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts' / 'ers-recovery-isolated-container.sh'
IMAGE = 'sha256:' + 'a' * 64
FAKE_DOCKER = '''#!/usr/bin/env python3
import json,os,sys
args=sys.argv[1:]
with open(os.environ['FAKE_DOCKER_LOG'],'a') as f: f.write(json.dumps(args)+'\\n')
if args[:2] == ['image','inspect']:
    print(os.environ['FAKE_IMAGE'])
elif args[:2] == ['container','inspect']:
    sys.exit(1 if os.environ.get('FAKE_CONTAINER_ABSENT')=='1' else 0)
elif args[0]=='inspect':
    print(os.environ['FAKE_INSPECT'])
elif args[0]=='exec' and 'sqlite3' in args:
    if 'integrity_check' in args[-1]: print(os.environ.get('FAKE_INTEGRITY','ok'))
    else: print(os.environ.get('FAKE_KEYS',''),end='')
elif args[0]=='run' and '-d' in args:
    print('1234abcd')
'''

class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ers-3368a-')
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.work = self.root / 'rehearsal-1'
        self.boot = self.work / 'boot-data'
        self.boot.mkdir(parents=True)
        (self.work / 'migrated.db').write_bytes(b'synthetic only')
        (self.boot / 'app.db').write_bytes(b'synthetic only')
        env_file = self.root / '.env.test'
        env_file.write_text('APP_ENV=test\nJWT_SECRET=dummy-only\n')
        dockerdir = self.root / 'bin'
        dockerdir.mkdir()
        fake = dockerdir / 'docker'
        fake.write_text(FAKE_DOCKER)
        fake.chmod(0o755)
        self.log = self.root / 'docker.jsonl'
        self.env = dict(os.environ,
            PATH=str(dockerdir) + ':' + os.environ['PATH'],
            ERS_RECOVERY_IMAGE=IMAGE,
            ERS_RECOVERY_WORKDIR=str(self.work),
            ERS_RECOVERY_BOOT_DIR=str(self.boot),
            ERS_RECOVERY_CONTAINER='ers-3368a-synthetic',
            ERS_RECOVERY_ENV_FILE=str(env_file),
            ERS_RECOVERY_ENVIRONMENT='test',
            ERS_RECOVERY_EXPECTED_MIGRATION='000076.up.sql',
            FAKE_DOCKER_LOG=str(self.log),
            FAKE_IMAGE=IMAGE)
        self.base_inspect = [{
            'Image':IMAGE,
            'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'VolumesFrom':[]},
            'Mounts':[{'Type':'bind','Source':str(self.boot),'Destination':'/rehearsal-data','RW':True}],
            'Config':{'Env':['DATABASE_PATH=/rehearsal-data/app.db','DB_PATH=/rehearsal-data/app.db',
                            'APP_ENV=test','APP_AUTO_MIGRATE=false','AUTHZ_BOOTSTRAP_ENABLED=false']}}]
        self.env['FAKE_INSPECT'] = json.dumps(self.base_inspect)

    def call(self, action, **overrides):
        return subprocess.run(['bash',str(HELPER),action], cwd=self.root,
            env=dict(self.env,**overrides), stdin=subprocess.DEVNULL,
            capture_output=True,text=True,timeout=12)

    def calls(self):
        return [json.loads(x) for x in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_migrations_never_use_compose_or_test_volume(self):
        for op in ('migrate','verify'):
            self.assertEqual(self.call(op).returncode,0)
        commands = [c for c in self.calls() if c[0]=='run']
        self.assertEqual(len(commands),2)
        for cmd in commands:
            self.assertIn('--read-only',cmd)
            self.assertEqual(cmd[cmd.index('--network')+1],'none')
            self.assertIn(f'type=bind,src={self.work},dst=/rehearsal',cmd)
            self.assertNotIn('backend-data',repr(cmd))
            self.assertNotIn('compose',repr(cmd))
            self.assertIn(IMAGE,cmd)

    def test_boot_has_single_private_mount_and_overrides_all_db_paths(self):
        r=self.call('start',FAKE_CONTAINER_ABSENT='1')
        self.assertEqual(r.returncode,0,r.stderr)
        cmd=[c for c in self.calls() if c[0]=='run'][0]
        self.assertIn(f'type=bind,src={self.boot},dst=/rehearsal-data',cmd)
        self.assertIn('DB_PATH=/rehearsal-data/app.db',cmd)
        self.assertIn('DATABASE_PATH=/rehearsal-data/app.db',cmd)
        self.assertIn('--read-only',cmd)
        self.assertIn('--env-file',cmd)
        self.assertEqual(cmd[cmd.index('--network')+1],'none')
        self.assertEqual(self.call('inspect').returncode,0)

    def test_existing_container_never_removed_or_replaced(self):
        self.assertNotEqual(self.call('start').returncode,0)
        self.assertFalse(any(c[0] in ('run','rm') for c in self.calls()))

    def test_named_test_volume_rejected(self):
        obj=json.loads(json.dumps(self.base_inspect))
        obj[0]['Mounts'].append({'Type':'volume','Name':'ers-tst_backend-data',
                                  'Destination':'/app/data','RW':True})
        r=self.call('inspect',FAKE_INSPECT=json.dumps(obj))
        self.assertNotEqual(r.returncode,0)
        self.assertIn('BLOCKED',r.stderr)

    def test_wrong_database_environment_rejected(self):
        obj=json.loads(json.dumps(self.base_inspect))
        obj[0]['Config']['Env'][1]='DB_PATH=/app/data/app.db'
        self.assertNotEqual(self.call('inspect',FAKE_INSPECT=json.dumps(obj)).returncode,0)

    def test_network_and_image_tamper_rejected(self):
        for field,value in [('NetworkMode','bridge'),('ReadonlyRootfs',False)]:
            obj=json.loads(json.dumps(self.base_inspect));obj[0]['HostConfig'][field]=value
            self.assertNotEqual(self.call('inspect',FAKE_INSPECT=json.dumps(obj)).returncode,0)
        obj=json.loads(json.dumps(self.base_inspect));obj[0]['Image']='sha256:'+'b'*64
        self.assertNotEqual(self.call('inspect',FAKE_INSPECT=json.dumps(obj)).returncode,0)

    def test_corrupt_restored_copy_blocks_even_when_other_volume_healthy(self):
        self.assertNotEqual(self.call('check-db',FAKE_INTEGRITY='database disk image is malformed').returncode,0)
        self.assertNotEqual(self.call('check-db',FAKE_KEYS='bad foreign key').returncode,0)
        self.assertEqual(self.call('check-db').returncode,0)
        checks=[c for c in self.calls() if c[0]=='exec' and 'sqlite3' in c]
        self.assertTrue(checks)
        self.assertTrue(all('/rehearsal-data/app.db' in c for c in checks))
        self.assertFalse(any('/app/data/app.db' in c for c in checks))

    def test_mount_source_mismatch_rejected(self):
        obj=json.loads(json.dumps(self.base_inspect))
        obj[0]['Mounts'][0]['Source']='/opt/EnterpriseRemoteSystems/test/volume'
        self.assertNotEqual(self.call('inspect',FAKE_INSPECT=json.dumps(obj)).returncode,0)

    def test_restore_and_remote_tools_do_not_inherit_compose_volumes(self):
        # Execute the *actual* run_tool function from the orchestration script
        # with a recording Docker substitute, not a textual grep assertion.
        main = (ROOT / 'scripts' / 'server-recovery-rehearsal.sh').read_text()
        section = main.split('run_tool() {',1)[1].split('\n# All newly created',1)[0]
        function = 'run_tool() {' + section
        code = '\n'.join([
            'set -euo pipefail',
            'REHEARSAL_ENV_DIR=' + str(self.root),
            'REHEARSAL_ENV_FILE=.env.test',
            'rehearsal_dir=' + str(self.work),
            'rehearsal_image=' + IMAGE,
            function,
            'run_tool ers-restore stage --backup /some/backup',
            'run_tool ers-offhost-backup materialize --environment test',
        ])
        (self.root / '.env.test').write_text('APP_ENV=test\n')
        r=subprocess.run(['bash','-c',code],cwd=self.root,env=self.env,
                         stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=12)
        self.assertEqual(r.returncode,0,r.stderr)
        runs=[c for c in self.calls() if c[0]=='run']
        self.assertEqual(len(runs),2)
        for args in runs:
            self.assertIn(f'type=bind,src={self.root},dst={self.root},readonly',args)
            self.assertIn(f'type=bind,src={self.work},dst={self.work}',args)
            self.assertNotIn('backend-data',repr(args))
            self.assertNotIn('compose',repr(args))
            self.assertIn('--read-only',args)
        self.assertEqual(runs[0][runs[0].index('--network')+1],'none')
        self.assertEqual(runs[1][runs[1].index('--network')+1],'bridge')

    def test_no_containers_after_successful_stop(self):
        self.assertEqual(self.call('stop',FAKE_CONTAINER_ABSENT='1').returncode,0)
        self.assertFalse(any(c[0]=='rm' for c in self.calls()))

if __name__=='__main__':
    unittest.main(verbosity=2)
