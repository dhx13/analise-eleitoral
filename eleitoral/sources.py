"""Catálogo oficial. Recursos são resolvidos pelo catálogo, não por URLs inferidas."""
import json
import time
import urllib.request
from pathlib import Path

YEARS = (2018, 2022, 2026)
ROOT = Path(__file__).resolve().parents[1]
API = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id="
PAGES = {
    "federal": "https://portaldatransparencia.gov.br/emendas",
    "federal_download": "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares",
    "sp": "https://www.transparencia.sp.gov.br/home/emendasparlamentares",
    "alesp": "https://www.al.sp.gov.br/leis/orcamento/emendas-impositivas/",
    "ibge": "https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/15774-malhas.html",
}


def metadata(family, year, refresh=False):
    path = ROOT / "data" / "metadata" / f"{family}-{year}.json"
    if refresh or not path.exists():
        with urllib.request.urlopen(API + f"{family}-{year}", timeout=60) as response:
            obj = json.load(response)
        if not obj.get("success"):
            raise ValueError("O catálogo TSE não retornou um conjunto válido")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    return json.loads(path.read_text(encoding="utf-8"))["result"]


def resource(family, year, name):
    found = [r for r in metadata(family, year)["resources"] if r["name"].strip() == name]
    if len(found) != 1:
        raise ValueError(f"Recurso ambíguo ou ausente: {family} {year} {name}")
    url = found[0]["url"]
    if not url.startswith("https://cdn.tse.jus.br/"):
        raise ValueError("URL de download não reconhecida como CDN oficial do TSE")
    return found[0]


def download(url, target):
    """Download com retomada, arquivo temporário e verificação do intervalo HTTP."""
    import zipfile
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        # A leitura integral posterior verifica também o CRC dos membros usados.
        with zipfile.ZipFile(target) as archive:
            if not archive.namelist():
                raise ValueError("ZIP vazio")
        return target
    part = target.with_suffix(target.suffix + ".part")
    last_error = None
    for attempt in range(5):
        start = part.stat().st_size if part.exists() else 0
        request = urllib.request.Request(url, headers={"Range": f"bytes={start}-"} if start else {})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                if start:
                    if response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {start}-"):
                        raise ValueError("Servidor não confirmou a retomada; preserve o .part e reinicie manualmente")
                expected = response.headers.get("Content-Length")
                read = 0
                with part.open("ab" if start else "wb") as output:
                    while block := response.read(4 * 1024 * 1024):
                        output.write(block)
                        read += len(block)
                if expected and read != int(expected):
                    raise OSError("Download incompleto")
            with zipfile.ZipFile(part) as archive:
                if not archive.namelist():
                    raise ValueError("ZIP vazio")
            part.replace(target)
            return target
        except (OSError, EOFError) as exc:
            last_error = exc
            time.sleep(min(attempt + 1, 4))
    raise RuntimeError(f"Não foi possível concluir {target.name}: {last_error}")


def acquire(year, kind):
    kinds = {
        "candidatos": ("candidatos", "Candidatos", f"candidatos_{year}.zip"),
        "votos": ("resultados", f"SP - Votação por seção eleitoral - {year}", f"votacao_secao_{year}_SP.zip"),
        "nominal": ("resultados", "Votação nominal por município e zona", f"nominal_{year}_SP.zip"),
    }
    family, name, filename = kinds[kind]
    source = resource(family, year, name)
    return download(source["url"], ROOT / "data" / "raw" / filename)
