#!/usr/bin/env python3
"""Verify a transferred Gate B OCI image archive; never modify the image lock.

Modes:
  operator: local approved lock + Git HEAD + image inspection + OCI contents
  recipient: package + independently authenticated archive SHA-256 + OCI contents
  stage:   operator mode, verify staged package and preserve/activate it explicitly
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import uuid

D = re.compile(r'^sha256:[0-9a-f]{64}$')
H = re.compile(r'^[0-9a-f]{64}$')
FILE_NAMES = ('ers-approved-image.tar', 'ers-approved-image-id.txt', 'ers-approved-image-sha256.txt')

class Failure(Exception):
    pass

def require(ok, code):
    if not ok: raise Failure(code)

def safe_regular(p):
    return p.is_file() and not p.is_symlink()

def digest_file(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for part in iter(lambda:f.read(1024*1024),b''): h.update(part)
    return h.hexdigest()

def member_json(tar, name):
    try: member=tar.getmember(name)
    except KeyError: raise Failure('OCI_MEMBER_MISSING') from None
    require(member.isfile() and member.size <= 8*1024*1024, 'OCI_MEMBER_UNSAFE')
    with tar.extractfile(member) as inp: return json.load(inp)

def read_blob(tar, desc, *, json_blob=True):
    require(isinstance(desc,dict), 'OCI_DESCRIPTOR_INVALID')
    d=desc.get('digest')
    require(isinstance(d,str) and D.fullmatch(d), 'OCI_DIGEST_INVALID')
    try: member=tar.getmember('blobs/sha256/'+d[7:])
    except KeyError: raise Failure('OCI_BLOB_MISSING') from None
    require(member.isfile(), 'OCI_BLOB_NOT_FILE')
    if 'size' in desc: require(desc['size']==member.size, 'OCI_BLOB_SIZE_MISMATCH')
    h=hashlib.sha256()
    with tar.extractfile(member) as inp:
        for part in iter(lambda:inp.read(1024*1024), b''):h.update(part)
    require(h.hexdigest()==d[7:],'OCI_BLOB_DIGEST_MISMATCH')
    return member_json(tar,member.name) if json_blob else None

def verify_archive(path, image_id, expected_platform=None, expected_source=None, expected_base=None):
    with tarfile.open(path, 'r:*') as tar:
        index=member_json(tar,'index.json')
        roots=index.get('manifests')
        require(isinstance(roots,list) and len(roots)==1, 'OCI_ROOTS_INVALID')
        desc=roots[0]
        require(desc.get('digest')==image_id,'OCI_APPROVED_INDEX_MISMATCH')
        platform_from_image = None
        for depth in range(6):
            obj=read_blob(tar,desc)
            if 'config' in obj:
                config=read_blob(tar,obj['config'])
                platform_from_image=f"{config.get('os')}/{config.get('architecture')}"
                require(platform_from_image in ('linux/amd64','linux/arm64'),'OCI_PLATFORM_INVALID')
                if expected_platform: require(platform_from_image==expected_platform,'OCI_PLATFORM_MISMATCH')
                labels=(config.get('config') or {}).get('Labels') or {}
                if expected_source: require(labels.get('org.opencontainers.image.revision')==expected_source,'OCI_SOURCE_LABEL_MISMATCH')
                if expected_base: require(labels.get('org.enterpriseremotesystems.recovery.base-image')==expected_base,'OCI_BASE_LABEL_MISMATCH')
                for layer in obj.get('layers',[]): read_blob(tar,layer,json_blob=False)
                break
            children=obj.get('manifests')
            require(isinstance(children,list) and len(children)>0,'OCI_MANIFEST_MISSING')
            if expected_platform:
                found=[x for x in children if (x.get('platform') or {}).get('os')+'/'+(x.get('platform') or {}).get('architecture')==expected_platform]
                require(len(found)==1 or (len(children)==1 and not found),'OCI_PLATFORM_AMBIGUOUS')
                desc=found[0] if found else children[0]
            else:
                require(len(children)==1,'OCI_MULTI_PLATFORM_REQUIRES_APPROVED_LOCK')
                desc=children[0]
        else: raise Failure('OCI_NESTING_INVALID')
    return platform_from_image

def load_package(path, expected_image_id=None, expected_sha=None, platform=None, source=None, base=None):
    require(path.is_dir() and not path.is_symlink(),'PACKAGE_DIRECTORY_INVALID')
    for n in FILE_NAMES: require(safe_regular(path/n),'PACKAGE_FILE_MISSING_OR_SYMLINK_'+n)
    image_id=(path/FILE_NAMES[1]).read_text().strip()
    require(D.fullmatch(image_id),'PACKAGE_IMAGE_ID_FORMAT')
    if expected_image_id: require(image_id==expected_image_id,'PACKAGE_IMAGE_ID_MISMATCH')
    claimed=(path/FILE_NAMES[2]).read_text().strip()
    require(H.fullmatch(claimed),'PACKAGE_SHA_FORMAT')
    sha=digest_file(path/FILE_NAMES[0])
    require(sha==claimed,'ARCHIVE_SHA_MISMATCH')
    if expected_sha: require(sha==expected_sha,'INDEPENDENT_SHA_MISMATCH')
    print('ERS_GATEC ARCHIVE_SHA256='+sha)
    print('ERS_GATEC ARCHIVE_CHECKSUM PASS')
    actual_platform=verify_archive(path/FILE_NAMES[0],image_id,platform,source,base)
    print('ERS_GATEC OCI_CONTENT_CHAIN PASS')
    print('ERS_GATEC OCI_PLATFORM='+actual_platform)
    return image_id

# Immutable image provenance may refer to a prior (approved) source revision.
# Gate C-only documentation/tool changes must not force rebuilding Gate B.
# But changing a Docker image input after approval must fail closed.
GATE_B_INPUTS = ('ops/recovery', 'scripts/ers-recovery-container-host.py',
                 'scripts/ers-emergency-admin-recovery.py',
                 'scripts/ers-emergency-admin-isolated-rehearsal.py',
                 'scripts/testdata/emergency-recovery-host-probe')

def verify_approved_source(repo, source):
    require(re.fullmatch(r'[0-9a-f]{40}', source) is not None, 'LOCK_SOURCE_SHA_INVALID')
    head=subprocess.run(['git','rev-parse','HEAD'],cwd=str(repo),capture_output=True,text=True)
    require(head.returncode == 0, 'GIT_HEAD_UNAVAILABLE')
    current=head.stdout.strip()
    if current != source:
        ancestor=subprocess.run(['git','merge-base','--is-ancestor',source,current],
                                cwd=str(repo),capture_output=True)
        require(ancestor.returncode == 0, 'APPROVED_IMAGE_SOURCE_NOT_ANCESTOR')
    changed=subprocess.run(['git','diff','--quiet',source,'--',*GATE_B_INPUTS],
                           cwd=str(repo),capture_output=True)
    require(changed.returncode==0,'GATE_B_IMAGE_INPUTS_CHANGED')
    print('ERS_GATEC APPROVED_SOURCE_AND_IMAGE_INPUTS PASS')
    return current

def inspect(image_id):
    p=subprocess.run(['docker','image','inspect',image_id],capture_output=True,text=True)
    require(p.returncode==0,'DOCKER_IMAGE_NOT_FOUND')
    data=json.loads(p.stdout)
    require(isinstance(data,list) and len(data)==1 and data[0].get('Id')==image_id, 'DOCKER_APPROVED_ID_MISMATCH')
    return data[0]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--role',choices=['operator','recipient'],required=True)
    parser.add_argument('--package',type=Path,help='Path to folder containing exactly the 3 transfer files')
    parser.add_argument('--independent-sha',help='Required on recipient device: SHA-256 communicated separately by operator')
    parser.add_argument('--create-package',action='store_true',help='Create approved archive from the locked local image; preserve previous transfer package')
    parser.add_argument('--activate-staged',action='store_true',help='Operator only: use verified staged archive, preserve prior package')
    args=parser.parse_args()
    home=Path.home()
    require(not (args.create_package and args.activate_staged),'CONFLICTING_PACKAGE_OPERATIONS')
    if args.role=='operator':
        lock_path=home/'.ers-recovery/gate-b-approved-image-lock.json'
        require(safe_regular(lock_path),'GATE_B_LOCK_MISSING')
        lock=json.loads(lock_path.read_text())
        image_id, platform, source, base=(lock[k] for k in ('image_id','platform','source_sha','base_image'))
        require(D.fullmatch(image_id),'LOCK_IMAGE_ID_INVALID')
        repo=home/'projects/EnterpriseRemoteSystems'
        verify_approved_source(repo,source)
        row=inspect(image_id)
        require(f"{row.get('Os')}/{row.get('Architecture')}"==platform,'LOCK_PLATFORM_MISMATCH')
        labels=(row.get('Config') or {}).get('Labels') or {}
        require(labels.get('org.opencontainers.image.revision')==source and labels.get('org.enterpriseremotesystems.recovery.base-image')==base,'DOCKER_PROVENANCE_MISMATCH')
        print('ERS_GATEC APPROVED_IMAGE_VERIFIED PASS')
        package=args.package or home/'.ers-recovery/owner-enrollment-package'
        if args.create_package:
            require(not args.package,'CREATE_PACKAGE_OVERRIDE_UNSUPPORTED')
            root=home/'.ers-recovery'
            require(root.is_dir() and not root.is_symlink(),'RECOVERY_ROOT_UNSAFE')
            stage=root/('.gatec-package-pending-'+uuid.uuid4().hex)
            stage.mkdir(mode=0o700)
            try:
                archive=stage/FILE_NAMES[0]
                with archive.open('xb') as stream:
                    result=subprocess.run(['docker','save','-o',str(archive),image_id],capture_output=True)
                require(result.returncode==0,'DOCKER_SAVE_FAILED')
                (stage/FILE_NAMES[1]).write_text(image_id+'\n')
                (stage/FILE_NAMES[2]).write_text(digest_file(archive)+'\n')
                load_package(stage,image_id,platform=platform,source=source,base=base)
                for n in FILE_NAMES:os.chmod(stage/n,0o600)
                require(not package.is_symlink(),'PACKAGE_SYMLINK')
                prior=None
                if package.exists():
                    require(package.is_dir(),'PACKAGE_NOT_DIRECTORY')
                    prior=package.with_name('owner-enrollment-package-preserved-'+uuid.uuid4().hex)
                    package.rename(prior)
                    print('ERS_GATEC OLD_PACKAGE_PRESERVED PASS')
                try: stage.rename(package)
                except Exception:
                    if prior and not package.exists():prior.rename(package)
                    raise
                print('ERS_GATEC APPROVED_PACKAGE_CREATED PASS')
            except Exception:
                print('ERS_GATEC STAGED_PACKAGE_PRESERVED='+str(stage),file=sys.stderr)
                raise
        if args.activate_staged:
            require(not args.package,'ACTIVATION_PACKAGE_OVERRIDE_UNSUPPORTED')
            stages=sorted((home/'.ers-recovery').glob('.gatec-new-package.*'),key=lambda p:p.stat().st_mtime,reverse=True)
            selected=None
            for p in stages:
                try:
                    load_package(p,image_id,platform=platform,source=source,base=base)
                    selected=p; break
                except (Failure, OSError, ValueError, tarfile.TarError):continue
            require(selected is not None,'NO_VALID_STAGED_PACKAGE')
            require(not package.is_symlink(),'PACKAGE_SYMLINK')
            prior=None
            if package.exists():
                require(package.is_dir(),'PACKAGE_NOT_DIRECTORY')
                prior=package.with_name('owner-enrollment-package-preserved-'+uuid.uuid4().hex)
                package.rename(prior)
                print('ERS_GATEC OLD_PACKAGE_PRESERVED PASS')
            try:selected.rename(package)
            except Exception:
                if prior and not package.exists(): prior.rename(package)
                raise
            os.chmod(package,0o700)
            for n in FILE_NAMES:os.chmod(package/n,0o600)
            print('ERS_GATEC PACKAGE_ACTIVATED PASS')
        load_package(package,image_id,platform=platform,source=source,base=base)
        print('ERS_GATEC OPERATOR_PACKAGE_VERIFIED PASS')
    else:
        require(not args.activate_staged and not args.create_package,'RECIPIENT_NO_ACTIVATION')
        package=args.package or home/'Downloads/ers-owner-enrollment'
        sha=args.independent_sha
        require(isinstance(sha,str) and H.fullmatch(sha),'INDEPENDENT_SHA_REQUIRED')
        image_id=load_package(package,expected_sha=sha)
        # Only load after authenticated SHA and digest-chain verification.
        subprocess.run(['docker','load','-i',str(package/FILE_NAMES[0])],check=True,stdout=subprocess.DEVNULL)
        row=inspect(image_id)
        require(row.get('Os')=='linux' and row.get('Architecture') in ('arm64','amd64'),'LOADED_PLATFORM_INVALID')
        print('ERS_GATEC RECIPIENT_IMAGE_VERIFIED PASS')
    print('ERS_GATEC PACKAGE_VERIFICATION_COMPLETE PASS')

if __name__=='__main__':
    try:main()
    except (Failure, OSError, KeyError, ValueError, subprocess.CalledProcessError, tarfile.TarError) as e:
        print('ERS_GATEC '+str(e)+' FAIL',file=sys.stderr)
        raise SystemExit(1)
