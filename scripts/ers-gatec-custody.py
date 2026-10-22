#!/usr/bin/env python3
"""Record REAL human custody attestations after independent witness verification.

Does not itself prove that human verification occurred. Writes a mode-0600 JSON
record matching the ERS isolated rehearsal validator. Refuses stale timestamps.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys

HOME=Path.home()
TRUST=HOME/'.ers-recovery/trust-public-keys'
RECORD=HOME/'.ers-recovery/gate-c-incident/owner-custody.json'
HEX=re.compile('^[0-9a-f]{64}$')
class Failure(Exception):pass

def required(v,code):
    if not v:raise Failure(code)
    return v

def main():
    os.umask(0o077)
    fpfile=TRUST/'gate-c-fingerprints.json'
    required(fpfile.is_file() and not fpfile.is_symlink(),'FINGERPRINT_EVIDENCE_MISSING')
    fps=json.loads(fpfile.read_text())
    required(set(fps)=={'owner-a','owner-b'} and fps['owner-a']!=fps['owner-b'] and all(HEX.fullmatch(x) for x in fps.values()),'FINGERPRINT_EVIDENCE_INVALID')
    print('ERS_GATEC WITNESSED_CUSTODY_RECORD_START')
    print('Only continue after the independent witness REALLY checked both human custodians.')
    print('Current UTC: '+dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
    proof=input('Type VERIFIED after completing human custody checks for BOTH owners: ').strip()
    required(proof=='VERIFIED','HUMAN_ATTESTATION_NOT_CONFIRMED')
    rows={}
    for slot in ('owner-a','owner-b'):
        print('Recording attestation for '+slot)
        owner=required(input('Actual authorized owner person_id: ').strip(),'OWNER_ID_EMPTY')
        witness=required(input('Actual independent witness_id: ').strip(),'WITNESS_ID_EMPTY')
        method=required(input('Actual verified custody method (no secrets): ').strip(),'METHOD_EMPTY')
        timestamp=required(input('Actual attestation time UTC (YYYY-MM-DDTHH:MM:SSZ): ').strip(),'ATTESTATION_TIME_EMPTY')
        required(re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ',timestamp),'TIME_FORMAT_INVALID')
        when=dt.datetime.strptime(timestamp,'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
        age=(dt.datetime.now(dt.timezone.utc)-when).total_seconds()
        required(0<=age<=86400,'ATTESTATION_STALE_OR_FUTURE')
        rows[slot]={
            'person_id':owner,'witness_id':witness,'custody_method':method,
            'attested_at':timestamp,'public_key_sha256':fps[slot],
            'owner_controls_private_key':True,'private_key_excluded_from_production_host':True
        }
    owners={r['person_id'].casefold() for r in rows.values()}
    required(len(owners)==2,'SAME_OWNER_FOR_BOTH_SLOTS')
    required(all(r['witness_id'].casefold() not in owners for r in rows.values()),'WITNESS_OVERLAPS_OWNER')
    root=RECORD.parent
    required(not root.is_symlink() and not RECORD.is_symlink() and not RECORD.exists(),'RECORD_ALREADY_EXISTS_OR_UNSAFE')
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(root,0o700)
    fd=os.open(RECORD,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'w') as f:
        json.dump({'slots':rows},f,indent=2,sort_keys=True)
        f.write('\n')
    print('ERS_GATEC CUSTODY_RECORD='+str(RECORD))
    print('ERS_GATEC CUSTODY_JSON_WRITTEN PASS')
    print('ERS_GATEC HUMAN_EVIDENCE_RETAINED_SEPARATELY REQUIRED')

if __name__=='__main__':
    try:main()
    except (Failure,ValueError,KeyError,OSError,EOFError,KeyboardInterrupt) as e:
        print('ERS_GATEC '+str(e)+' FAIL',file=sys.stderr)
        raise SystemExit(1)
