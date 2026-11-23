#!/usr/bin/env python3
"""Compare two ephemeral Actions classification outputs without printing tags."""
from __future__ import annotations

import hmac
import os
import re
import sys

VALID = {'OPENSSH_UNENCRYPTED_VALID', 'PEM_UNENCRYPTED_VALID'}
KNOWN = {
    'MISSING', 'WRONG_TYPE_SERVICE_ACCOUNT_TOKEN', 'WRONG_TYPE_PUBLIC_KEY',
    'ESCAPED_LINE_BREAKS', 'UNRECOGNIZED_OR_MALFORMED',
    'OPENSSH_ENCRYPTED_DECLARED', 'OPENSSH_UNENCRYPTED_DECLARED',
    'PEM_ENCRYPTED_DECLARED', 'PEM_UNENCRYPTED_DECLARED',
    'OPENSSH_UNENCRYPTED_VALID', 'PEM_UNENCRYPTED_VALID',
    'UNENCRYPTED_UNREADABLE', 'KEYGEN_UNAVAILABLE',
}


def compare(test_category: str, training_category: str, test_tag: str, training_tag: str) -> tuple[int, list[str]]:
    if (test_category not in KNOWN or training_category not in KNOWN or
        not re.fullmatch(r'[0-9a-f]{64}', test_tag) or
        not re.fullmatch(r'[0-9a-f]{64}', training_tag)):
        return 2, ['BLOCKED: Missing or invalid classification outputs. No credential values printed.']
    report = ['TEST_CLASSIFICATION=' + test_category,
              'TRAINING_CLASSIFICATION=' + training_category]
    same = hmac.compare_digest(test_tag, training_tag)
    report.append('MATCH=' + ('YES' if same else 'NO'))
    if not same:
        report.append('BLOCKED: Test and Training receive DIFFERENT effective SSH secret bytes.')
        return 2, report
    if test_category not in VALID or training_category not in VALID:
        report.append('BLOCKED: SAME secret bytes, but the credential is not proven usable without a passphrase.')
        return 2, report
    report.append('PASS: Matching, passphrase-free private key in Test and Training. No SSH connection attempted.')
    return 0, report


def main() -> int:
    code, lines = compare(os.environ.get('TEST_CATEGORY', ''), os.environ.get('TRAINING_CATEGORY', ''),
                          os.environ.get('TEST_TAG', ''), os.environ.get('TRAINING_TAG', ''))
    for line in lines:
        print(line)
    return code


if __name__ == '__main__':
    raise SystemExit(main())
