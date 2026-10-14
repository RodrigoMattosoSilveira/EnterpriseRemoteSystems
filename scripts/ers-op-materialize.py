#!/usr/bin/env python3
"""Materialize checked-in 1Password reference templates without disclosing secrets.

Fail closed: only allow op:// references as substitutions and permit no output
on stdout; write an atomic 0600 file. Intended for authenticated operator/CI use.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile

REF = re.compile(r'\{\{(op://[A-Za-z0-9_. /-]+)\}\}')


def render(template: str, fetch):
    refs = REF.findall(template)
    if '{{' in REF.sub('', template) or '}}' in REF.sub('', template):
        raise ValueError('invalid or unresolved secret placeholder')
    values = {}
    for ref in set(refs):
        val = fetch(ref)
        if not val or '\x00' in val or '\n' in val or '\r' in val:
            raise ValueError('secret missing or contains unsafe newline/NUL')
        values[ref] = val
    return REF.sub(lambda m: values[m.group(1)], template)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-root', type=Path, required=True,
                        help='absolute approved root of generated files')
    args = parser.parse_args()
    root = args.expected_root.resolve(strict=True)
    output = args.output.absolute()
    if not output.is_relative_to(root) or output == root or output.is_symlink():
        parser.error('output is outside approved directory or is a symlink')
    if not output.parent.exists() or output.parent.resolve() != output.parent:
        parser.error('output parent must exist and be canonical')
    if output.exists() and not output.is_file():
        parser.error('output must be a regular file')
    if args.template.resolve() == output.resolve():
        parser.error('template and output cannot be identical')
    if args.template.stat().st_mode & 0o022:
        parser.error('template may not be group/other writable')

    def fetch(ref):
        # Never embed secret references in shell commands or logged arguments.
        p = subprocess.run(['op', 'read', ref], capture_output=True, check=False)
        if p.returncode:
            raise RuntimeError('1Password lookup failed (secret references redacted)')
        return p.stdout.decode('utf-8').removesuffix('\n')

    content = render(args.template.read_text(), fetch)
    fd, tempname = tempfile.mkstemp(prefix='.ers-op-', dir=output.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tempname, output)
    finally:
        if os.path.exists(tempname):
            os.unlink(tempname)
    print('1Password materialization completed (secret values suppressed)')


if __name__ == '__main__':
    main()
