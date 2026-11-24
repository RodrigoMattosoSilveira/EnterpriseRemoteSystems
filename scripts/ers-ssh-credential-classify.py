#!/usr/bin/env python3
"""Read-only, non-disclosing classification of an effective Actions SSH secret.

The key is read from the process environment; no source/output log contains its bytes.
Only fixed classification codes and per-run HMAC comparison tags leave this process.
"""
from __future__ import annotations

import base64
import binascii
import hmac
import hashlib
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile

ALLOWED_LABELS = {'test': 'TEST', 'training': 'TRAINING'}
MAX_BYTES = 1024 * 1024


def _ssh_string(payload: bytes, offset: int) -> tuple[bytes, int]:
    if len(payload) - offset < 4:
        raise ValueError('incomplete length')
    (length,) = struct.unpack_from('>I', payload, offset)
    offset += 4
    if length > len(payload) - offset:
        raise ValueError('truncated string')
    return payload[offset:offset + length], offset + length


def _container(raw: str) -> str:
    """Distinguish declared encryption from unrecognized/truncated private keys.

    This does not verify encrypted ciphertext or its passphrase.
    """
    if not raw:
        return 'MISSING'
    if raw.startswith('ops_'):
        return 'WRONG_TYPE_SERVICE_ACCOUNT_TOKEN'
    if re.match(r'^(ssh-|ecdsa-sha2-)', raw):
        return 'WRONG_TYPE_PUBLIC_KEY'
    if '\\n' in raw and '\n' not in raw:
        return 'ESCAPED_LINE_BREAKS'
    if len(raw.encode('utf-8')) > MAX_BYTES:
        return 'UNRECOGNIZED_OR_MALFORMED'
    normalized = raw.replace('\r\n', '\n').strip()
    lines = normalized.split('\n')
    if len(lines) < 3:
        return 'UNRECOGNIZED_OR_MALFORMED'
    start = re.fullmatch(r'-----BEGIN ([A-Z0-9 ]+)-----', lines[0])
    if not start or lines[-1] != f'-----END {start.group(1)}-----':
        return 'UNRECOGNIZED_OR_MALFORMED'
    kind = start.group(1)
    if kind not in {'OPENSSH PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY',
                    'DSA PRIVATE KEY', 'PRIVATE KEY', 'ENCRYPTED PRIVATE KEY'}:
        return 'UNRECOGNIZED_OR_MALFORMED'

    inner = lines[1:-1]
    if kind != 'OPENSSH PRIVATE KEY':
        encrypted = kind == 'ENCRYPTED PRIVATE KEY' or any(
            line.strip().upper() == 'PROC-TYPE: 4,ENCRYPTED' for line in inner)
        # Legacy PEM permits a small header section before the base64 body.
        payload_lines = [line.strip() for line in inner if line.strip() and ':' not in line]
        try:
            decoded = base64.b64decode(''.join(payload_lines), validate=True)
        except (binascii.Error, ValueError):
            return 'UNRECOGNIZED_OR_MALFORMED'
        if not decoded:
            return 'UNRECOGNIZED_OR_MALFORMED'
        return 'PEM_ENCRYPTED_DECLARED' if encrypted else 'PEM_UNENCRYPTED_DECLARED'

    try:
        payload = base64.b64decode(''.join(line.strip() for line in inner), validate=True)
        magic = b'openssh-key-v1\x00'
        if not payload.startswith(magic):
            raise ValueError('bad magic')
        offset = len(magic)
        cipher, offset = _ssh_string(payload, offset)
        kdf, offset = _ssh_string(payload, offset)
        _, offset = _ssh_string(payload, offset)  # KDF options
        if len(payload) - offset < 4:
            raise ValueError('missing public key count')
        (count,) = struct.unpack_from('>I', payload, offset)
        offset += 4
        if count != 1:
            raise ValueError('unsupported key count')
        public, offset = _ssh_string(payload, offset)
        private, offset = _ssh_string(payload, offset)
        if offset != len(payload) or not public or not private:
            raise ValueError('truncated or trailing bytes')
        if cipher == b'none' and kdf == b'none':
            return 'OPENSSH_UNENCRYPTED_DECLARED'
        if cipher != b'none' and kdf != b'none':
            return 'OPENSSH_ENCRYPTED_DECLARED'
        return 'UNRECOGNIZED_OR_MALFORMED'
    except (ValueError, IndexError, binascii.Error, struct.error):
        return 'UNRECOGNIZED_OR_MALFORMED'


def classify(raw: str, ssh_keygen: str | None = None) -> str:
    category = _container(raw)
    if category not in {'OPENSSH_UNENCRYPTED_DECLARED', 'PEM_UNENCRYPTED_DECLARED'}:
        return category
    executable = ssh_keygen if ssh_keygen is not None else shutil.which('ssh-keygen')
    if not executable:
        return 'KEYGEN_UNAVAILABLE'
    with tempfile.TemporaryDirectory(prefix='ers-ssh-classify-') as root:
        path = Path(root) / 'identity'
        path.write_bytes(raw.encode('utf-8'))
        path.chmod(0o600)
        try:
            check = subprocess.run([executable, '-y', '-P', '', '-f', str(path)],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   check=False, timeout=8)
        except (OSError, subprocess.TimeoutExpired):
            return 'KEYGEN_UNAVAILABLE'
    return ('OPENSSH_UNENCRYPTED_VALID' if category.startswith('OPENSSH') else
            'PEM_UNENCRYPTED_VALID') if check.returncode == 0 else 'UNENCRYPTED_UNREADABLE'


def inspect_from_environment() -> int:
    label_key = os.environ.get('ERS_SSH_DIAG_ENVIRONMENT', '')
    if label_key not in ALLOWED_LABELS:
        print('BLOCKED: Unsupported diagnostic environment.', file=sys.stderr)
        return 2
    label = ALLOWED_LABELS[label_key]
    nonce_hex = os.environ.get('ERS_SSH_DIAG_NONCE', '')
    if not re.fullmatch(r'[0-9a-f]{64}', nonce_hex):
        print('BLOCKED: Missing per-run comparison key.', file=sys.stderr)
        return 2
    output_path = os.environ.get('GITHUB_OUTPUT', '')
    if not output_path:
        print('BLOCKED: GitHub output path unavailable.', file=sys.stderr)
        return 2
    secret = os.environ.get('ERS_SSH_DIAG_SECRET', '')
    category = classify(secret)
    # Tags are per-run, never reused across runs. Never print tag or key.
    tag = hmac.new(bytes.fromhex(nonce_hex), secret.encode('utf-8'), hashlib.sha256).hexdigest()
    with open(output_path, 'a', encoding='utf-8') as output:
        output.write(f'category={category}\n')
        output.write(f'comparison_tag={tag}\n')
    if category.endswith('_VALID'):
        print(f'PASS: {label} effective SSH secret: {category}')
    else:
        print(f'BLOCKED: {label} effective SSH secret: {category}')
    print(f'PASS: {label} secret comparison tag recorded privately for this run (value suppressed).')
    return 0  # Classification is evidence, not a deployment authorization.


if __name__ == '__main__':
    raise SystemExit(inspect_from_environment())
