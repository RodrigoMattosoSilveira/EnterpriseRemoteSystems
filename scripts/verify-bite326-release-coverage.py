#!/usr/bin/env python3
"""Verify Bite 32.6.6 integrated release-hardening coverage."""
from __future__ import annotations
import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"docs/bite-32-6-6-release-coverage-manifest.json"
EXPECTED_IDS=list(range(1,11))
FINAL_MIGRATION="000077_journey_bonus_award_approval.up.sql"
REQUIRED_I18N_KEYS=(
 "authz.tenantRoleDelegation.tenantViewer", "people.photo.title", "people.photo.add",
 "journeyExtension.title", "journeyExtension.accept", "journeyExtension.reject",
 "bonus.title", "bonus.valueUnit", "bonus.goldGram", "bonus.awaitingSecondAdmin", "bonus.approve",
)
def fail(message:str)->None:
 print(f"Bite 32.6.6 release coverage check failed: {message}", file=sys.stderr); raise SystemExit(1)
def make_target_exists(text:str,target:str)->bool:
 return re.search(rf"(?m)^\.PHONY:\s+[^\n]*\b{re.escape(target)}\b",text) is not None and re.search(rf"(?m)^{re.escape(target)}\s*:",text) is not None
def resource_keys(path:Path)->set[str]:
 text=path.read_text(errors="replace")
 return set(re.findall(r"^[ \t]*[\"']([^\"']+)[\"']\s*:", text, flags=re.M))
def main()->int:
 try: doc=json.loads(MANIFEST.read_text())
 except (OSError,json.JSONDecodeError) as exc: fail(f"cannot read manifest: {exc}")
 reqs=doc.get("requirements")
 if not isinstance(reqs,list) or [x.get("id") for x in reqs if isinstance(x,dict)]!=EXPECTED_IDS: fail(f"requirement IDs must be exactly {EXPECTED_IDS}")
 for item in reqs:
  if item.get("status")!="covered": fail(f"requirement {item.get('id')} must be covered")
  evidence=item.get("evidence")
  if not isinstance(evidence,list) or not evidence: fail(f"requirement {item.get('id')} has no evidence")
  for proof in evidence:
   path=ROOT/proof.get("file","")
   if not path.is_file(): fail(f"missing evidence file {proof.get('file')}")
   text=path.read_text(errors="replace")
   marker=proof.get("testTitle") or proof.get("contains")
   if marker and marker not in text: fail(f"marker {marker!r} missing from {proof.get('file')}")
   target=proof.get("makeTarget")
   if target and not make_target_exists(text,target): fail(f"Make target {target!r} is not defined in {proof.get('file')}")
 en=resource_keys(ROOT/"frontend/src/i18n/resources/en-US.ts"); pt=resource_keys(ROOT/"frontend/src/i18n/resources/pt-BR.ts")
 if en!=pt: fail(f"en-US/pt-BR key parity failed: only_en={sorted(en-pt)[:10]} only_pt={sorted(pt-en)[:10]}")
 for key in REQUIRED_I18N_KEYS:
  if key not in en: fail(f"required i18n key is missing: {key}")
 pt_text=(ROOT/"frontend/src/i18n/resources/pt-BR.ts").read_text(errors="replace")
 if "Locatário" in pt_text or "Locatario" in pt_text: fail("legacy Brazilian Portuguese Tenant term Locatário/Locatario must not return")
 verifier=(ROOT/"backend/verify-migrated-db.sh").read_text(errors="replace")
 for marker in (FINAL_MIGRATION,"Bite 32.6 release-hardening schema verified"):
  if marker not in verifier: fail(f"migrated-database verifier is missing {marker}")
 print(f"Bite 32.6.6 release coverage verified: {len(reqs)}/{len(reqs)} requirements covered; final migration {FINAL_MIGRATION}.")
 return 0
if __name__=="__main__": raise SystemExit(main())
