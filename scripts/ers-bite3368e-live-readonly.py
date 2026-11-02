#!/usr/bin/env python3
"""Live read-only S3 isolation probe, requiring independently prepared test objects.

Does not write, delete, or show credentials. A PASS verifies only the enumerated reads.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ENV = ('development', 'test', 'production')

def probe(config, runner=subprocess.run):
    if set(config) != {'endpoint', 'bucket', 'profiles', 'known_keys'} or set(config['profiles']) != set(ENV) or set(config['known_keys']) != set(ENV):
        raise ValueError('requires endpoint, bucket, three profile names and three previously written probe object keys')
    if config['endpoint'] != 'https://hel1.your-objectstorage.com' or config['bucket'] != 'ers':
        raise ValueError('unexpected S3 destination')
    for env in ENV:
        key = config['known_keys'][env]
        if not isinstance(key, str) or not key.startswith('ers-backups/'+env+'/') or any(c in key for c in '\r\n\x00'):
            raise ValueError(f'invalid probe object key for {env}')
        profile = config['profiles'][env]
        if not isinstance(profile, str) or not profile or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in profile):
            raise ValueError('invalid profile name')
    findings = []
    for actor in ENV:
        for target in ENV:
            args = ['aws', 's3api', 'head-object', '--bucket', config['bucket'], '--key', config['known_keys'][target], '--profile', config['profiles'][actor], '--endpoint-url', config['endpoint'], '--output', 'json']
            outcome = runner(args, capture_output=True, text=True, timeout=30)
            # Do not output stderr; it may contain locally configured account identifiers.
            if actor == target:
                status = 'PASS' if outcome.returncode == 0 else 'BLOCKED'
            else:
                # Only definitive AccessDenied/403 is evidence of a deny, not missing objects or transport failures.
                detail = outcome.stderr.lower()
                status = 'PASS' if outcome.returncode != 0 and ('accessdenied' in detail or '403' in detail or 'forbidden' in detail) else 'BLOCKED'
            findings.append({'credential': actor, 'object_environment': target, 'status': status})
    return {'status': 'PASS_READ_ONLY_PROBES_ONLY' if all(f['status'] == 'PASS' for f in findings) else 'BLOCKED', 'checks': findings, 'notice': 'Does not prove write/delete/version/retention isolation; additional approved live tests required.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.config.is_symlink() or args.config.stat().st_size > 8192:
            raise ValueError('invalid config')
        result = probe(json.loads(args.config.read_text()))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(f'BLOCKED: live probe could not complete ({type(exc).__name__})', file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 0 if result['status'].startswith('PASS') else 2

if __name__ == '__main__':
    raise SystemExit(main())
