"""Offline behavioral fixtures; no release downloads, builds or real pin edits."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
import upgrade_check as upgrade

A, B, C = "a" * 40, "b" * 40, "c" * 40


class UpgradeChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        self.original = f"# Pinned build\nSCUMMVM_TAG=v2.9.1\nSCUMMVM_COMMIT={A}\nEMSDK_VERSION=4.0.10\n"
        (self.root / upgrade.PIN).write_text(self.original)
        self.pin = upgrade.read_pin(self.root)[1]

    def upstream(self, latest="v2.10.0", current=A):
        records = {
            "releases/latest": {"tag_name": latest, "draft": False, "prerelease": False},
            "git/ref/tags/v2.9.1": {"object": {"sha": current, "type": "commit"}},
        }
        if latest != "v2.9.1":
            records["git/ref/tags/" + latest] = {"object": {"sha": C, "type": "tag"}}
            records["git/tags/" + C] = {"object": {"sha": B, "type": "commit"}}
        return records

    def check(self, records):
        return upgrade.release_check(self.pin, records.__getitem__, lambda url: 'EMSDK_VERSION="${EMSDK_VERSION:-4.0.10}"\n')

    def memory(self):
        entries = []
        for path in ("patches/scummvm/01-fixture.patch", "scripts/patch_scummvm_fixture.py"):
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("synthetic fixture\n")
            entries.append(dict(path=path, status="active", sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                                purpose="Preserve fixture behavior", invariants=["No regression"],
                                verification=["Fixture replay"], retire_when="Equivalent upstream support"))
        path = self.root / upgrade.SKILL / "references/patches.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({"schema_version": 1, "adaptations": entries}))
        return path, entries

    def test_numeric_comparison_and_annotated_commit_pin(self):
        result = self.check(self.upstream())
        self.assertEqual(result["status"], "upgrade-available")
        self.assertEqual(result["latest"]["commit"], B)
        self.assertIn(B, result["latest"]["emscripten_source_url"])
        self.assertEqual(result["latest"]["upstream_sdk_default"], "4.0.10")
        self.assertGreater(upgrade.version("v2026.4.0"), upgrade.version("v2.10.0"))

    def test_current_release_does_not_fetch_sdk_or_edit(self):
        result = upgrade.release_check(self.pin, self.upstream("v2.9.1").__getitem__, lambda _: self.fail("Unneeded SDK request"))
        self.assertEqual(result["status"], "up-to-date")
        self.assertEqual((self.root / upgrade.PIN).read_text(), self.original)

    def test_reject_unstable_release_moved_tag_and_tag_cycles(self):
        records = self.upstream()
        records["releases/latest"]["prerelease"] = True
        with self.assertRaises(ValueError): self.check(records)
        with self.assertRaises(ValueError): self.check(self.upstream(current=C))
        records = self.upstream()
        records["git/tags/" + C] = {"object": {"sha": C, "type": "tag"}}
        with self.assertRaises(ValueError): upgrade.resolve_tag("v2.10.0", records.__getitem__)

    def test_no_downgrade_or_sdk_only_apply(self):
        for latest, status in [("v2.8.0", "ahead-of-latest"), ("v2.9.1", "up-to-date")]:
            result = self.check(self.upstream(latest))
            self.assertEqual(result["status"], status)
            with self.assertRaises(ValueError):
                upgrade.apply_pin(self.root, self.original, self.pin, result, latest, result["latest"]["commit"], "4.0.11")

    def test_apply_requires_frozen_candidate_and_preserves_other_pin_text(self):
        result = self.check(self.upstream())
        for tag, sha, sdk in [("v2.11.0", B, "4.0.10"), ("v2.10.0", A, "4.0.10"), ("v2.10.0", B, "tot")]:
            with self.assertRaises(ValueError): upgrade.apply_pin(self.root, self.original, self.pin, result, tag, sha, sdk)
        path = self.root / upgrade.PIN
        path.chmod(0o640)
        upgrade.apply_pin(self.root, self.original, self.pin, result, "v2.10.0", B, "4.0.11")
        text, pin = upgrade.read_pin(self.root)
        self.assertTrue(text.startswith("# Pinned build\n"))
        self.assertEqual(pin, {"SCUMMVM_TAG": "v2.10.0", "SCUMMVM_COMMIT": B, "EMSDK_VERSION": "4.0.11"})
        self.assertEqual(path.stat().st_mode & 0o777, 0o640)
        self.assertEqual(list(path.parent.glob(".scummvm-pin-*")), [])

    def test_concurrent_pin_edit_is_not_overwritten(self):
        path = self.root / upgrade.PIN
        path.write_text(self.original + "# concurrent note\n")
        with self.assertRaisesRegex(ValueError, "changed during"):
            upgrade.apply_pin(self.root, self.original, self.pin, self.check(self.upstream()), "v2.10.0", B, "4.0.10")
        self.assertIn("concurrent note", path.read_text())
        self.assertEqual(list(path.parent.glob(".scummvm-pin-*")), [])

    def test_pins_are_data_not_shell_programs(self):
        for extra in ["\nSCUMMVM_TAG=v2.9.1\n", "\nexecute-something\n", "\nOTHER=value\n"]:
            (self.root / upgrade.PIN).write_text(self.original + extra)
            with self.assertRaises(ValueError): upgrade.read_pin(self.root)

    def test_memory_rejects_undocumented_changed_or_missing_patches(self):
        self.memory()
        self.assertEqual(upgrade.validate_memory(self.root), {"native_patches": 1, "generated_adapters": 1})
        extra = self.root / "patches/scummvm/02-extra.patch"
        extra.write_text("new patch")
        with self.assertRaisesRegex(ValueError, "Undocumented"): upgrade.validate_memory(self.root)
        extra.unlink()
        patch = self.root / "patches/scummvm/01-fixture.patch"
        patch.write_text("changed patch")
        with self.assertRaisesRegex(ValueError, "Review patch memory"): upgrade.validate_memory(self.root)
        patch.unlink()
        with self.assertRaisesRegex(ValueError, "no matching adaptation"): upgrade.validate_memory(self.root)

    def test_retirement_keeps_evidence_and_rejects_leftover_file(self):
        ledger, entries = self.memory()
        entries[0].update(status="retired", retired_in="v2.10.0, fixture equivalent behavior verified")
        ledger.write_text(json.dumps({"schema_version": 1, "adaptations": entries}))
        with self.assertRaisesRegex(ValueError, "Retired patch"): upgrade.validate_memory(self.root)
        (self.root / entries[0]["path"]).unlink()
        self.assertEqual(upgrade.validate_memory(self.root)["native_patches"], 0)

    def test_non_python_glue_is_also_covered(self):
        ledger, entries = self.memory()
        path = "scripts/patch_scummvm_fixture.mjs"
        file = self.root / path
        file.write_text("// synthetic adapter\n")
        with self.assertRaisesRegex(ValueError, "Undocumented"): upgrade.validate_memory(self.root)
        entries.append({**entries[1], "path": path, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
        ledger.write_text(json.dumps({"schema_version": 1, "adaptations": entries}))
        self.assertEqual(upgrade.validate_memory(self.root)["generated_adapters"], 2)

    def test_real_build_gate_stops_an_undocumented_patch_before_checkout(self):
        self.memory()
        source = Path(__file__).resolve().parents[4]
        target = self.root / upgrade.SKILL / "scripts"
        target.mkdir(parents=True)
        shutil.copy2(Path(upgrade.__file__), target / "upgrade_check.py")
        builder = self.root / "scripts/build_scummvm_web.sh"
        shutil.copy2(source / "scripts/build_scummvm_web.sh", builder)
        subprocess.run(["git", "init", "--quiet", str(self.root)], check=True, capture_output=True)
        (self.root / "patches/scummvm/02-new.patch").write_text("undocumented fixture")
        result = subprocess.run(["bash", str(builder), "--prepare-source"], cwd=self.root, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Undocumented ScummVM adaptations", result.stderr)
        self.assertFalse((self.root / "vendor").exists())


if __name__ == "__main__":
    unittest.main()
