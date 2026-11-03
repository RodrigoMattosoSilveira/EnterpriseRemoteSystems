#!/usr/bin/env python3
"""Bite 35.1 offline contract negative and positive tests."""
import copy
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('byte351', root / 'scripts/ers-byte351-baseline-check.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original = json.loads(module.MANIFEST.read_text(encoding='utf-8'))
assert not module.validate(original), module.validate(original)
checks = [
    ('baseline SHA', lambda d: d['baseline'].__setitem__('source_sha', '0' * 40)),
    ('source branch', lambda d: d['baseline'].__setitem__('source_branch', 'test')),
    ('incorrect comparison', lambda d: d['baseline']['verified_tree_comparison'].__setitem__('observed_exit_code', 1)),
    ('scope dropped', lambda d: d['launch_scope'].pop()),
    ('scope reordered', lambda d: d['launch_scope'].reverse()),
    ('wrong prior bite', lambda d: d['launch_scope'][1].__setitem__('absorbs', '34.5')),
    ('unknown status', lambda d: d['launch_scope'][0].__setitem__('status', 'deployed')),
    ('missing gate', lambda d: d['launch_gates'].pop()),
    ('reordered gate', lambda d: d['launch_gates'].reverse()),
    ('missing deferred', lambda d: d['deferred'].pop()),
    ('fake S3 acceptance', lambda d: d['operational_assertions'].__setitem__('advanced_s3_isolation', 'accepted')),
    ('fake backup acceptance', lambda d: d['operational_assertions'].__setitem__('real_production_backup_restore', 'passed')),
    ('fake launch authorization', lambda d: d['operational_assertions'].__setitem__('production_launch_authorized', True)),
    ('missing contract', lambda d: d['non_negotiable_contracts'].pop()),
]
for label, corrupt in checks:
    mutated = copy.deepcopy(original)
    corrupt(mutated)
    assert module.validate(mutated), f'must reject {label}'
    print(f'PASS: rejects {label}')
print(f'PASS: Bite 35.1 baseline manifest + {len(checks)} negative cases')
