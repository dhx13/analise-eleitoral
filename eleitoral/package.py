"""Cria prévia independente e pacote de código, sem os ZIPs brutos."""
import base64
import gzip
import json
import re
import zipfile
import tomllib
from pathlib import Path
from .sources import ROOT


def package(github_pages=False, create_archive=True):
    dist = ROOT / "dist"
    html = (dist / "index.html").read_text(encoding="utf-8")
    data = json.loads((dist / "data/dashboard.json").read_text(encoding="utf-8"))
    geo = json.loads((dist / "data/municipalities.geojson").read_text(encoding="utf-8"))
    sections = {}
    for file in (dist / "data/sections").glob("*/*.json"):
        key = file.parent.name + "/" + file.stem
        sections[key] = base64.b64encode(gzip.compress(file.read_bytes(), mtime=0)).decode("ascii")
    css = (dist / "style.css").read_text(encoding="utf-8")
    # Dados são JSON escapado. Endereços e demais textos nunca viram código.
    inline = json.dumps({"data": data, "geo": geo, "sections": sections}, ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("</", "<\\/")
    boot = f'<script id="embedded-data" type="application/json">{inline}</script><script>var payload=JSON.parse(document.getElementById("embedded-data").textContent);window.SNAPSHOT=payload.data;window.INLINE_GEO=payload.geo;window.INLINE_SECTIONS=payload.sections;</script>'
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="style\.css"\s*/?>',
                  lambda match: '<style>' + css + '</style>', html)
    # Preserva a ordem dos módulos e torna todos os scripts locais independentes.
    scripts = re.findall(r'<script src="([\w-]+\.js)"></script>', html)
    for index, name in enumerate(scripts):
        javascript = (dist / name).read_text(encoding="utf-8")
        html = html.replace(f'<script src="{name}"></script>',
                            (boot if index == 0 else "") + '<script>' + javascript + '</script>')
    # Exportação municipal também funciona ao abrir o HTML diretamente.
    municipal = (dist / "data/votos_municipios.csv").read_bytes()
    href = "data:text/csv;base64," + base64.b64encode(municipal).decode("ascii")
    html = re.sub(r'href="data/votos_municipios\.csv"\s+download(?:="")?',
                  lambda match: 'href="' + href + '" download="votos_municipios.csv"', html)
    emendas = dist / "data/emendas.csv"
    if emendas.exists():
        href = "data:text/csv;base64," + base64.b64encode(emendas.read_bytes()).decode("ascii")
        html = re.sub(r'href="data/emendas\.csv"\s+download(?:="")?',
                      lambda match: 'href="' + href + '" download="emendas.csv"', html)
    preview = ROOT / "preview.html"
    preview.write_text(html, encoding="utf-8")
    if github_pages:
        # Pages recebe o mesmo painel completo, com os dados compactados no HTML.
        # Os arquivos por município continuam sendo gerados normalmente em dist/.
        (ROOT / "docs").mkdir(parents=True, exist_ok=True)
        (ROOT / "docs/index.html").write_text(html, encoding="utf-8")
        (ROOT / "docs/.nojekyll").touch()
    archive = archive_project() if create_archive else None
    return {"preview": str(preview), "archive": str(archive) if archive else None,
            "size_bytes": archive.stat().st_size if archive else 0}


def archive_project():
    version = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
    archive = ROOT.parent / f"analise-eleitoral-v{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for file in ROOT.rglob("*"):
            if not file.is_file():
                continue
            rel = file.relative_to(ROOT)
            if any(p in {"__pycache__", ".venv", ".git", "tmp"} for p in rel.parts):
                continue
            if rel.parts[:2] == ("data", "raw") or rel.name == "federal-download.html":
                continue
            output.write(file, "analise-eleitoral/" + rel.as_posix())
    return archive


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-only", action="store_true", help="Empacotar arquivos já gerados")
    parser.add_argument("--github-pages", action="store_true", help="Exportar painel completo para docs/index.html")
    parser.add_argument("--no-archive", action="store_true", help="Gerar os HTMLs sem criar outro ZIP")
    args = parser.parse_args()
    if args.archive_only:
        print(json.dumps({"archive": str(archive_project())}, ensure_ascii=False))
    else:
        print(json.dumps(package(github_pages=args.github_pages, create_archive=not args.no_archive), ensure_ascii=False))
