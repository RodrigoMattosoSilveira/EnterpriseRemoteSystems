#!/usr/bin/env python3
"""Positive and negative regression cases for the customer manual contract."""
from __future__ import annotations

import importlib.util
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "scripts/ers-byte354a-manual-check.py"
spec = importlib.util.spec_from_file_location("byte354a", MODULE)
assert spec and spec.loader
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
assert not check.validate(ROOT), check.validate(ROOT)

with tempfile.TemporaryDirectory(prefix="ers-354a-document-check-") as directory:
    root = Path(directory)
    inputs = [check.MANUAL, check.CARD, check.APP_PLAN, check.APP_PERIOD, check.APP_LOCALE,
              check.SERVER, Path("docs/bite-35/byte-35-4-manual-acceptance.md"),
              Path("docs/bite-35/byte-35-4-operational-readiness.md"),
              Path("docs/bite-35/byte-35-3-actual-work-location-override.md"),
              Path("docs/bite-35/byte-35-4a-cartao-substituicoes-pt-br.md")]
    for relative in inputs:
        dest = root / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, dest)

    manual = root / check.MANUAL
    original = manual.read_text(encoding="utf-8")
    cases = [
        ("missing chapter", original.replace("## Capítulo 05", "## Capítulo omitido", 1), "chapter coverage"),
        ("missing scenario", original.replace("### F04-S06", "### cenário omitido", 1), "substitution exercises"),
        ("missing functional lab", original.replace("## F07", "## F-ZZ", 1), "training labs"),
        ("superficial manual", "# Guia curto\n\nF04\n", "too brief"),
        ("reintroduced English term", original + "\nUma Tenant pode...\n", "Entidade/Entidades"),
        ("corrupted option label", original.replace("F — Folga", "D — Folga"), "F — Folga"),
        ("removed opposite side explanation", original.replace("**Bruno substitui Ana**", "**Ana substitui Bruno**"), "Bruno substitui Ana"),
        ("removed candidate warning", original.replace("Cand. sozinho não", "Cand. já", 1), "Cand. sozinho não"),
        ("removed exact flow rule", original.replace("Na linha de quem VAI TRABALHAR", "Na linha do afastado", 1), "Na linha de quem VAI TRABALHAR"),
        ("old en-US abbreviation reintroduced", original.replace("**Subst.**", "**Repl.**", 1), "Portuguese manual must use Subst."),
        ("invented command", original + "\n```bash\nrm -rf /\n```\n", "UI-only"),
        ("broken link", original.replace("byte-35-4-operational-readiness.md", "does-not-exist.md"), "broken or unsafe"),
    ]
    count = 0
    for label, tampered, expected in cases:
        manual.write_text(tampered, encoding="utf-8")
        issues = check.validate(root)
        assert any(expected in issue for issue in issues), (label, issues)
        manual.write_text(original, encoding="utf-8")
        assert not check.validate(root), (label, check.validate(root))
        count += 1

    # The Portuguese quick-reference card must agree with the rendered pt-BR label.
    card = root / check.CARD
    card_original = card.read_text(encoding="utf-8")
    card.write_text(card_original.replace("campo Subst.", "campo Repl.", 1), encoding="utf-8")
    assert any("Portuguese substitution card" in issue for issue in check.validate(root))
    card.write_text(card_original, encoding="utf-8")
    assert not check.validate(root)
    count += 1

    # The manual contract must fail closed if a column is reverted to a literal
    # or if the pt-BR catalog diverges from the instructions.
    plan = root / check.APP_PLAN
    plan_original = plan.read_text(encoding="utf-8")
    plan.write_text(plan_original.replace(
        'label={t("byte352.planning.replacementShort")}', 'label="Repl."', 1
    ), encoding="utf-8")
    assert any("source evidence changed" in issue for issue in check.validate(root))
    plan.write_text(plan_original, encoding="utf-8")
    assert not check.validate(root)
    count += 1

    locale = root / check.APP_LOCALE
    locale_original = locale.read_text(encoding="utf-8")
    locale.write_text(locale_original.replace(
        '"byte352.planning.replacementShort": "Subst."',
        '"byte352.planning.replacementShort": "Repl."', 1
    ), encoding="utf-8")
    assert any("source evidence changed" in issue for issue in check.validate(root))
    locale.write_text(locale_original, encoding="utf-8")
    assert not check.validate(root)
    count += 1

    # Source anchors must invalidate the training contract when the product changes.
    locale = root / check.APP_LOCALE
    baseline = locale.read_text(encoding="utf-8")
    locale.write_text(baseline.replace("'F — Folga'", "'D — Day Off'"), encoding="utf-8")
    assert any("source evidence changed" in issue for issue in check.validate(root))
    locale.write_text(baseline, encoding="utf-8")
    assert not check.validate(root)
    count += 1

print(f"PASS: Byte 35.4A manual check + {count} fail-closed negative regression cases")
print("NOT VERIFIED: manual exercise completion, identity fixtures or browser interaction")
