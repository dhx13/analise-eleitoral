import argparse
import json
from .sources import YEARS, acquire
from .pipeline import build, process_votes


def main():
    parser = argparse.ArgumentParser(description="Análise eleitoral — Misasi e Alguz")
    commands = parser.add_subparsers(dest="command", required=True)
    collect = commands.add_parser("coletar", help="Baixar os ZIPs oficiais com retomada")
    collect.add_argument("--anos", nargs="+", type=int, choices=YEARS, default=list(YEARS))
    collect.add_argument("--conferir", action="store_true", help="Baixar também a exportação por município/zona")
    process = commands.add_parser("processar", help="Filtrar e agregar votação em blocos")
    process.add_argument("--anos", nargs="+", type=int, choices=YEARS, default=list(YEARS))
    commands.add_parser("site", help="Gerar site estático em dist/")
    check = commands.add_parser("conferir", help="Reconciliar votos com a exportação municipal oficial")
    check.add_argument("--anos", nargs="+", type=int, choices=YEARS, default=list(YEARS))
    commands.add_parser("coletar-geografia", help="Obter malha e municípios oficiais do IBGE")
    commands.add_parser("coletar-emendas", help="Obter exportação federal e demonstrativos estaduais de 2020–2022")
    commands.add_parser("coletar-censos", help="Atualizar os recortes municipais oficiais dos Censos 2010 e 2022")
    args = parser.parse_args()
    if args.command == "coletar":
        for year in args.anos:
            for kind in (("candidatos", "votos", "nominal") if args.conferir else ("candidatos", "votos")):
                print(acquire(year, kind), flush=True)
    elif args.command == "processar":
        for year in args.anos:
            print(json.dumps(process_votes(year), ensure_ascii=False), flush=True)
    elif args.command == "conferir":
        from .reconcile import reconcile
        for year in args.anos:
            print(json.dumps(reconcile(year), ensure_ascii=False), flush=True)
    elif args.command == "coletar-geografia":
        from .collect_auxiliary import geography
        geography()
        print("Geografia importada")
    elif args.command == "coletar-emendas":
        from .collect_auxiliary import amendments
        print(json.dumps(amendments(), ensure_ascii=False))
    elif args.command == "coletar-censos":
        from .census import refresh
        print(json.dumps(refresh(), ensure_ascii=False))
    else:
        print(json.dumps(build(), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
