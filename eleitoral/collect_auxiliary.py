"""Downloads complementares, restritos às fontes oficiais catalogadas."""
import json
import urllib.request
from .sources import ROOT, download
from .emendas_federais import SOURCE


def geography():
    urls = {
        "municipalities.json": "https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios",
        "municipalities.geojson": "https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio",
    }
    folder = ROOT / "data/geography"
    folder.mkdir(parents=True, exist_ok=True)
    for name, url in urls.items():
        with urllib.request.urlopen(url, timeout=60) as response:
            obj = json.load(response)
        (folder / name).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def amendments():
    folder = ROOT / "data/raw/emendas"
    folder.mkdir(parents=True, exist_ok=True)
    files = [download(SOURCE, folder / "federal_UNICO.zip")]
    for year in (2020, 2021, 2022):
        for sector in ("Saude", "ExcetoSaude"):
            # Reutiliza os nomes do cache da primeira coleta, sem duplicar tabelas.
            cached = [p for p in folder.glob(f"{year}_*.pdf")
                      if (("outros" in p.name.lower() or "excetosaude" in p.name.lower()) == (sector == "ExcetoSaude"))]
            if cached:
                files.append(cached[0])
                continue
            name = f"{year}_{sector}_30_01_25.pdf"
            url = "https://www.transparencia.sp.gov.br/EmendasImpositivas/" + name
            with urllib.request.urlopen(url, timeout=60) as response:
                content = response.read()
            if not content.startswith(b"%PDF-"):
                raise ValueError("A fonte estadual não retornou um PDF: " + url)
            target = folder / name
            target.write_bytes(content)
            files.append(target)
    return [str(p) for p in files]
