"""Recortes censitários municipais do SIDRA, com denominadores e rastreabilidade.

As respostas oficiais compactadas são versionadas. O site pode ser reconstruído
sem rede; a atualização explícita usa os mesmos recortes em sources.json.
"""
import gzip
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlparse

from .sources import ROOT

ELECTION_CENSUS = {2018: 2010, 2022: 2022, 2026: 2022}
INDICATORS = {
    "population": ("População residente", "people", "Total de pessoas residentes.", [1378, 9514]),
    "female_pct": ("Mulheres na população", "percent", "Mulheres / população residente × 100.", [1378, 9514]),
    "older_65_pct": ("Pessoas de 65 anos ou mais", "percent", "Pessoas de 65 anos ou mais / população residente × 100.", [1378, 9514]),
    "literacy_15_pct": ("Alfabetização de pessoas de 15 anos ou mais", "percent", "Pessoas alfabetizadas de 15 anos ou mais / pessoas de 15 anos ou mais × 100.", [1379, 9542]),
    "income_pc_mean_brl": ("Renda domiciliar per capita média", "brl", "Rendimento nominal mensal por morador elegível; inclui moradores sem rendimento. Reais do ano do censo, sem correção pela inflação.", [3578, 10295]),
    "income_pc_median_brl": ("Renda domiciliar per capita mediana", "brl", "Mediana do rendimento nominal mensal domiciliar per capita dos moradores elegíveis. Reais do ano do censo, sem correção pela inflação.", [3578, 10295]),
    "water_network_pct": ("Água da rede geral como fonte principal", "percent", "Domicílios particulares permanentes com rede geral como abastecimento principal / total de domicílios particulares permanentes ocupados × 100.", [3218, 6803]),
    "sewer_network_pct": ("Esgoto por rede geral ou pluvial", "percent", "Domicílios particulares permanentes atendidos por rede geral/pluvial / total de domicílios particulares permanentes ocupados × 100. Em 2022 inclui fossa ligada à rede, categoria explicitada no novo questionário.", [1394, 6805]),
    "garbage_collection_pct": ("Lixo coletado", "percent", "Coleta direta por serviço de limpeza ou depósito em caçamba do serviço / total de domicílios particulares permanentes ocupados × 100.", [3218, 6892]),
}


def sidra_number(value):
    """Símbolos SIDRA: '-' é zero absoluto; X, .. e ... não são valores."""
    text = str(value).strip() if value is not None else ""
    if text == "-":
        return Decimal(0)
    if text in {"", "X", "..", "..."}:
        return None
    number = Decimal(text)
    if not number.is_finite() or number < 0:
        raise ValueError(f"Valor censitário inválido: {text}")
    return number


def percentage(numerator, denominator):
    if numerator is None or denominator is None or denominator == 0:
        return None
    if not 0 <= numerator <= denominator:
        raise ValueError("Numerador censitário fora do denominador")
    return float(100 * numerator / denominator)


class SidraTable:
    """Índice por variável, localidade e categorias; ambiguidades falham."""

    def __init__(self, payload, year):
        self.values = {}
        self.groups = {}
        self.names = {}
        for variable in payload:
            for result in variable["resultados"]:
                categories = {}
                for classification in result["classificacoes"]:
                    if len(classification["categoria"]) != 1:
                        raise ValueError("Célula SIDRA com categoria ambígua")
                    categories[int(classification["id"])] = int(next(iter(classification["categoria"])))
                for series in result["series"]:
                    location = series["localidade"]
                    code = str(location["id"])
                    if not (code == "35" and location["nivel"]["id"] == "N3" or
                            code.startswith("35") and len(code) == 7 and location["nivel"]["id"] == "N6"):
                        raise ValueError("Localidade fora de São Paulo no recorte censitário")
                    if set(series["serie"]) != {str(year)}:
                        raise ValueError("Ano inesperado na resposta censitária")
                    key = (code, int(variable["id"]), tuple(sorted(categories.items())))
                    if key in self.values:
                        raise ValueError("Célula censitária duplicada")
                    self.values[key] = sidra_number(series["serie"][str(year)])
                    self.groups.setdefault((code, int(variable["id"])), []).append((categories, self.values[key]))
                    self.names[code] = location["nome"].removesuffix(" - SP")

    def get(self, code, variable, categories=None):
        categories = categories or {}
        found = [value for cats, value in self.groups.get((code, variable), [])
                 if all(cats.get(int(k)) == int(v) for k, v in categories.items())]
        if len(found) != 1:
            raise ValueError(f"Célula ausente ou ambígua: {code}/{variable}/{categories}: {len(found)}")
        return found[0]


def complete_sum(values):
    """Não transforma uma faixa etária suprimida em população zero."""
    return None if any(v is None for v in values) else sum(values, Decimal(0))


