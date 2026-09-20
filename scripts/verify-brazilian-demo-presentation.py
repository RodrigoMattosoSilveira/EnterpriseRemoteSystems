#!/usr/bin/env python3
"""Verify Bite 31.5 presenter assets against the live demo fixture/UI contract."""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEEDER = ROOT / "scripts" / "seed-brazilian-demo.py"
DECK = ROOT / "docs" / "06-Usage" / "Brazilian Demo Deck.md"
RUNBOOK = ROOT / "docs" / "06-Usage" / "Brazilian Demo Presenter Runbook.md"
BITE_DOC = ROOT / "docs" / "bite-31-5-demo-presentation-and-presenter-scripts.md"
ROUTER = ROOT / "frontend" / "src" / "app" / "router.tsx"
PT_BR = ROOT / "frontend" / "src" / "i18n" / "resources" / "pt-BR.ts"

DEMO_DIAGRAMS = (
    ROOT / "docs" / "uml" / "demo" / "01-limite-do-tenant.puml",
    ROOT / "docs" / "uml" / "demo" / "02-pessoa-vinculo-jornada.puml",
    ROOT / "docs" / "uml" / "demo" / "03-cadeia-operacional.puml",
    ROOT / "docs" / "uml" / "demo" / "04-tres-historias-financeiras.puml",
)

CORE_ROUTES = (
    "people",
    "collaborators",
    "work-periods",
    "gold-production",
    "expenses",
    "receipts/outstanding",
)

NAV_KEYS = (
    "nav.people",
    "nav.collaborators",
    "nav.workPeriods",
    "nav.goldProduction",
    "nav.expenses",
    "nav.outstandingReceipts",
)

REQUIRED_RUNBOOK_HEADINGS = (
    "## Presenter preflight",
    "## Executive demo",
    "## Deep demo",
    "## Recovery",
    "## Closing",
)

REQUIRED_STORY_TOKENS = (
    "80 g",
    "5%",
    "R$ 230,00",
    "4 g",
    "R$ 0,00",
)


def fail(message: str) -> None:
    raise SystemExit(f"Bite 31.5 presentation verification failed: {message}")


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(f"missing required file: {path.relative_to(ROOT)}")


def load_seeder_module():
    spec = importlib.util.spec_from_file_location("ers_brazilian_demo_seed", SEEDER)
    if spec is None or spec.loader is None:
        fail("unable to load Brazilian demo seeder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def quoted_ts_value(source: str, key: str) -> str:
    pattern = re.compile(
        rf"^[ \t]*[\"']{re.escape(key)}[\"'][ \t]*:[ \t]*[\"']([^\"']+)[\"']",
        re.MULTILINE,
    )
    match = pattern.search(source)
    if not match:
        fail(f"unable to resolve pt-BR translation for {key}")
    return match.group(1)


def advertised_logins(text: str) -> set[str]:
    return set(re.findall(r"\b[a-z0-9._+-]+@example\.test\b", text, flags=re.IGNORECASE))


def provisioned_login_constants(seed: object) -> set[str]:
    return {
        value
        for name, value in vars(seed).items()
        if name.endswith("_LOGIN")
        and isinstance(value, str)
        and re.fullmatch(r"[a-z0-9._+-]+@example\.test", value, flags=re.IGNORECASE)
    }


def require_contains(text: str, needle: str, context: str) -> None:
    if needle not in text:
        fail(f"{context} is missing required text: {needle!r}")


def main() -> int:
    read(SEEDER)
    deck = read(DECK)
    runbook = read(RUNBOOK)
    bite_doc = read(BITE_DOC)
    router = read(ROUTER)
    pt_br = read(PT_BR)
    seed = load_seeder_module()
    diagrams = {path: read(path) for path in DEMO_DIAGRAMS}

    for path, source in diagrams.items():
        require_contains(source, "@startuml", f"demo diagram {path.name}")
        require_contains(source, "@enduml", f"demo diagram {path.name}")

    require_contains(diagrams[DEMO_DIAGRAMS[0]], str(seed.TENANT_NAME), "Tenant-boundary diagram")
    require_contains(diagrams[DEMO_DIAGRAMS[1]], "Beatriz Nascimento", "Person/Journey diagram")
    require_contains(diagrams[DEMO_DIAGRAMS[1]], "Rafael Lima", "Person/Journey diagram")
    require_contains(diagrams[DEMO_DIAGRAMS[2]], "Período de Trabalho", "operating-chain diagram")
    require_contains(diagrams[DEMO_DIAGRAMS[2]], "Conta Corrente", "operating-chain diagram")
    for token in ("R$ 230,00", "4 g", "R$ 0,00"):
        require_contains(diagrams[DEMO_DIAGRAMS[3]], token, "financial-stories diagram")

    canonical_values = (
        str(seed.TENANT_ID),
        str(seed.TENANT_CODE),
        str(seed.TENANT_NAME),
        str(seed.TENANT_ADMIN_LOGIN),
        str(seed.TENANT_ADMIN_PASSWORD),
        seed.DEFAULT_AS_OF.isoformat(),
    )
    combined_presenter_text = "\n".join((deck, runbook, bite_doc))
    for value in canonical_values:
        require_contains(combined_presenter_text, value, "presenter assets")

    advertised = advertised_logins(combined_presenter_text)
    provisioned = provisioned_login_constants(seed)
    unsupported = sorted(advertised - provisioned)
    if unsupported:
        fail(
            "presenter assets advertise login(s) not provisioned by the seeder: "
            + ", ".join(unsupported)
        )

    for route in CORE_ROUTES:
        require_contains(router, f'path: "{route}"', "frontend router")

    for key in NAV_KEYS:
        label = quoted_ts_value(pt_br, key)
        require_contains(runbook, label, f"presenter runbook ({key})")

    for heading in REQUIRED_RUNBOOK_HEADINGS:
        require_contains(runbook, heading, "presenter runbook")

    for token in REQUIRED_STORY_TOKENS:
        require_contains(combined_presenter_text, token, "presenter story")

    if "O limite do Tenant vem primeiro" not in deck or "Encerramento executivo" not in deck:
        fail("deck no longer contains the required boundary-first executive sequence")

    if "make brazilian-demo-local-reset" not in runbook:
        fail("runbook is missing deterministic reset recovery")
    if "make brazilian-demo-local-verify" not in runbook:
        fail("runbook is missing fixture verification recovery")

    print("Bite 31.5 presenter assets verified")
    print(f"Tenant: {seed.TENANT_NAME} ({seed.TENANT_CODE})")
    print(f"Presenter login: {seed.TENANT_ADMIN_LOGIN}")
    print(f"Scenario anchor: {seed.DEFAULT_AS_OF.isoformat()}")
    print("Presentation logins are a subset of accounts actually seeded by Bite 31.4.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
