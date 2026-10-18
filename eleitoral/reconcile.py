"""Confronta todos os totais municipais com uma segunda exportação oficial."""
import argparse
import hashlib
import json
import zipfile
import pandas as pd
from .pipeline import candidacies, csv_member, dump
from .sources import ROOT, YEARS, resource


def reconcile(year):
    people = candidacies(year)
    reference_file = ROOT / "data/raw" / f"nominal_{year}_SP.zip"
    columns = ["SG_UF", "NR_TURNO", "CD_ELEICAO", "CD_CARGO", "SQ_CANDIDATO", "CD_MUNICIPIO", "QT_VOTOS_NOMINAIS"]
    rows = []
    with zipfile.ZipFile(reference_file) as archive:
        with archive.open(csv_member(archive, year)) as stream:
            for chunk in pd.read_csv(stream, sep=";", encoding="cp1252", dtype=str,
                                     keep_default_na=False, usecols=columns, chunksize=100_000):
                for candidate in people:
                    selected = chunk[(chunk.SG_UF == "SP") & (chunk.NR_TURNO == "1") &
                                     (chunk.CD_ELEICAO == candidate["election"]) &
                                     (chunk.CD_CARGO == candidate["office_id"]) &
                                     (chunk.SQ_CANDIDATO == candidate["candidate_id"])].copy()
                    selected["person"] = candidate["person"]
                    selected["QT_VOTOS_NOMINAIS"] = pd.to_numeric(selected.QT_VOTOS_NOMINAIS, errors="raise")
                    rows.append(selected[["person", "CD_MUNICIPIO", "QT_VOTOS_NOMINAIS"]])
    reference = pd.concat(rows).groupby(["person", "CD_MUNICIPIO"]).QT_VOTOS_NOMINAIS.sum().rename("reference")
    actual = pd.read_csv(ROOT / "data/processed" / f"sections_{year}.csv.gz", dtype={"municipality_id": str})
    actual = actual.groupby(["person", "municipality_id"]).votes.sum().rename("sections")
    reference.index.names = actual.index.names
    comparison = pd.concat([actual, reference], axis=1).fillna(0)
    bad = comparison[comparison.sections != comparison.reference]
    if not bad.empty:
        dump(ROOT / "data/processed" / f"reconciliation_errors_{year}.json", bad.reset_index().to_dict("records"))
        raise ValueError(f"Reconciliação {year}: {len(bad)} divergências municipais")
    path = ROOT / "data/processed" / f"audit_{year}.json"
    audit = json.loads(path.read_text(encoding="utf-8"))
    audit["reconciliation"] = {"status": "conferido", "municipality_candidate_checks": len(comparison),
                               "max_abs_difference": 0,
                               "source": resource("resultados", year, "Votação nominal por município e zona")["url"]}
    audit["note"] = "Totais por município conferidos sem divergências com a exportação oficial por município e zona."
    original = ROOT / "data/raw" / f"votacao_secao_{year}_SP.zip"
    if not audit.get("source_sha256"):
        with original.open("rb") as stream:
            audit["source_sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
    dump(path, audit)
    return {"year": year, **audit["reconciliation"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--anos", nargs="+", type=int, choices=YEARS, default=list(YEARS))
    for year in parser.parse_args().anos:
        print(json.dumps(reconcile(year), ensure_ascii=False), flush=True)
