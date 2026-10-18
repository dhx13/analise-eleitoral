"""Verificações de integridade que evitam conclusões eleitorais incorretas."""
import csv
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from eleitoral import pipeline as p


class IntegrityTests(unittest.TestCase):
    def setUp(self):
        temporary_root = Path(__file__).resolve().parents[1] / "tmp" / "tests"
        temporary_root.mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=temporary_root)
        self.root = Path(self.tmp.name)
        (self.root / "data/raw").mkdir(parents=True)
        self.root_patch = patch.object(p, "ROOT", self.root)
        self.root_patch.start()
        self.people = [dict(person=who, name=who, year=2018, candidate_id=str(i+1),
                            number=str(4336+i), election="297", office_id=str(6+i),
                            office="cargo", party="PV", result="ELEITO")
                       for i, who in enumerate(p.PEOPLE)]
        self.candidate_patch = patch.object(p, "candidacies", return_value=self.people)
        self.candidate_patch.start()

    def tearDown(self):
        self.candidate_patch.stop()
        self.root_patch.stop()
        assert self.root.resolve().is_relative_to((Path(__file__).resolve().parents[1] / "tmp/tests").resolve())
        self.tmp.cleanup()

    def votes(self, duplicate=False):
        columns = p.KEY + p.META + ["SG_UF", "SQ_CANDIDATO", "QT_VOTOS"]
        rows = []
        for section in ("1", "2"):
            for office in ("6", "7"):
                base = dict(zip(p.KEY, ["2018", "297", "1", "12345", "1", section, office]))
                base.update(dict(zip(p.META, ["Cidade", "100", "Escola", "Rua A, 1"])), SG_UF="SP")
                rows.append(dict(base, SQ_CANDIDATO="99", QT_VOTOS="10"))
                if section == "1":
                    row = dict(base, SQ_CANDIDATO=str(int(office)-5), QT_VOTOS="4")
                    rows.append(row)
                    if duplicate:
                        rows.append(dict(row))
        # Registro de outra eleição não deve contaminar os totais.
        rows.append(dict(rows[1], CD_ELEICAO="999", QT_VOTOS="9000"))
        text = io.StringIO(newline="")
        writer = csv.DictWriter(text, fieldnames=columns, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)
        with zipfile.ZipFile(self.root / "data/raw/votacao_secao_2018_SP.zip", "w") as archive:
            archive.writestr("votacao_secao_2018_SP.csv", text.getvalue().encode("cp1252"))

    def test_zero_votes_and_election_scope_are_preserved(self):
        self.votes()
        audit = p.process_votes(2018, chunksize=3)
        self.assertEqual(audit["totals"], {"enrico": 4, "reinaldo": 4})
        rows = pd.read_csv(self.root / "data/processed/sections_2018.csv.gz")
        self.assertEqual(len(rows), 4)
        self.assertEqual(len(rows[rows.votes == 0]), 2)
        self.assertEqual(set(rows.registered), {10, 14})

    def test_duplicate_candidate_votes_fail(self):
        self.votes(duplicate=True)
        with self.assertRaisesRegex(ValueError, "duplicado"):
            p.process_votes(2018, chunksize=3)

    def test_paid_without_date_is_not_paid_in_period(self):
        path = self.root / "emendas.csv"
        rows = []
        for i, when in enumerate(("", "2023-01-01", "2022-12-31", "")):
            row = {k: "" for k in p.AMENDMENT_FIELDS}
            row.update(id=str(i), person="reinaldo", exercise="2022", allocated_brl="100.00",
                       paid_brl="100.00", payment_date=when, status="PAGA", source="https://www.transparencia.sp.gov.br/")
            if i == 3:
                row["payment_month"] = "2022-10"
            rows.append(row)
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=p.AMENDMENT_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        values = p.read_amendments(path)
        self.assertIsNone(values[0]["paid_in_period_brl"])
        self.assertIsNone(values[1]["paid_in_period_brl"])
        self.assertEqual(values[2]["paid_in_period_brl"], 100.00)
        self.assertEqual(values[3]["paid_in_period_brl"], 100.00)
        self.assertEqual(values[3]["payment_date"], "")

    def test_missing_votes_are_not_interpreted_as_zero(self):
        with self.assertRaises(FileNotFoundError):
            p.process_votes(2018)


if __name__ == "__main__":
    unittest.main()
