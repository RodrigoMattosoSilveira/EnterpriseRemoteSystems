#!/usr/bin/env python3
"""Fail-closed, source-grounded documentation review for Byte 35.4A.

Only verifies structure, teaching coverage, terminology and source anchors.
Does not certify that a customer completed a training exercise, nor provision data.
Uses no network, database, credentials, or runtime application process.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUAL = Path("docs/bite-35/byte-35-4-manual-da-entidade-pt-br.md")
CARD = Path("docs/bite-35/byte-35-4a-cartao-substituicoes-pt-br.md")
APP_PLAN = Path("frontend/src/features/planning/PlanTab.tsx")
APP_PERIOD = Path("frontend/src/features/planning/WorkPeriodDetailPage.tsx")
APP_LOCALE = Path("frontend/src/i18n/resources/pt-BR.ts")
SERVER = Path("backend/internal/workperiodassignments/service_impl.go")


def read(root: Path, rel: Path, problems: list[str]) -> str:
    try:
        return (root / rel).read_text(encoding="utf-8")
    except OSError as exc:
        problems.append(f"missing source {rel}: {exc}")
        return ""


def validate(root: Path = ROOT) -> list[str]:
    problems: list[str] = []
    manual = read(root, MANUAL, problems)
    card = read(root, CARD, problems)
    plan = read(root, APP_PLAN, problems)
    detail = read(root, APP_PERIOD, problems)
    locale = read(root, APP_LOCALE, problems)
    server = read(root, SERVER, problems)
    if not all((manual, card, plan, detail, locale, server)):
        return problems

    # Deliberately substantive: an abbreviated index cannot masquerade as a manual.
    words = re.findall(r"\b[\wÀ-ÿ]+\b", manual)
    if len(words) < 7500:
        problems.append("comprehensive customer manual is too brief: minimum 7,500 words")
    chapter_ids = re.findall(r"^## Capítulo (\d{2})\b", manual, flags=re.MULTILINE)
    if chapter_ids != [f"{i:02d}" for i in range(1, 19)]:
        problems.append("training chapter coverage must be Capítulo 01–18 in order")
    functional_ids = re.findall(r"^## (F\d{2})\b", manual, flags=re.MULTILINE)
    if functional_ids != [f"F{i:02d}" for i in range(1, 13)]:
        problems.append("UI training labs must cover F01–F12 exactly once")
    scenario_ids = re.findall(r"^### (F04-S\d{2})\b", manual, flags=re.MULTILINE)
    if scenario_ids != [f"F04-S{i:02d}" for i in range(1, 9)]:
        problems.append("substitution exercises must cover F04-S01–F04-S08 in order")

    # The content remains fully Portuguese for customers. Paths may retain the
    # legacy filename and identifiers; strip Markdown destinations before checking.
    prose = re.sub(r"\]\([^)]*\)", "]", manual)
    if re.search(r"\btenants?\b", prose, flags=re.IGNORECASE):
        problems.append("Portuguese customer prose must say Entidade/Entidades, not Tenant/Tenants")
    if "```" in manual or re.search(r"(?im)^\s*(?:\$\s*)?(?:git|npm|curl|docker|sqlite3)\s+", manual):
        problems.append("customer training must be UI-only; no executable shell or code blocks")

    essential = [
        "Na linha de quem VAI TRABALHAR", "**Bruno substitui Ana**",
        "**Subst. da linha de Bruno aponta para Ana**", "Cand. sozinho não",
        "Salvar plano", "Sem substituição temporária", "Limpar filtros",
        "F — Folga", "L — Licença", "A — Ativo", "D — Day Off",
        "duas linhas", "mesmo Período de Trabalho", "não cria relação persistida",
        "reabra", "BLOQUEADO", "recibo", "35.7", "34.4",
        "informada", "realizado", "Ouro Produzido", "Conta Corrente",
        "Administrador da Entidade", "Operador de Ganhos", "Operador de Despesas",
        "produção", "F04-S03", "F04-S07", "padrões futuros",
        "FALHOU", "PASSOU", "não", "seletor Subst. é uma lista",
    ]
    for phrase in essential:
        if phrase.casefold() not in manual.casefold():
            problems.append(f"missing operational teaching point: {phrase}")

    # Critical safety / directionality claims are checked for distinct presence.
    for phrase in [
        "**Bruno (trabalha)**", "**Ana (afastada)**", "**sim** | **sim** | **Ana** | **A**",
        "**Na linha de Bruno**", "**Na linha de quem VAI TRABALHAR",
        "não conclua que o exercício passou", "não tente liquidar",
        "dois substitutos", "acesso a outra Entidade",
    ]:
        if phrase not in manual:
            problems.append(f"missing explicit safety/relationship explanation: {phrase}")

    # The printed customer materials must describe the labels rendered in pt-BR,
    # not the older en-US abbreviation. The one en-US mention in the manual is
    # explicitly identified as a language comparison, not an instruction.
    if manual.count("Repl.") != 1 or "**`Repl.`** (replacement)" not in manual:
        problems.append("Portuguese manual must use Subst. except for its explicit en-US comparison")
    if "Repl." in card:
        problems.append("Portuguese substitution card must use pt-BR Subst., not en-US Repl.")
    for phrase in [
        "**Se Bruno substitui Ana, é Bruno quem tem Ana escolhida no seu campo Subst.**",
        "**Subst.** | Nome do afastado substituído",
        "**Ana ← Subst. da linha de Bruno**",
    ]:
        if phrase not in card:
            problems.append(f"missing substitution-card teaching point: {phrase}")

    # Link validation does not fetch anything. Check all relative Markdown links.
    for destination in re.findall(r"\]\(([^)]+)\)", manual):
        path = destination.split("#", 1)[0]
        if not path or path.startswith(("https://", "http://", "mailto:")):
            continue
        dest = (root / MANUAL.parent / path).resolve()
        if not dest.is_relative_to(root.resolve()) or not dest.is_file():
            problems.append(f"broken or unsafe training link: {destination}")

    # Smoke-check that core terminology corresponds to the *committed* UI and
    # backend, not an obsolete manual test. This is not a complete UI audit.
    ui_anchors = [
        ('label={t("byte352.planning.candidateShort")}', plan),
        ('label={t("byte352.planning.replacementShort")}', plan),
        ('"byte352.planning.candidateShort": "Cand."', locale),
        ('"byte352.planning.replacementShort": "Subst."', locale),
        ("replacementCandidate", plan), ("temporaryReplacementForCollaboratorId", plan),
        ("planning.savePlan", plan), ("planning.availability.dayOff", plan),
        ("planning.informPrint", detail), ("planning.tabOutcomes", detail),
        ("'planning.availability.dayOff': 'F — Folga'", locale),
        ("'planning.availability.leave': 'L — Licença'", locale),
        ("'planning.availability.active': 'A — Ativo'", locale),
        ("Replacement target collaborator already has a replacement", server),
        ("Replacement collaborator must be selected", server),
    ]
    for anchor, source in ui_anchors:
        if anchor not in source:
            problems.append(f"source evidence changed; re-review manual: {anchor}")

    return problems


def main() -> int:
    issues = validate()
    if issues:
        for issue in issues:
            print(f"FAIL: {issue}", file=sys.stderr)
        return 1
    print("PASS: Byte 35.4A chapters, Portuguese terminology, substitution training, references and source anchors")
    print("NOT VERIFIED: human training, populated fixtures, browser behavior, Production authorization")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