def profile(tables, code, year):
    population = tables["population"].get(code, 93, {2: 0 if year == 2010 else 6794})
    female = tables["population"].get(code, 93, {2: 5})
    older_groups = ([93096, 496] if year == 2010 else
                    [93096, 93097, 93098, 49108, 49109, 60040, 60041, 6653])
    older = complete_sum([tables["older"].get(code, 93, {287: age}) for age in older_groups])
    literacy_groups = ([93086, 93087, 93088, 93089, 93090, 93091, 93092, 93093,
                        93094, 11942, 496] if year == 2010 else [100362])
    literacy_var = 138 if year == 2010 else 950
    adults = complete_sum([tables["literacy"].get(code, literacy_var, {59: 93024, 287: age}) for age in literacy_groups])
    literate = complete_sum([tables["literacy"].get(code, literacy_var, {59: 1023, 287: age}) for age in literacy_groups])
    income = tables["income"]
    income_count, mean, median = (2035, 2012, 2013) if year == 2010 else (13604, 13431, 13534)
    if year == 2010:
        housing = tables["water_garbage"]
        homes = housing.get(code, 96, {61: 0, 67: 0})
        water = housing.get(code, 96, {61: 92853, 67: 0})
        garbage = housing.get(code, 96, {61: 0, 67: 2520})
        sewer_total = tables["sewer"].get(code, 96, {11558: 0})
        sewer = tables["sewer"].get(code, 96, {11558: 92855})
        if homes != sewer_total:
            raise ValueError("Denominadores domiciliares de 2010 divergentes")
    else:
        homes = tables["water"].get(code, 381, {1821: 72129})
        water = tables["water"].get(code, 381, {1821: 72144})
        garbage_total = tables["garbage"].get(code, 381, {67: 10972})
        garbage = tables["garbage"].get(code, 381, {67: 2520})
        sewer_total = tables["sewer"].get(code, 381, {11558: 46292})
        sewer = tables["sewer"].get(code, 381, {11558: 46290})
        if homes != garbage_total or homes != sewer_total:
            raise ValueError("Denominadores domiciliares de 2022 divergentes")
    row = {
        "census_year": year, "ibge_id": code,
        "municipality": tables["population"].names[code],
        "population": population, "female_count": female, "older_65_count": older,
        "people_15_plus": adults, "literate_15_plus": literate,
        "income_eligible_people": income.get(code, income_count),
        "households": homes, "water_network_households": water,
        "sewer_network_households": sewer, "garbage_collection_households": garbage,
        "female_pct": percentage(female, population),
        "older_65_pct": percentage(older, population),
        "literacy_15_pct": percentage(literate, adults),
        "income_pc_mean_brl": income.get(code, mean),
        "income_pc_median_brl": income.get(code, median),
        "water_network_pct": percentage(water, homes),
        "sewer_network_pct": percentage(sewer, homes),
        "garbage_collection_pct": percentage(garbage, homes),
    }
    return {key: float(value) if isinstance(value, Decimal) else value for key, value in row.items()}


def load_tables(root=ROOT):
    sources = json.loads((root / "data/census/sources.json").read_text(encoding="utf-8"))
    years = {2010: {}, 2022: {}}
    for source in sources:
        raw = gzip.decompress((root / source["file"]).read_bytes())
        if hashlib.sha256(raw).hexdigest() != source["sha256"]:
            raise ValueError("Checksum censitário divergente: " + source["file"])
        years[source["year"]][source["key"]] = SidraTable(json.loads(raw), source["year"])
    return years, sources


def build_census(crosswalk, root=ROOT, *, write_output=True):
    years, sources = load_tables(root)
    reverse = {str(ibge): str(tse) for tse, ibge in crosswalk.items()}
    if len(reverse) != len(crosswalk):
        raise ValueError("Correspondência TSE-IBGE censitária com colisão")
    rows, states, coverage = [], [], []
    for year, tables in years.items():
        expected = set(reverse) | {"35"}
        for name, table in tables.items():
            if set(table.names) != expected:
                raise ValueError(f"Cobertura censitária incompleta ou divergente: {year}/{name}")
        for code in sorted(reverse):
            row = profile(tables, code, year) | {"municipality_id": reverse[code]}
            rows.append(row)
        states.append(profile(tables, "35", year))
        subset = [r for r in rows if r["census_year"] == year]
        coverage.append({"year": year, "municipalities": len(subset), "expected": len(reverse),
                         "missing_by_indicator": {key: sum(r[key] is None for r in subset) for key in INDICATORS}})
    indicators = {key: {"label": label, "unit": unit, "definition": definition,
                         "sources": {str(y): f"https://sidra.ibge.gov.br/tabela/{table}"
                                     for y, table in zip((2010, 2022), tables)}}
                  for key, (label, unit, definition, tables) in INDICATORS.items()}
    result = {"election_census": ELECTION_CENSUS, "indicators": indicators,
              "rows": rows, "states": states, "coverage": coverage, "sources": sources}
    # Proíbe NaN no contrato público; a ausência continua sendo null.
    encoded = json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
    if write_output:
        (root / "data/census/indicators.json").write_text(encoded, encoding="utf-8", newline="\n")
    return result


def refresh(root=ROOT):
    """Atualização explícita; só altera o manifesto depois de validar os dados."""
    manifest_path = root / "data/census/sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    downloaded = []
    for source in manifest:
        if urlparse(source["url"]).netloc != "servicodados.ibge.gov.br":
            raise ValueError("Fonte censitária fora do domínio oficial")
        with urllib.request.urlopen(source["url"], timeout=90) as response:
            raw = response.read()
        SidraTable(json.loads(raw), source["year"])
        downloaded.append((source, raw))
    for source, raw in downloaded:
        target = root / source["file"]
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
        temporary.replace(target)
        source.update(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw),
                      retrieved_at=datetime.now(timezone.utc).isoformat())
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return {"queries": len(manifest), "years": [2010, 2022]}
