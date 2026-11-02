#!/usr/bin/env python3
"""Offline generator/validator. Never contacts or changes S3."""
import argparse
import json
import re
import sys
from pathlib import Path

ENVS = ('development', 'test', 'production')
PRINCIPAL = re.compile(r'^arn:aws:iam:::user/p[0-9]+:[A-Za-z0-9]+$')


def policy_for(config):
    if set(config) != {'bucket', 'prefix_root', 'environment_principals', 'recovery_principal'}:
        raise ValueError('unexpected configuration fields')
    bucket = config['bucket']
    root = config['prefix_root']
    if not isinstance(bucket, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', bucket):
        raise ValueError('invalid bucket')
    if not isinstance(root, str) or not re.fullmatch(r'[a-z0-9][a-z0-9/-]*', root) or '//' in root or '..' in root:
        raise ValueError('invalid prefix root')
    envs = config['environment_principals']
    if not isinstance(envs, dict) or set(envs) != set(ENVS):
        raise ValueError('all three environments required')
    principals = [envs[e] for e in ENVS] + [config['recovery_principal']]
    if any(not isinstance(p, str) or not PRINCIPAL.fullmatch(p) for p in principals) or len(set(principals)) != 4:
        raise ValueError('four distinct Hetzner principal ARNs required; never provide secret keys')
    bucketarn = f'arn:aws:s3:::{bucket}'
    statements = [
        {'Sid': 'DenyUnlistedCredentials', 'Effect': 'Deny', 'NotPrincipal': {'AWS': principals}, 'Action': 's3:*', 'Resource': [bucketarn, bucketarn+'/*']}
    ]
    for env in ENVS:
        who = envs[env]
        own = f'{bucketarn}/{root}/{env}/*'
        statements.extend([
            {'Sid': f'Deny{env.title()}OutsidePrefix', 'Effect': 'Deny', 'Principal': {'AWS': who}, 'Action': ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject', 's3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutObjectRetention', 's3:GetObjectRetention', 's3:PutObjectLegalHold', 's3:GetObjectLegalHold', 's3:AbortMultipartUpload'], 'NotResource': own},
            {'Sid': f'Deny{env.title()}OtherList', 'Effect': 'Deny', 'Principal': {'AWS': who}, 'Action': ['s3:ListBucket', 's3:ListBucketVersions', 's3:ListBucketMultipartUploads'], 'Resource': bucketarn, 'Condition': {'StringNotLike': {'s3:prefix': [f'{root}/{env}/*', f'{root}/{env}/']}}},
            {'Sid': f'Deny{env.title()}BucketAdministration', 'Effect': 'Deny', 'Principal': {'AWS': who}, 'Action': ['s3:PutBucketPolicy', 's3:DeleteBucketPolicy', 's3:PutBucketVersioning', 's3:PutBucketObjectLockConfiguration', 's3:PutLifecycleConfiguration', 's3:DeleteBucket', 's3:PutBucketAcl'], 'Resource': bucketarn},
        ])
    return {'Version': '2012-10-17', 'Statement': statements}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    try:
        if args.config.is_symlink() or args.config.stat().st_size > 16384:
            raise ValueError('unsafe input file')
        config = json.loads(args.config.read_text())
        result = policy_for(config)
        if args.output.exists() or args.output.is_symlink():
            raise ValueError('output already exists (do not overwrite reviewed policy)')
        args.output.write_text(json.dumps(result, indent=2) + '\n')
        print('POLICY CANDIDATE GENERATED (NOT APPLIED; LIVE DENIAL VERIFICATION REQUIRED)')
    except (ValueError, OSError, TypeError, KeyError, json.JSONDecodeError) as exc:
        print(f'BLOCKED: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
