#!/usr/bin/env python3
"""Unit contract for secret-reference materialization, without contacting 1Password."""
import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('opmat', root / 'scripts/ers-op-materialize.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

assert module.render('A={{op://ers-test/runtime-secrets/JWT_SECRET}}', lambda _: 'secret') == 'A=secret'
for template in ['A={{bad}}', 'A={{op://a/b/c}} {{left}}']:
    try:
        module.render(template, lambda _: 'secret')
    except ValueError:
        pass
    else:
        raise AssertionError('invalid template accepted')
for value in ['', 'a\nb', 'a\x00b']:
    try:
        module.render('{{op://ers-test/runtime-secrets/JWT_SECRET}}', lambda _: value)
    except ValueError:
        pass
    else:
        raise AssertionError('unsafe secret accepted')
# Failure diagnostics must identify a template field without exposing secrets or refs.
for invalid, expected in [('', 'empty'), ('line\nsecret', 'newline or NUL')]:
    try:
        module.render('JWT_SECRET={{op://ers-test/runtime-secrets/JWT_SECRET}}', lambda _: invalid)
    except ValueError as exc:
        assert 'JWT_SECRET' in str(exc) and expected in str(exc)
        assert 'op://' not in str(exc) and invalid not in str(exc) if invalid else 'op://' not in str(exc)
    else:
        raise AssertionError('unsafe value accepted')
for environment in ('development', 'test', 'production'):
    template = (root / 'ops/1password' / f'{environment}.env.tpl').read_text()
    assert 'JWT_SECRET={{op://ers-' + environment in template
    assert 'OPENAI_API_KEY=' not in template
    assert 'DEV_ADMIN_PASSWORD=' not in template
    for key in ('LEDGER_CORRECTION_KEY', 'LEDGER_SETTLEMENT_KEY'):
        assert f'{key}={{{{op://ers-{environment}/runtime-secrets/{key}}}}}' in template
    assert all(line.startswith('#') or not line.strip() or '{{op://' in line for line in template.splitlines())
print('1Password secret-reference materialization tests passed')
