#!/usr/bin/env python3
"""Public-only Ed25519 fingerprint and safe operator enrollment, using Gate B Docker.

Never mounts or loads a private key. Does not modify Production.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

HEX64=re.compile(r'^[0-9a-f]{64}$')
HEXID=re.compile(r'^sha256:[0-9a-f]{64}$')
class Failure(Exception):pass

def require(ok,code):
    if not ok:raise Failure(code)

def image_for(package):
    path=package/'ers-approved-image-id.txt'
    require(path.is_file() and not path.is_symlink(),'IMAGE_ID_FILE_MISSING')
    id=path.read_text().strip()
    require(HEXID.fullmatch(id) is not None,'IMAGE_ID_INVALID')
    output=subprocess.run(['docker','image','inspect',id],capture_output=True,text=True)
    require(output.returncode==0,'APPROVED_DOCKER_IMAGE_MISSING')
    row=json.loads(output.stdout)[0]
    require(row.get('Id')==id,'DOCKER_IMAGE_ID_MISMATCH')
    return id

def fingerprint(public,image_id):
    require(public.is_file() and not public.is_symlink(),'PUBLIC_KEY_MISSING_OR_SYMLINK')
    require(public.read_bytes().startswith(b'-----BEGIN PUBLIC KEY-----\n'),'PUBLIC_KEY_NOT_PEM')
    name='ers-gatec-fp-'+secrets.token_hex(6)
    command=['docker','run','--rm','--name',name,'--pull','never','--network','none','--read-only',
             '--cap-drop','ALL','--security-opt','no-new-privileges','--user',f'{os.getuid()}:{os.getgid()}',
             '--mount',f'type=bind,source={public.resolve()},target=/public.pem,readonly',
             '--entrypoint','/usr/bin/openssl',image_id,'pkey','-pubin','-in','/public.pem','-outform','DER']
    try:
        output=subprocess.run(command,capture_output=True,timeout=60)
        require(output.returncode==0 and len(output.stdout)==44 and
                output.stdout.startswith(bytes.fromhex('302a300506032b6570032100')),
                'PUBLIC_KEY_NOT_ED25519')
        fp=hashlib.sha256(output.stdout).hexdigest()
        return fp
    finally:
        subprocess.run(['docker','rm','-f',name],capture_output=True,timeout=15)
        leftover=subprocess.run(['docker','container','inspect',name],capture_output=True,timeout=15)
        require(leftover.returncode!=0,'FINGERPRINT_CONTAINER_CLEANUP_FAILED')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='action',required=True)
    fp=sub.add_parser('fingerprint')
    fp.add_argument('--slot',choices=['owner-a','owner-b'],required=True)
    fp.add_argument('--public',type=Path,help='Default: ~/.ers-owner-recovery/<slot>/<slot>.pem')
    fp.add_argument('--package',type=Path)
    sub.add_parser('verify-enrolled',help='Read-only check of both enrolled public PEMs and fingerprint evidence')
    en=sub.add_parser('enroll')
    en.add_argument('--owner-b-public',type=Path,required=True,help='Owner B public PEM received in operator inbox')
    en.add_argument('--owner-a-authenticated-sha',required=True,help='Owner A fingerprint independently authenticated')
    en.add_argument('--owner-b-authenticated-sha',required=True,help='Owner B fingerprint independently authenticated')
    args=p.parse_args()
    os.umask(0o077)
    home=Path.home()
    if args.action=='fingerprint':
        pkg=args.package or (home/'.ers-recovery/owner-enrollment-package' if args.slot=='owner-a' else home/'Downloads/ers-owner-enrollment')
        public=args.public or home/'.ers-owner-recovery'/args.slot/(args.slot+'.pem')
        digest=fingerprint(public,image_for(pkg))
        print('ERS_GATEC '+args.slot.upper().replace('-','_')+'_PUBLIC_SHA256='+digest)
        print('ERS_GATEC PUBLIC_FINGERPRINT PASS')
        return
    if args.action=='verify-enrolled':
        trust=home/'.ers-recovery/trust-public-keys'
        evidence=trust/'gate-c-fingerprints.json'
        require(trust.is_dir() and not trust.is_symlink() and evidence.is_file() and not evidence.is_symlink(),
                'TRUST_EVIDENCE_MISSING')
        expected=json.loads(evidence.read_text())
        require(set(expected)=={'owner-a','owner-b'} and
                all(isinstance(v,str) and HEX64.fullmatch(v) for v in expected.values()) and
                expected['owner-a']!=expected['owner-b'],'TRUST_FINGERPRINTS_INVALID')
        image=image_for(home/'.ers-recovery/owner-enrollment-package')
        for slot in ('owner-a','owner-b'):
            require(fingerprint(trust/(slot+'.pem'),image)==expected[slot],
                    'ENROLLED_PUBLIC_KEY_CHANGED_'+slot.upper().replace('-','_'))
        print('ERS_GATEC ENROLLED_PUBLIC_KEYS_VERIFIED PASS')
        return
    require(HEX64.fullmatch(args.owner_a_authenticated_sha) is not None and HEX64.fullmatch(args.owner_b_authenticated_sha) is not None,'AUTHENTICATED_FINGERPRINT_FORMAT')
    require(args.owner_a_authenticated_sha!=args.owner_b_authenticated_sha,'AUTHENTICATED_FINGERPRINTS_IDENTICAL')
    a=home/'.ers-owner-recovery/owner-a/owner-a.pem'
    b=args.owner_b_public
    pkg=home/'.ers-recovery/owner-enrollment-package'
    image_id=image_for(pkg)
    a_fp=fingerprint(a,image_id)
    b_fp=fingerprint(b,image_id)
    require(a_fp==args.owner_a_authenticated_sha and b_fp==args.owner_b_authenticated_sha,'INDEPENDENT_FINGERPRINT_MISMATCH')
    require(a_fp!=b_fp,'DUPLICATED_KEYS')
    root=home/'.ers-recovery'
    require(root.is_dir() and not root.is_symlink(),'RECOVERY_ROOT_UNSAFE')
    trust=root/'trust-public-keys'
    require(not trust.exists() and not trust.is_symlink(), 'PUBLIC_KEY_ALREADY_ENROLLED_STOP')
    # Write and seal a complete public-only trust directory before publishing it atomically.
    stage=root/('.gatec-trust-pending-'+secrets.token_hex(8))
    stage.mkdir(mode=0o700)
    try:
        for slot,source in (('owner-a',a),('owner-b',b)):
            target=stage/(slot+'.pem')
            fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as out:out.write(source.read_bytes())
        with (stage/'gate-c-fingerprints.json').open('x') as out:
            json.dump({'owner-a':a_fp,'owner-b':b_fp},out,indent=2,sort_keys=True)
            out.write('\n')
        os.chmod(stage/'gate-c-fingerprints.json',0o600)
        require(not trust.exists() and not trust.is_symlink(),'PUBLIC_KEY_ALREADY_ENROLLED_STOP')
        stage.rename(trust)
    except Exception:
        print('ERS_GATEC UNPUBLISHED_TRUST_STAGE='+str(stage),file=sys.stderr)
        raise
    print('ERS_GATEC DISTINCT_ENROLLED_PUBLIC_KEYS PASS')
    print('ERS_GATEC TRUST_ENROLLMENT_COMPLETE PASS')

if __name__=='__main__':
    try:main()
    except (Failure,OSError,ValueError,subprocess.TimeoutExpired,IndexError) as e:
        print('ERS_GATEC '+str(e)+' FAIL',file=sys.stderr)
        raise SystemExit(1)
