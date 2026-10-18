#!/usr/bin/env python3
"""Fail-closed isolated rehearsal regression; fake external S3/restore commands only in unit test.

The real operator runner always invokes genuine remote verification and restore.
"""
import contextlib
import io
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
from types import SimpleNamespace
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('rehearsal',ROOT/'scripts/ers-emergency-admin-isolated-rehearsal.py')
rehearsal=importlib.util.module_from_spec(spec);spec.loader.exec_module(rehearsal)
fixture_spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/test-emergency-admin-recovery.py')
fixture=importlib.util.module_from_spec(fixture_spec);fixture_spec.loader.exec_module(fixture)


def dumps(file, obj):
    file.write_text(json.dumps(obj,indent=2)+'\n')


def run():
    with tempfile.TemporaryDirectory(prefix='ers-admin-rehearsal-unit-') as td:
        root=Path(td);source=root/'source';source.mkdir();backup=source/'app-test.db';fixture.fixture(backup)
        now=dt.datetime.now(dt.timezone.utc)
        created=now.isoformat()
        manifest=source/'app-test.db.manifest.json'
        data={'environment':'production','status':'verified','created_at':created,
              'backup':{'size_bytes':backup.stat().st_size,'sha256':rehearsal.sha(backup)},
              'verification':{'integrity_check':'ok'},
              'repository':{'revision':'1'*40,'tree_sha':'2'*40}}
        dumps(manifest,data)
        receipt=source/'app-test.db.offhost.json'
        doc={'status':'verified','environment':'production','transport':'s3',
             'source':{'backup_file':backup.name,'manifest_file':manifest.name,
                       'backup_sha256':rehearsal.sha(backup),
                       'manifest_sha256':rehearsal.sha(manifest)},
             'remote':{k:{'key':k,'version_id':'v1','sha256':rehearsal.sha(f)}
                       for k,f in [('backup',backup),('manifest',manifest)]},
             'verification':{'integrity_check':'ok'}}
        dumps(receipt,doc)
        custody=root/'custody.json'
        slots={}
        for i,slot in enumerate(('owner-a','owner-b')):
            slots[slot]={'person_id':f'owner-{i}', 'witness_id':'auditor-x',
                         'custody_method':'hardware-key','attested_at':created,
                         'public_key_sha256':str(i+1)*64,
                         'owner_controls_private_key':True,
                         'private_key_excluded_from_production_host':True}
        dumps(custody,{'slots':slots})
        env_file=root/'test-only.env';env_file.write_text('test-only\n')
        workroot=root/'workspace';workroot.mkdir()
        original=rehearsal.sha(backup)
        args=SimpleNamespace(backup=str(backup),manifest=str(manifest),receipt=str(receipt),
            custody=str(custody),offhost_env_file=str(env_file),login='administrator@example.invalid',
            work_root=str(workroot),max_age_hours=24,confirm='ISOLATED-COPY-ONLY')
        real_run=subprocess.run
        def mocked(cmd, *pos, **kwargs):
            if len(cmd)>1 and str(cmd[0]).endswith('run-backup-go-tool.sh'):
                if cmd[1]=='ers-restore':
                    shutil.copyfile(cmd[cmd.index('--backup')+1],cmd[cmd.index('--target')+1])
                    Path(cmd[cmd.index('--report')+1]).write_text('{}\n')
                return SimpleNamespace(returncode=0)
            return real_run(cmd,*pos,**kwargs)
        with mock.patch.object(rehearsal.subprocess,'run',side_effect=mocked):
            # Simulate Python 3.9, where hashlib.file_digest is unavailable.
            # Both the shared manifest check and the isolated backup verifier
            # must work without calling that newer API.
            with mock.patch.object(hashlib, 'file_digest', None, create=True):
                evidence=rehearsal.backup_evidence(backup,manifest,receipt,24,env_file)
                mismatched=source/'bad-digest.manifest.json'
                bad=json.loads(manifest.read_text())
                bad['backup']['sha256']='0'*64
                dumps(mismatched,bad)
                try: rehearsal.mod.check_backup(backup,mismatched)
                except AssertionError: pass
                else: raise AssertionError('mismatched backup digest accepted')
            assert evidence['exact_s3_versions_verified']
            rehearsal.prepare(args)
            dirs=list(workroot.glob('ers-admin-rehearsal-*'))
            assert len(dirs)==1
            work=dirs[0]
            assert (work/'scratch.db').is_file() and (work/'request.json').is_file()
            assert rehearsal.sha(backup)==original
            assert rehearsal.sha(work/'scratch.db')==original
            assert (work/'state.json').is_file()
            args.confirm='WRONG-CONFIRMATION'
            try:rehearsal.prepare(args)
            except ValueError:pass
            else:raise AssertionError('wrong confirmation accepted')
            args.confirm='ISOLATED-COPY-ONLY'
            data['created_at']=(now-dt.timedelta(days=2)).isoformat()
            dumps(manifest,data)
            doc['source']['manifest_sha256']=rehearsal.sha(manifest)
            doc['remote']['manifest']['sha256']=rehearsal.sha(manifest)
            dumps(receipt,doc)
            try:rehearsal.backup_evidence(backup,manifest,receipt,24,env_file)
            except ValueError:pass
            else:raise AssertionError('stale Production backup accepted')
            data['created_at']=created;dumps(manifest,data)
            doc['source']['manifest_sha256']=rehearsal.sha(manifest)
            doc['remote']['manifest']['sha256']=rehearsal.sha(manifest)
            doc['remote']['manifest']['version_id']='';dumps(receipt,doc)
            try:rehearsal.backup_evidence(backup,manifest,receipt,24,env_file)
            except ValueError:pass
            else:raise AssertionError('missing immutable off-host version accepted')
            slots['owner-b']['person_id']=slots['owner-a']['person_id']
            dumps(custody,{'slots':slots})
            try:rehearsal.read_custody(custody)
            except ValueError:pass
            else:raise AssertionError('one person masquerading as both owners accepted')
            assert rehearsal.sha(backup)==original
            # No signed approvals: finish MUST fail, emit a FAIL report, and
            # destroy every private restored Production-derived scratch byte.
            doc['remote']['manifest']['version_id']='v1';dumps(receipt,doc)
            slots['owner-b']['person_id']='owner-1';dumps(custody,{'slots':slots})
            approvals=root/'approvals';approvals.mkdir()
            trust=root/'trust';trust.mkdir()
            reports=root/'reports';reports.mkdir(mode=0o700)
            os.chmod(reports,0o700)
            final=SimpleNamespace(workspace=str(work),approvals=str(approvals),trust_dir=str(trust),
                                  custody=str(custody),report_output=str(reports/'rehearsal.json'),
                                  max_age_hours=24)
            captured=io.StringIO()
            with contextlib.redirect_stderr(captured):
                try:rehearsal.finish(final)
                except ValueError:pass
                else:raise AssertionError('missing approvals accepted')
            assert 'ERS_REHEARSAL ISOLATED_END_TO_END FAIL' in captured.getvalue()

            assert not work.exists(), 'failed rehearsal did not scrub restored DB/token'
            assert json.loads((reports/'rehearsal.json').read_text())['status']=='failed'
            assert rehearsal.sha(backup)==original
        try:
            rehearsal.offline_writer_check(SimpleNamespace(db=str(backup),confirm='READ-ONLY-PRODUCTION-WRITER-CHECK'))
        except ValueError:pass
        else:raise AssertionError('host writer gate accepted non-Production context')
    # Gate B must report exactly which OpenSSL operation failed; never convert
    # an unsupported Ed25519 verifier into a synthetic PASS or reveal stderr.
    def host_probe(command, *pos, **kwargs):
        if command[1] == 'version':
            return SimpleNamespace(returncode=0, stdout='OpenSSL 3.0.0 synthetic\n')
        if command[1] == 'pkey':
            return SimpleNamespace(returncode=0, stdout=b'\x30\x01\x00')
        if 'altered-message' in str(command[command.index('-in')+1]):
            return SimpleNamespace(returncode=1, stdout=b'')
        return SimpleNamespace(returncode=0, stdout=b'')
    with mock.patch.object(rehearsal.shutil, 'which', return_value='/test-only/openssl'):
        with mock.patch.object(rehearsal.subprocess, 'run', side_effect=host_probe):
            output=io.StringIO()
            with contextlib.redirect_stdout(output):
                rehearsal.host_check(SimpleNamespace())
            assert 'HOST_OPENSSL_PATH=/test-only/openssl' in output.getvalue()
            assert 'RECOVERY_HOST_OPENSSL PASS' in output.getvalue()

        def unsupported_verify(command, *pos, **kwargs):
            result=host_probe(command,*pos,**kwargs)
            if command[1]=='pkeyutl':
                return SimpleNamespace(returncode=1,stdout=b'',stderr=b'PRIVATE_DIAGNOSTIC')
            return result
        with mock.patch.object(rehearsal.subprocess, 'run', side_effect=unsupported_verify):
            try:
                rehearsal.host_check(SimpleNamespace())
            except ValueError as exc:
                assert str(exc)=='HOST_ED25519_VALID_SIGNATURE_REJECTED'
                assert 'PRIVATE_DIAGNOSTIC' not in str(exc)
            else:
                raise AssertionError('unsupported OpenSSL accepted as compatible')

        def accepts_tampering(command, *pos, **kwargs):
            result=host_probe(command,*pos,**kwargs)
            if command[1]=='pkeyutl':
                return SimpleNamespace(returncode=0,stdout=b'')
            return result
        with mock.patch.object(rehearsal.subprocess, 'run', side_effect=accepts_tampering):
            try:
                rehearsal.host_check(SimpleNamespace())
            except ValueError as exc:
                assert str(exc)=='HOST_ED25519_TAMPERED_SIGNATURE_ACCEPTED'
            else:
                raise AssertionError('tampered message acceptance did not fail Gate B')

    print('Bite 33.6.6A isolated rehearsal safety regressions PASS')

if __name__=='__main__':run()
