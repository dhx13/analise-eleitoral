"""Denominadores municipais oficiais; nunca estima aptos a partir dos votos."""
import csv
import gzip
import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone

from .sources import ROOT, YEARS, acquire, download, resource


def _read(path):
    with gzip.open(path, "rt", encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream, delimiter=";"))


def prepare_sources(people):
    """Versiona recortes de SP, com filtros e SHA-256 das duas exportações."""
    target = ROOT / "data/electoral"
    target.mkdir(parents=True, exist_ok=True)
    sources = []
    for year in YEARS:
        candidacies = [p for p in people if p["year"] == year]
        offices = {(p["election"], p["office_id"]) for p in candidacies}
        candidates = {p["candidate_id"] for p in candidacies}
        for kind in ("detail", "nominal"):
            name = ("Detalhe da apuração por município e zona" if kind == "detail"
                    else "Votação nominal por município e zona")
            src = resource("resultados", year, name)
            archive_path = (download(src["url"], ROOT / f"data/raw/detalhe_{year}.zip")
                            if kind == "detail" else acquire(year, "nominal"))
            with zipfile.ZipFile(archive_path) as archive:
                member = next(n for n in archive.namelist() if n.upper().endswith("_SP.CSV"))
                with archive.open(member) as stream:
                    reader = csv.DictReader(io.TextIOWrapper(stream, encoding="cp1252"), delimiter=";")
                    fields = reader.fieldnames
                    rows = [r for r in reader if r["SG_UF"] == "SP" and r["NR_TURNO"] == "1"
                            and (r["CD_ELEICAO"], r["CD_CARGO"]) in offices
                            and (kind == "detail" or r["SQ_CANDIDATO"] in candidates)]
            text = io.StringIO(newline="")
            writer = csv.DictWriter(text, fieldnames=fields, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
            raw = text.getvalue().encode("utf-8")
            filename = f"{kind}_{year}.csv.gz"
            (target / filename).write_bytes(gzip.compress(raw, mtime=0))
            with archive_path.open("rb") as stream:
                archive_hash = hashlib.file_digest(stream, "sha256").hexdigest()
            sources.append({"year": year, "kind": kind, "url": src["url"], "member": member,
                            "file": filename, "rows": len(rows), "slice_sha256": hashlib.sha256(raw).hexdigest(),
                            "archive_sha256": archive_hash, "downloaded_at": datetime.now(timezone.utc).isoformat(),
                            "filter": "SP; turno 1; eleições e cargos das candidaturas; nominal restrito aos candidatos do projeto"})
    (target / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return sources


def municipal_denominators(people, summary, root=ROOT):
    """Reconcilia fontes municipais e retorna registros descritivos por candidatura."""
    folder = root / "data/electoral"
    if not (folder / "sources.json").exists():
        return None
    sources = json.loads((folder / "sources.json").read_text(encoding="utf-8"))
    detail, nominal = {}, {}
    for source in sources:
        raw = gzip.decompress((folder / source["file"]).read_bytes())
        if hashlib.sha256(raw).hexdigest() != source["slice_sha256"]:
            raise ValueError("Recorte eleitoral alterado: " + source["file"])
        rows = _read(folder / source["file"])
        if len(rows) != source["rows"]:
            raise ValueError("Número de linhas do recorte eleitoral divergente")
        seen = set()
        for row in rows:
            year = int(row["ANO_ELEICAO"])
            if year != source["year"] or row["SG_UF"] != "SP" or row["NR_TURNO"] != "1":
                raise ValueError("Recorte eleitoral fora do ano, UF ou turno")
            key = (year, row["CD_ELEICAO"], row["CD_CARGO"], row["CD_MUNICIPIO"])
            unique = key + (row["NR_ZONA"], row["ST_VOTO_EM_TRANSITO"])
            if source["kind"] == "nominal":
                unique += (row["SQ_CANDIDATO"],)
            if unique in seen:
                raise ValueError("Apuração duplicada por município/zona")
            seen.add(unique)
            if source["kind"] == "detail":
                fields = {"electorate": "QT_APTOS", "valid_votes": "QT_TOTAL_VOTOS_VALIDOS",
                          "cast_votes": "QT_VOTOS", "valid_nominal_total": "QT_VOTOS_NOMINAIS_VALIDOS",
                          "valid_party_total": "QT_TOTAL_VOTOS_LEG_VALIDOS"}
                entry = detail.setdefault(key, {f: 0 for f in fields})
                values = {f: int(row[col]) for f, col in fields.items()}
                if any(v < 0 for v in values.values()):
                    raise ValueError("Contagem eleitoral negativa ou ausente")
                if values["valid_votes"] != values["valid_nominal_total"] + values["valid_party_total"]:
                    raise ValueError("Votos válidos não reconciliam com nominais e legenda")
                if not values["valid_votes"] <= values["cast_votes"] <= values["electorate"]:
                    raise ValueError("Denominadores eleitorais inconsistentes")
                for field, value in values.items():
                    entry[field] += value
            else:
                key += (row["SQ_CANDIDATO"],)
                entry = nominal.setdefault(key, {"nominal_votes": 0, "valid_nominal_votes": 0})
                for field, column in (("nominal_votes", "QT_VOTOS_NOMINAIS"),
                                      ("valid_nominal_votes", "QT_VOTOS_NOMINAIS_VALIDOS")):
                    value = int(row[column])
                    if value < 0:
                        raise ValueError("Voto nominal ausente ou negativo")
                    entry[field] += value
    candidates = {(p["year"], p["person"]): p for p in people}
    result = []
    for row in summary:
        p = candidates[(row["year"], row["person"])]
        key = (row["year"], p["election"], p["office_id"], row["municipality_id"])
        counts = detail.get(key)
        votes = nominal.get(key + (p["candidate_id"],))
        if counts is None or votes is None:
            raise ValueError("Denominador ou votação nominal municipal ausente")
        if counts["cast_votes"] != row["registered"] or votes["nominal_votes"] != row["votes"]:
            raise ValueError("Exportações TSE de seções e município/zona divergentes: " + str(key))
        if not 0 <= votes["valid_nominal_votes"] <= counts["valid_votes"]:
            raise ValueError("Votação válida do candidato inconsistente")
        result.append({"year": row["year"], "person": row["person"], "municipality_id": row["municipality_id"],
                       "office_id": p["office_id"], **counts, **votes})
    return {"rows": result, "sources": sources,
            "definitions": {"valid_share": "100 × votos nominais válidos do candidato / total de votos válidos do cargo (nominais + legenda)",
                            "electorate_share": "100 × votos nominais do candidato / eleitores aptos do município para o cargo",
                            "registered": "Campo legado: votos registrados para o cargo, incluindo brancos e nulos; não é eleitorado apto"}}


def enrich_dashboard(data, root=ROOT):
    if not (root / "data/electoral/sources.json").exists():
        return data
    result = municipal_denominators(data["people"], data["summary"], root)
    if result is not None:
        data["electoral_denominators"] = result
    return data


if __name__ == "__main__":
    import re
    snapshot = (ROOT / "docs/index.html").read_text(encoding="utf-8")
    payload = json.loads(re.search(r'<script id="embedded-data" type="application/json">(.*?)</script>', snapshot, re.S).group(1))
    prepare_sources(payload["data"]["people"])
    result = municipal_denominators(payload["data"]["people"], payload["data"]["summary"])
    print(json.dumps({"municipal_rows": len(result["rows"]), "sources": len(result["sources"])}))
