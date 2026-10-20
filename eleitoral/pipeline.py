"""Processamento em blocos; nenhum total é criado a partir de dados ausentes."""
import csv
import hashlib
import io
import json
import re
import unicodedata
import zipfile
from datetime import date
from pathlib import Path

import pandas as pd

from .sources import ROOT, YEARS, acquire
from .correlation import municipal_resources
from .census import build_census
from .denominators import enrich_dashboard

PEOPLE = {
    "enrico": "ENRICO VAN BLARCUM DE GRAAFF MISASI",
    "reinaldo": "REINALDO DE SOUZA ALGUZ",
}
KEY = ["ANO_ELEICAO", "CD_ELEICAO", "NR_TURNO", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO"]
META = ["NM_MUNICIPIO", "NR_LOCAL_VOTACAO", "NM_LOCAL_VOTACAO", "DS_LOCAL_VOTACAO_ENDERECO"]
RENAME = {
    "ANO_ELEICAO": "year", "CD_ELEICAO": "election", "NR_TURNO": "round",
    "CD_MUNICIPIO": "municipality_id", "NM_MUNICIPIO": "municipality",
    "NR_ZONA": "zone", "NR_SECAO": "section", "CD_CARGO": "office_id",
    "NR_LOCAL_VOTACAO": "location_id", "NM_LOCAL_VOTACAO": "location",
    "DS_LOCAL_VOTACAO_ENDERECO": "address", "QT_VOTOS": "votes",
}


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def normalize(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", str(value).upper()) if not unicodedata.combining(c)).split())


def municipality_name(value):
    """Pontuação não define identidade; diferenças de grafia são explícitas."""
    name = " ".join(re.sub(r"[^A-Z0-9 ]", " ", normalize(value)).split())
    return {"SAO LUIS DO PARAITINGA": "SAO LUIZ DO PARAITINGA"}.get(name, name)


def csv_member(archive, year):
    candidates = [n for n in archive.namelist() if n.upper().endswith("_SP.CSV")]
    if len(candidates) != 1:
        raise ValueError(f"Esperado um CSV de SP em {year}; encontrados {candidates}")
    return candidates[0]


def candidacies(year):
    filename = ROOT / "data" / "raw" / f"candidatos_{year}.zip"
    with zipfile.ZipFile(filename) as archive:
        with archive.open(csv_member(archive, year)) as stream:
            df = pd.read_csv(stream, sep=";", encoding="cp1252", dtype=str, keep_default_na=False)
    result = []
    for person, full_name in PEOPLE.items():
        selected = df[(df.NM_CANDIDATO.map(normalize) == normalize(full_name)) & (df.NR_TURNO == "1") & (df.SG_UF == "SP")]
        if len(selected) != 1:
            raise ValueError(f"Candidatura não resolvida de forma única: {person} {year}")
        row = selected.iloc[0]
        result.append({"person": person, "name": row.NM_URNA_CANDIDATO.title(), "year": year,
                       "candidate_id": row.SQ_CANDIDATO, "number": row.NR_CANDIDATO,
                       "election": row.CD_ELEICAO, "office_id": row.CD_CARGO,
                       "office": row.DS_CARGO.title(), "party": row.SG_PARTIDO,
                       "result": row.DS_SIT_TOT_TURNO})
    return result


def process_votes(year, chunksize=100_000):
    """Lê todos os votos dos cargos comparados para preservar seções com zero voto.

    O denominador é o total de votos registrados para o cargo, incluindo
    brancos/nulos. Não é denominado votos válidos. Uma segunda fonte será
    necessária para participação nos válidos com validação judicial completa.
    """
    people = candidacies(year)
    source = ROOT / "data" / "raw" / f"votacao_secao_{year}_SP.zip"
    totals, selected_votes = [], []
    raw_count = 0
    columns = KEY + META + ["SG_UF", "SQ_CANDIDATO", "QT_VOTOS"]
    group = KEY + META
    with zipfile.ZipFile(source) as archive:
        with archive.open(csv_member(archive, year)) as stream:
            reader = pd.read_csv(stream, sep=";", encoding="cp1252", dtype=str,
                                 keep_default_na=False, usecols=columns, chunksize=chunksize)
            for chunk in reader:
                raw_count += len(chunk)
                chunk = chunk[(chunk.SG_UF == "SP") & (chunk.NR_TURNO == "1") &
                              (chunk.CD_ELEICAO == people[0]["election"]) &
                              chunk.CD_CARGO.isin([p["office_id"] for p in people])].copy()
                chunk["QT_VOTOS"] = pd.to_numeric(chunk.QT_VOTOS, errors="raise").astype("int64")
                if (chunk.QT_VOTOS < 0).any():
                    raise ValueError("Contagem de votos negativa")
                totals.append(chunk.groupby(group, dropna=False, sort=False).QT_VOTOS.sum().reset_index(name="registered"))
                for person in people:
                    rows = chunk[(chunk.SQ_CANDIDATO == person["candidate_id"]) & (chunk.CD_CARGO == person["office_id"])].copy()
                    rows["person"] = person["person"]
                    selected_votes.append(rows[group + ["QT_VOTOS", "person"]])
                # Reduz intermediários sem reter milhões de linhas em memória.
                if len(totals) == 20:
                    totals = [pd.concat(totals, ignore_index=True).groupby(group, dropna=False, sort=False).registered.sum().reset_index()]
    universe = pd.concat(totals, ignore_index=True).groupby(group, dropna=False, sort=False).registered.sum().reset_index()
    if universe.duplicated(KEY).any():
        raise ValueError("Uma seção/cargo possui locais ou endereços conflitantes na mesma eleição")
    picked = pd.concat(selected_votes, ignore_index=True)
    if picked.duplicated(KEY + ["person"]).any():
        raise ValueError("Voto de candidato duplicado na chave seção/eleição/cargo")
    frames = []
    for person in people:
        base = universe[universe.CD_CARGO == person["office_id"]].copy()
        base["person"] = person["person"]
        values = picked[picked.person == person["person"]][KEY + ["person", "QT_VOTOS"]]
        base = base.merge(values, on=KEY + ["person"], how="left", validate="one_to_one")
        base.QT_VOTOS = base.QT_VOTOS.fillna(0).astype("int64")
        if (base.QT_VOTOS > base.registered).any():
            raise ValueError("Candidato recebeu mais votos que o total registrado para o cargo")
        frames.append(base)
    result = pd.concat(frames, ignore_index=True).rename(columns=RENAME)
    result["share_registered"] = (100 * result.votes / result.registered.replace(0, float("nan"))).round(4)
    output = ROOT / "data" / "processed" / f"sections_{year}.csv.gz"
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    result.to_csv(temporary, index=False, compression="gzip")
    temporary.replace(output)
    audit = {"year": year, "status": "importado", "raw_rows": raw_count,
             "source_file": source.name, "section_candidate_rows": len(result),
             "totals": {p: int(result.loc[result.person == p, "votes"].sum()) for p in PEOPLE},
             "source": f"https://dadosabertos.tse.jus.br/dataset/resultados-{year}",
             "note": "Totais extraídos do arquivo por seção; reconciliação externa ainda pendente."}
    with source.open("rb") as stream:
        audit["source_sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
    dump(ROOT / "data" / "processed" / f"audit_{year}.json", audit)
    return audit


AMENDMENT_FIELDS = ["id", "person", "sphere", "exercise", "uf", "municipality", "beneficiary", "purpose",
                    "allocated_brl", "committed_brl", "paid_brl", "payment_date", "payment_month",
                    "record_type", "official_code", "status", "source", "source_as_of", "coverage"]


def read_amendments(path):
    """Contrato canônico: ausência de valor/data não equivale a pagamento zero."""
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    seen = set()
    for row in rows:
        for key in AMENDMENT_FIELDS:
            row.setdefault(key, "")
        if row["sphere"] == "estadual" and not row["uf"]:
            row["uf"] = "SP"
        if row["id"] in seen:
            raise ValueError("Emenda duplicada: " + row["id"])
        seen.add(row["id"])
        if row["person"] not in PEOPLE or not 2019 <= int(row["exercise"]) <= 2022:
            raise ValueError("Emenda fora do recorte")
        for field in ("allocated_brl", "committed_brl", "paid_brl"):
            row[field] = float(row[field]) if row[field] else None
            if row[field] is not None and row[field] < 0 and row["record_type"] != "estorno":
                raise ValueError("Valor negativo na emenda")
        payment = date.fromisoformat(row["payment_date"]) if row["payment_date"] else None
        month = row["payment_month"]
        if month:
            date.fromisoformat(month + "-01")  # Valida o mês; não cria uma data de pagamento no dado.
        if payment and month and payment.strftime("%Y-%m") != month:
            raise ValueError("Data e competência mensal do pagamento são conflitantes")
        in_period = bool(payment and date(2019, 1, 1) <= payment <= date(2022, 12, 31)) or bool(month and "2019-01" <= month <= "2022-12")
        row["paid_in_period_brl"] = row["paid_brl"] if in_period else None
        if not row["source"].startswith("https://"):
            raise ValueError("Emenda sem fonte verificável")
    return rows


def build():
    """Dados resumidos na abertura; seções são carregadas apenas por município."""
    import shutil
    dist = ROOT / "dist"
    shutil.copytree(ROOT / "web", dist, dirs_exist_ok=True)
    (dist / ".nojekyll").touch()
    people, summary, audits = [], [], []
    for year in YEARS:
        if (ROOT / "data" / "raw" / f"candidatos_{year}.zip").exists():
            people += candidacies(year)
        file = ROOT / "data" / "processed" / f"sections_{year}.csv.gz"
        if not file.exists():
            audits.append({"year": year, "status": "pendente", "note": "Arquivo ainda não processado"})
            continue
        df = pd.read_csv(file, dtype={k: str for k in ["municipality_id", "zone", "section", "location_id", "office_id", "election", "round"]}, keep_default_na=False)
        grouped = df.groupby(["year", "person", "municipality_id", "municipality"], sort=False).agg(votes=("votes", "sum"), registered=("registered", "sum"), sections=("section", "size")).reset_index()
        summary += grouped.to_dict("records")
        for mun, rows in df.groupby("municipality_id", sort=False):
            dump(dist / "data" / "sections" / str(year) / f"{mun}.json", rows.to_dict("records"))
        audits.append(json.loads((ROOT / "data" / "processed" / f"audit_{year}.json").read_text(encoding="utf-8")))
    amendments = []
    for source in sorted((ROOT / "data/curated").glob("emendas*.csv")):
        amendments += read_amendments(source)
    if len({row["id"] for row in amendments}) != len(amendments):
        raise ValueError("Emenda ou pagamento repetido entre arquivos canônicos")
    geo_file = ROOT / "data" / "geography" / "municipalities.geojson"
    if geo_file.exists():
        shutil.copy2(geo_file, dist / "data" / "municipalities.geojson")
    ibge = ROOT / "data" / "geography" / "municipalities.json"
    crosswalk = {}
    if ibge.exists():
        lookup = {municipality_name(r["nome"]): str(r["id"]) for r in json.loads(ibge.read_text(encoding="utf-8"))}
        for row in summary:
            code = lookup.get(municipality_name(row["municipality"]))
            if code:
                crosswalk[row["municipality_id"]] = code
        expected = {row["municipality_id"] for row in summary}
        if set(crosswalk) != expected or len(set(crosswalk.values())) != len(crosswalk):
            raise ValueError("Correspondência TSE–IBGE incompleta ou com colisões; revisar antes de gerar o mapa")
    census = build_census(crosswalk)
    dashboard = {"title": "Território do voto", "people": people, "summary": summary,
         "audits": audits, "amendments": amendments, "crosswalk": crosswalk,
         "census": census,
         "municipal_resources": municipal_resources(summary, amendments, municipality_name),
         "amendment_coverage": "Base federal importada: empenhos por localidade e pagamentos mensais por favorecido. Base estadual parcial: demonstrativos impositivos de 2020–2022, sem datas de pagamento; 2019 e revisão integral pendentes. Valores autorizados originais ainda não obtidos na esfera federal.",
         "denominator": "Votos registrados para o cargo, incluindo brancos e nulos; não são votos válidos.",
         "scope": {"years": list(YEARS), "amendments": [2019, 2022], "uf": "SP"}}
    dump(dist / "data" / "dashboard.json", enrich_dashboard(dashboard, root=ROOT))
    for name, rows in [("votos_municipios", summary), ("emendas", amendments), ("censos_municipios", census["rows"])]:
        if rows:
            with (dist / "data" / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
    return {"municipality_rows": len(summary), "amendment_rows": len(amendments), "audits": audits}
