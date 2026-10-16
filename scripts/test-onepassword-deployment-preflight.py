#!/usr/bin/env python3
"""Offline regression for GitHub deployment 1Password staging and rollout guards."""
from pathlib import Path
import importlib.util
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fragment', ROOT/'scripts/ers-op-validate-fragments.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
for env, keys in module.EXPECTED.items():
    fragment = ''.join(f'{key}=example-secret\n' for key in sorted(keys))
    module.validate(fragment, env)
    for bad in (fragment.replace('=example-secret', '=', 1), fragment+'JWT_SECRET=extra\n', fragment+'SURPRISE=extra\n', fragment.replace('example-secret', '{{op://bad}}', 1)):
        try:
            module.validate(bad, env)
        except ValueError:
            pass
        else:
            raise AssertionError('unsafe 1Password fragment was accepted')
# The staged preflight requires only the three active credentials. The
# intentionally empty OpenAI/DEV admin fields must not be materialized.
for env, keys in module.EXPECTED.items():
    assert keys == {'JWT_SECRET', 'LEDGER_CORRECTION_KEY', 'LEDGER_SETTLEMENT_KEY'}
    template = (ROOT / 'ops/1password' / f'{env}.env.tpl').read_text()
    assignments = {line.split('=', 1)[0] for line in template.splitlines()
                   if line.strip() and not line.lstrip().startswith('#')}
    assert assignments == keys, (env, assignments)
    for extra in ('OPENAI_API_KEY=', 'DEV_ADMIN_PASSWORD='):
        assert extra not in template, (env, extra)
    base = ''.join(f'{key}=independent-secret\n' for key in sorted(keys))
    for bad in (base.replace('JWT_SECRET=independent-secret', 'JWT_SECRET='),
                base.replace('LEDGER_CORRECTION_KEY=independent-secret', 'LEDGER_CORRECTION_KEY='),
                base.replace('LEDGER_SETTLEMENT_KEY=independent-secret', 'LEDGER_SETTLEMENT_KEY='),
                base + 'OPENAI_API_KEY=unapproved\n',
                base + 'DEV_ADMIN_PASSWORD=unapproved\n',
                base.replace('independent-secret', ' leading-space', 1),
                base.replace('independent-secret', 'trailing-space ', 1)):
        try:
            module.validate(bad, env)
        except ValueError:
            pass
        else:
            raise AssertionError(f'{env} accepted invalid fragment')
module.validate('[ers-backup]\naws_access_key_id = placeholder\naws_secret_access_key = placeholder\n', 'production', aws=True)
workflow = (ROOT/'.github/workflows/deploy.yml').read_text()
assert '  onepassword-preflight:' in workflow
assert '      - onepassword-preflight' in workflow
assert 'environment: ${{ github.event_name' in workflow
assert '1password/install-cli-action@v4' in workflow
assert 'scripts/ers-op-materialize.py' in workflow
assert 'scripts/ers-op-validate-fragments.py' in workflow
assert 'ers-recovery ers-automation-bootstrap' in workflow
assert 'test -f \'${{ steps.target.outputs.env_dir }}/.env.${{ steps.target.outputs.env_name }}\'' in workflow
assert 'require-server-contract' in workflow
assert 'if: ${{ steps.target.outputs.env_name != \'production\' }}' in workflow
assert 'server-require-test-release-rehearsal' in workflow
assert 'server-owner-unavailable-recovery-preflight' in workflow
assert 'server-migration-recovery-gate' in workflow
assert 'server-migration-recovery-rollback' in workflow
assert 'run_playwright_post_deploy=false' in workflow
assert 'no runtime secrets were deployed.' in workflow
print('Bite 33.6.4 staged deployment preflight and Production safeguards PASS')
