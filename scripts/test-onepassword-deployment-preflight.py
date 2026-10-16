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
