"""Dados CGU: empenho não é autorização; pagamento mensal não é data diária."""
import csv
import hashlib
import json
import zipfile
from decimal import Decimal
import pandas as pd
from .pipeline import AMENDMENT_FIELDS, dump, normalize
from .sources import ROOT

SOURCE = "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO"


def decimal(value):
    return Decimal(value.replace(".", "").replace(",", "."))


def extract():
    records, amounts = [], {}
    authors = set()
    path = ROOT / "data/raw/emendas/federal_UNICO.zip"
    with zipfile.ZipFile(path) as archive:
        for filename, kind in [("EmendasParlamentares.csv", "empenho"), ("EmendasParlamentares_PorFavorecido.csv", "pagamento")]:
            stamp = archive.getinfo(filename).date_time
            asof = f"{stamp[0]:04d}-{stamp[1]:02d}-{stamp[2]:02d}"
            with archive.open(filename) as stream:
                for chunk in pd.read_csv(stream, sep=";", encoding="cp1252", dtype=str, keep_default_na=False, chunksize=50_000):
                    selected = chunk[chunk["Nome do Autor da Emenda"].map(normalize).isin({"ENRICO MISASI", "ENRICO VAN BLARCUM DE GRAAFF MISASI"})]
                    for idx, row in selected.iterrows():
                        code = row["Código da Emenda"]
                        if len(code) < 4 or not code[:4].isdigit():
                            continue
                        exercise = int(code[:4])
                        if not 2019 <= exercise <= 2022:
                            continue
                        authors.add((row["Código do Autor da Emenda"], row["Nome do Autor da Emenda"]))
                        record = {field: "" for field in AMENDMENT_FIELDS}
                        record.update(id=f"federal:{kind}:{code}:linha{idx}", person="enrico", sphere="federal",
                                      exercise=str(exercise), official_code=code, record_type=kind,
                                      source=SOURCE, source_as_of=asof,
                                      coverage="Exportação CGU por emenda e por favorecido; competência mensal dos pagamentos")
                        if kind == "empenho":
                            amount = decimal(row["Valor Empenhado"])
                            record.update(uf="SP" if row["Código UF IBGE"].startswith("35") else row["UF"], municipality=row["Município"], beneficiary="Localidade de aplicação: " + row["Localidade de aplicação do recurso"],
                                          purpose=row["Nome Ação"], committed_brl=str(amount), status="Valor empenhado na posição da base; não é valor autorizado original")
                        else:
                            period = row["Ano/Mês"]
                            if len(period) != 6 or not period.isdigit() or not "201901" <= period <= "202212":
                                continue
                            amount = decimal(row["Valor Recebido"])
                            record.update(uf=row["UF Favorecido"], municipality=row["Município Favorecido"], beneficiary=row["Favorecido"],
                                          purpose="Pagamento por favorecido (localidade do favorecido, não necessariamente de aplicação)",
                                          paid_brl=str(amount), payment_month=period[:4] + "-" + period[4:],
                                          status="Pagamento recebido por competência mensal", record_type="estorno" if amount < 0 else kind)
                        if amount < 0 and kind == "empenho":
                            record["record_type"] = "estorno"
                        records.append(record)
                        amounts[kind] = amounts.get(kind, Decimal(0)) + amount
    if len(authors) != 1:
        raise ValueError(f"Autoria federal não é única no recorte: {authors}")
    output = ROOT / "data/curated/emendas_federais.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=AMENDMENT_FIELDS)
        writer.writeheader()
        writer.writerows(records)
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    result = {"source": SOURCE, "sha256": digest, "author": sorted(authors), "rows": len(records),
              "amounts": {k: str(v) for k, v in amounts.items()},
              "notes": ["Não se soma o valor da emenda novamente a suas parcelas de pagamento.",
                        "Empenho acumulado na posição da base não equivale a valor autorizado nem a empenhos ocorridos somente até 2022.",
                        "Pagamentos são filtrados por competência mensal 201901–202212 e exercício da emenda 2019–2022."]}
    dump(ROOT / "data/curated/federal_audit.json", result)
    return result


if __name__ == "__main__":
    print(json.dumps(extract(), ensure_ascii=False), flush=True)
