"""Extrai tabelas estaduais preservando página e data da fonte.

Um status PAGA sem documentos de pagamento não informa a data de execução.
O identificador gerado é documental, não o número oficial da emenda.
"""
import csv
import json
import re
from decimal import Decimal
from pathlib import Path

from .pipeline import AMENDMENT_FIELDS, dump, normalize
from .sources import ROOT


def extract():
    import pdfplumber
    records, audits = [], []
    for file in sorted((ROOT / "data/raw/emendas").glob("*.pdf")):
        match = re.match(r"(202[0-2])_(Saude|ExcetoSaude|saude|outros)", file.name)
        if not match:
            continue
        year = int(match[1])
        sector = "saude" if match[2].lower() == "saude" else "outros"
        canonical = f"{year}_{'Saude' if sector == 'saude' else 'ExcetoSaude'}_30_01_25.pdf"
        url = "https://www.transparencia.sp.gov.br/EmendasImpositivas/" + canonical
        count = 0
        with pdfplumber.open(file) as doc:
            for page_number, page in enumerate(doc.pages, start=1):
                text = page.extract_text() or ""
                if "REINALDO ALGUZ" not in normalize(text):
                    continue
                updated = re.search(r"Atualizado at[eé]:\s*(\d{2})/(\d{2})/(\d{4})", text)
                asof = f"{updated[3]}-{updated[2]}-{updated[1]}" if updated else ""
                tables = page.extract_tables()
                if not tables:
                    raise ValueError(f"Texto de Reinaldo sem tabela extraível: {file.name}, página {page_number}")
                for table in tables:
                    for idx, cells in enumerate(table):
                        cells = [" ".join((c or "").split()) for c in cells]
                        if not cells or normalize(cells[0]) != "REINALDO ALGUZ":
                            continue
                        if len(cells) != 7:
                            raise ValueError(f"Tabela fora do formato: {file.name}, página {page_number}")
                        value = Decimal(cells[5].replace("R$", "").replace(".", "").replace(",", ".").strip())
                        record = {key: "" for key in AMENDMENT_FIELDS}
                        record.update(id=f"documental:{year}:{sector}:p{page_number}:r{idx}", person="reinaldo",
                                      sphere="estadual", exercise=str(year), uf="SP", municipality=cells[2],
                                      beneficiary=cells[1], purpose=cells[3], allocated_brl=str(value),
                                      status=cells[6], source=url + f"#page={page_number}", source_as_of=asof,
                                      coverage="Demonstrativo impositivo estadual; extração de tabela, revisão integral pendente")
                        records.append(record)
                        count += 1
        audits.append({"file": file.name, "source": url, "extracted_rows": count,
                       "allocated_brl": str(sum(Decimal(r["allocated_brl"]) for r in records if r["exercise"] == str(year) and f":{sector}:" in r["id"]))})
    if len({r["id"] for r in records}) != len(records):
        raise ValueError("Documentos repetidos: a mesma tabela está presente em mais de um arquivo")
    out = ROOT / "data/curated/emendas.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=AMENDMENT_FIELDS)
        writer.writeheader()
        writer.writerows(records)
    dump(ROOT / "data/curated/emendas_audit.json", audits)
    return {"records": len(records), "documents": audits}


if __name__ == "__main__":
    print(json.dumps(extract(), ensure_ascii=False), flush=True)
