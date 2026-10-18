"""Cria prévia independente e pacote de código, sem os ZIPs brutos."""
import base64
import gzip
import json
import re
import zipfile
from pathlib import Path
from .sources import ROOT


def package(github_pages=False):
    dist = ROOT / "dist"
    html = (dist / "index.html").read_text(encoding="utf-8")
    data = json.loads((dist / "data/dashboard.json").read_text(encoding="utf-8"))
    geo = json.loads((dist / "data/municipalities.geojson").read_text(encoding="utf-8"))
    sections = {}
    for file in (dist / "data/sections").glob("*/*.json"):
        key = file.parent.name + "/" + file.stem
        sections[key] = base64.b64encode(gzip.compress(file.read_bytes(), mtime=0)).decode("ascii")
    css = (dist / "style.css").read_text(encoding="utf-8")
    js = (dist / "app.js").read_text(encoding="utf-8")
    # Dados são JSON escapado. Endereços e demais textos nunca viram código.
    inline = json.dumps({"data": data, "geo": geo, "sections": sections}, ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("</", "<\\/")
    boot = f'<script id="embedded-data" type="application/json">{inline}</script><script>var payload=JSON.parse(document.getElementById("embedded-data").textContent);window.SNAPSHOT=payload.data;window.INLINE_GEO=payload.geo;window.INLINE_SECTIONS=payload.sections;</script>'
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
    html = html.replace('<script src="app.js"></script>', boot + '<script>' + js + '</script>')
    # Exportação municipal também funciona ao abrir o HTML diretamente.
    municipal = (dist / "data/votos_municipios.csv").read_bytes()
    href = "data:text/csv;base64," + base64.b64encode(municipal).decode("ascii")
    html = html.replace('href="data/votos_municipios.csv" download', 'href="' + href + '" download="votos_municipios.csv"')
    emendas = dist / "data/emendas.csv"
    if emendas.exists():
        href = "data:text/csv;base64," + base64.b64encode(emendas.read_bytes()).decode("ascii")
        html = html.replace('href="data/emendas.csv" download', 'href="' + href + '" download="emendas.csv"')
    preview = ROOT / "preview.html"
    preview.write_text(html, encoding="utf-8")
    if github_pages:
        # Pages recebe o mesmo painel completo, com os dados compactados no HTML.
        # Os arquivos por município continuam sendo gerados normalmente em dist/.
        (ROOT / "docs/index.html").write_text(html, encoding="utf-8")
        (ROOT / "docs/.nojekyll").touch()
    archive = archive_project()
    return {"preview": str(preview), "archive": str(archive), "size_bytes": archive.stat().st_size}


def archive_project():
    archive = ROOT.parent / "analise-eleitoral-v0.1.zip"
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
    args = parser.parse_args()
    if args.archive_only:
        print(json.dumps({"archive": str(archive_project())}, ensure_ascii=False))
    else:
        print(json.dumps(package(github_pages=args.github_pages), ensure_ascii=False))
