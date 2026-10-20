"""Cria prévia independente e pacote de código, sem os ZIPs brutos."""
import base64
import gzip
import json
import re
import zipfile
import tomllib
from pathlib import Path
from .sources import ROOT


def package(github_pages=False, create_archive=True, from_snapshot=False):
    dist = ROOT / "dist"
    assets = ROOT / "web" if from_snapshot else dist
    downloads = {}
    if from_snapshot:
        snapshot = (ROOT / "docs/index.html").read_text(encoding="utf-8")
        match = re.search(r'<script id="embedded-data" type="application/json">(.*?)</script>', snapshot, re.S)
        if not match:
            raise ValueError("Snapshot sem os dados incorporados; gerar a exportação completa primeiro")
        payload = json.loads(match.group(1))
        data, geo, sections = payload["data"], payload["geo"], payload["sections"]
        downloads = {name: href for href, name in re.findall(
            r'href="(data:text/csv;base64,[^"]+)"\s+download="([^"]+)"', snapshot)}
    else:
        data = json.loads((dist / "data/dashboard.json").read_text(encoding="utf-8"))
        geo = json.loads((dist / "data/municipalities.geojson").read_text(encoding="utf-8"))
        sections = {}
        for file in (dist / "data/sections").glob("*/*.json"):
            key = file.parent.name + "/" + file.stem
            sections[key] = base64.b64encode(gzip.compress(file.read_bytes(), mtime=0)).decode("ascii")
    html = (assets / "index.html").read_text(encoding="utf-8")
    css = (assets / "style.css").read_text(encoding="utf-8")
    # Dados são JSON escapado. Endereços e demais textos nunca viram código.
    inline = json.dumps({"data": data, "geo": geo, "sections": sections}, ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("</", "<\\/")
    boot = f'<script id="embedded-data" type="application/json">{inline}</script><script>var payload=JSON.parse(document.getElementById("embedded-data").textContent);window.SNAPSHOT=payload.data;window.INLINE_GEO=payload.geo;window.INLINE_SECTIONS=payload.sections;</script>'
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="style\.css"\s*/?>',
                  lambda match: '<style>' + css + '</style>', html)
    # Preserva a ordem dos módulos e torna todos os scripts locais independentes.
    scripts = re.findall(r'<script src="([\w-]+\.js)"></script>', html)
    for index, name in enumerate(scripts):
        javascript = (assets / name).read_text(encoding="utf-8")
        html = html.replace(f'<script src="{name}"></script>',
                            (boot if index == 0 else "") + '<script>' + javascript + '</script>')
    # Exportação municipal também funciona ao abrir o HTML diretamente.
    for name in ("votos_municipios", "emendas", "censos_municipios"):
        pattern = rf'href="data/{name}\.csv"\s+download(?:="")?'
        if from_snapshot:
            href = downloads.get(name + ".csv")
            if href is None and re.search(pattern, html):
                raise ValueError("Download ausente no snapshot: " + name)
        else:
            csv = dist / "data" / (name + ".csv")
            if name == "votos_municipios" and not csv.exists():
                raise FileNotFoundError(csv)
            href = "data:text/csv;base64," + base64.b64encode(csv.read_bytes()).decode("ascii") if csv.exists() else None
        if href:
            html = re.sub(pattern, lambda match: f'href="{href}" download="{name}.csv"', html)
    preview = ROOT / "preview.html"
    preview.write_text(html, encoding="utf-8", newline="\n")
    if github_pages:
        # Pages recebe o mesmo painel completo, com os dados compactados no HTML.
        # Os arquivos por município continuam sendo gerados normalmente em dist/.
        (ROOT / "docs").mkdir(parents=True, exist_ok=True)
        (ROOT / "docs/index.html").write_text(html, encoding="utf-8", newline="\n")
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
    parser.add_argument("--from-snapshot", action="store_true", help="Recompor a interface atual com os dados e downloads já incorporados em docs/index.html")
    args = parser.parse_args()
    if args.archive_only:
        print(json.dumps({"archive": str(archive_project())}, ensure_ascii=False))
    else:
        print(json.dumps(package(github_pages=args.github_pages, create_archive=not args.no_archive,
                                 from_snapshot=args.from_snapshot), ensure_ascii=False))
