#!/usr/bin/env python3
"""Generate independent, encrypted Ed25519 owner keys in the approved container.

One confirmed passphrase is fed to BOTH OpenSSL processes over Docker stdin.
No passphrase appears in argv, environment, files or diagnostic logs.
Run separately on EACH owner's own controlled Mac. Never transfer private keys.
"""
import argparse
from datetime import datetime, timezone
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

class Failure(Exception):pass

def check(ok,code):
    if not ok:raise Failure(code)

def docker(args, passphrase=None, timeout=120):
    return subprocess.run(['docker',*args], input=(passphrase+'\n').encode('utf8') if passphrase is not None else None,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,check=False)

def own_key_main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--slot',choices=['owner-a','owner-b'],required=True)
    parser.add_argument('--package',type=Path,help='Override the default per-owner package path')
    parser.add_argument('--independent-sha',help='Required for owner-b: separately authenticated image archive SHA-256')
    parser.add_argument('--archive-existing',action='store_true',help='Explicitly preserve any FAILED prior attempt before generating fresh keys')
    args=parser.parse_args()
    check(sys.stdin.isatty() and sys.stderr.isatty(),'INTERACTIVE_TERMINAL_REQUIRED')
    os.umask(0o077)
    slot=args.slot
    home=Path.home()
    package=args.package or (home/'.ers-recovery/owner-enrollment-package' if slot=='owner-a' else home/'Downloads/ers-owner-enrollment')
    print('ERS_GATEC '+slot.upper().replace('-', '_')+'_ENROLLMENT_STARTED', flush=True)
    check(package.is_dir() and not package.is_symlink(),'PACKAGE_MISSING')
    # Verify full OCI digest chain, not just the accompanying checksum text.
    import importlib.util
    spec = importlib.util.spec_from_file_location('gatec_package', Path(__file__).with_name('ers-gatec-package.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if slot == 'owner-b':
        check(args.independent_sha is not None and re.fullmatch(r'[0-9a-f]{64}',args.independent_sha) is not None,
              'INDEPENDENT_ARCHIVE_SHA_REQUIRED_FOR_OWNER_B')
    if slot == 'owner-a':
        lock_path = home/'.ers-recovery/gate-b-approved-image-lock.json'
        check(lock_path.is_file() and not lock_path.is_symlink(),'APPROVED_LOCK_MISSING')
        lock = json.loads(lock_path.read_text())
        mod.verify_approved_source(home/'projects/EnterpriseRemoteSystems',lock['source_sha'])
        image_id = mod.load_package(package,expected_image_id=lock['image_id'],
                    platform=lock['platform'],source=lock['source_sha'],base=lock['base_image'])
    else:
        image_id = mod.load_package(package,expected_sha=args.independent_sha)
    info = docker(['image','inspect',image_id],timeout=30)
    check(info.returncode==0,'DOCKER_IMAGE_NOT_LOADED')
    row=json.loads(info.stdout)[0]
    check(row.get('Id')==image_id,'DOCKER_IMAGE_ID_MISMATCH')
    check(row.get('Os')=='linux' and row.get('Architecture') in ('amd64','arm64'),'DOCKER_IMAGE_PLATFORM_INVALID')
    if slot == 'owner-a':
        check(row.get('Os')+'/'+row.get('Architecture')==lock['platform'],'DOCKER_IMAGE_PLATFORM_MISMATCH')
    print('ERS_GATEC APPROVED_IMAGE_FOUND PASS',flush=True)
    base=home/'.ers-owner-recovery'
    active=base/slot
    private=slot+'-private.pem'
    public=slot+'.pem'
    for enrolled in (home/'.ers-recovery/trust-public-keys'/public, home/'.ers-recovery/incoming-public'/public):
        check(not enrolled.exists() and not enrolled.is_symlink(),'KEY_ALREADY_ENROLLED_STOP')
    check(not base.is_symlink() and not active.is_symlink(),'KEY_DIRECTORY_SYMLINK')
    check(not active.exists() or active.is_dir(),'KEY_DIRECTORY_INVALID')
    check(not active.exists() or all(f.is_file() and not f.is_symlink() and f.name in (private,public) for f in active.iterdir()),'UNEXPECTED_OLD_KEY_FILES')
    base.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(base,0o700)
    if active.exists() and not args.archive_existing:
        raise Failure('EXISTING_KEY_DIRECTORY_STOP: use --archive-existing ONLY for an un-enrolled failed attempt')
    if args.archive_existing:
        check(active.exists(),'NO_OLD_KEY_DIRECTORY_TO_ARCHIVE')
        check(all(p.is_file() and not p.is_symlink() and p.name in (private,public) for p in active.iterdir()),'UNEXPECTED_FILES_IN_OLD_DIRECTORY')
        choice=input('Preserve the OLD, un-enrolled attempt and generate NEW keys? Type ARCHIVE: ').strip()
        check(choice=='ARCHIVE','ARCHIVE_NOT_CONFIRMED')
    first=getpass.getpass('New encryption passphrase (minimum 16 characters): ')
    verify=getpass.getpass('Repeat the SAME encryption passphrase: ')
    check(first==verify and len(first)>=16 and '\n' not in first and '\r' not in first,'PASSPHRASE_INVALID_OR_MISMATCH')
    del verify
    print('ERS_GATEC ONE_PASSPHRASE_CONFIRMED PASS',flush=True)
    pending=base/('.'+slot+'-pending-'+secrets.token_hex(8))
    pending.mkdir(mode=0o700)
    container='ers-enroll-'+slot+'-'+secrets.token_hex(6)
    args_base=['run','--rm','-i','--name',container,'--pull','never','--network','none','--read-only',
               '--cap-drop','ALL','--security-opt','no-new-privileges', '--user',f'{os.getuid()}:{os.getgid()}',
               '--mount',f'type=bind,source={pending},target=/owner','--entrypoint','/usr/bin/openssl',image_id]
    success=False
    try:
        try:
            result=docker(args_base+['genpkey','-algorithm','ED25519','-aes-256-cbc','-pass','stdin','-out','/owner/'+private],first)
            check(result.returncode==0,'ENCRYPTED_KEY_GENERATION_FAILED')
            print('ERS_GATEC ENCRYPTED_PRIVATE_KEY_CREATED PASS',flush=True)
            result=docker(args_base+['pkey','-in','/owner/'+private,'-passin','stdin','-pubout','-out','/owner/'+public],first)
            check(result.returncode==0,'PUBLIC_KEY_EXTRACTION_FAILED')
            print('ERS_GATEC PUBLIC_KEY_DERIVED PASS',flush=True)
            # Verify the private key decrypts and independently yields EXACTLY the stored public key.
            result=docker(args_base+['pkey','-in','/owner/'+private,'-passin','stdin','-pubout'],first)
            check(result.returncode==0 and result.stdout==(pending/public).read_bytes(),'KEYPAIR_MISMATCH')
        finally:
            del first
            # Restrict cleanup to this invocation. Docker --rm already removes normally.
            cleanup=docker(['rm','-f',container],timeout=15)
            # docker --rm already removes a completed container. A live container must not remain.
            remaining=docker(['container','inspect',container],timeout=15)
            check(remaining.returncode!=0,'TEST_CONTAINER_CLEANUP_FAILED')
        p=pending/private
        q=pending/public
        check(p.is_file() and not p.is_symlink() and q.is_file() and not q.is_symlink(),'KEY_FILE_MISSING_OR_SYMLINK')
        check(p.read_bytes().startswith(b'-----BEGIN ENCRYPTED PRIVATE KEY-----\n'),'PRIVATE_KEY_NOT_ENCRYPTED')
        check(q.read_bytes().startswith(b'-----BEGIN PUBLIC KEY-----\n'),'PUBLIC_KEY_FORMAT_INVALID')
        os.chmod(p,0o600);os.chmod(q,0o600)
        if active.exists():
            backup=base/(slot+'-abandoned-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(4))
            active.rename(backup)
            print('ERS_GATEC PREVIOUS_ATTEMPT_PRESERVED PASS')
            try:pending.rename(active)
            except Exception:
                backup.rename(active)
                raise
        else:pending.rename(active)
        success=True
        print('ERS_GATEC '+slot.upper().replace('-', '_')+'_ENCRYPTED_PRIVATE_KEY PASS')
        print('ERS_GATEC '+slot.upper().replace('-', '_')+'_PUBLIC_KEY PASS')
        print('ERS_GATEC '+slot.upper().replace('-', '_')+'_KEYPAIR_CREATED PASS')
        print('ERS_GATEC OWNER_KEY_COMPLETE PASS')
    finally:
        if not success and pending.exists():
            print('ERS_GATEC PENDING_KEY_FILES_PRESERVED='+str(pending),file=sys.stderr)

if __name__=='__main__':
    try:own_key_main()
    except (Failure,OSError,ValueError,IndexError,subprocess.TimeoutExpired,EOFError,KeyboardInterrupt) as e:
        print('ERS_GATEC '+str(e)+' FAIL',file=sys.stderr)
        raise SystemExit(1)
