import gzip
import hashlib
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from eleitoral.denominators import municipal_denominators
from eleitoral.sources import ROOT


class DenominatorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        html = (ROOT / "docs/index.html").read_text(encoding="utf-8")
        cls.data = json.loads(re.search(r'<script id="embedded-data" type="application/json">(.*?)</script>', html, re.S).group(1))["data"]

    def test_official_sources_cover_and_reconcile_all_municipal_records(self):
        result = municipal_denominators(self.data["people"], self.data["summary"])
        self.assertEqual(len(result["rows"]), 3870)
        self.assertEqual(len(result["sources"]), 6)
        for year in (2018, 2022, 2026):
            for person in ("enrico", "reinaldo"):
                rows = [r for r in result["rows"] if r["year"] == year and r["person"] == person]
                self.assertEqual(len({r["municipality_id"] for r in rows}), 645)
                for row in rows:
                    self.assertLessEqual(row["valid_nominal_votes"], row["valid_votes"])
                    self.assertLessEqual(row["valid_votes"], row["cast_votes"])
                    self.assertLessEqual(row["cast_votes"], row["electorate"])
                    self.assertEqual(row["valid_votes"], row["valid_nominal_total"] + row["valid_party_total"])

    def test_vote_disagreement_between_exports_is_not_silently_accepted(self):
        rows = [dict(r) for r in self.data["summary"]]
        rows[0]["votes"] += 1
        with self.assertRaisesRegex(ValueError, "divergentes"):
            municipal_denominators(self.data["people"], rows)

    def test_hash_and_duplicate_zone_protect_against_changed_or_repeated_source(self):
        temporary_root = ROOT / "tmp/tests"
        temporary_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as folder:
            root = Path(folder)
            self.assertTrue(root.resolve().is_relative_to(temporary_root.resolve()))
            target = root / "data/electoral"
            shutil.copytree(ROOT / "data/electoral", target)
            manifest = json.loads((target / "sources.json").read_text(encoding="utf-8"))
            first = manifest[0]
            file = target / first["file"]
            raw = gzip.decompress(file.read_bytes())
            raw += raw.splitlines(keepends=True)[1]
            file.write_bytes(gzip.compress(raw))
            with self.assertRaisesRegex(ValueError, "alterado"):
                municipal_denominators(self.data["people"], self.data["summary"], root)
            first["slice_sha256"] = hashlib.sha256(raw).hexdigest()
            first["rows"] += 1
            (target / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicada"):
                municipal_denominators(self.data["people"], self.data["summary"], root)
