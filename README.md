# Território do voto

Projeto em Python e site estático sobre a votação de **Enrico Misasi** e **Reinaldo Alguz** em São Paulo, em **2018, 2022 e 2026**, com emendas dos exercícios de **2019 a 2022**.

## Decisões do projeto

- Granularidade: estado, município, zona, local e seção eleitoral.
- Produtos: painel interativo e relatório explicativo.
- Emendas: valores destinados e valores efetivamente pagos no período, separados.
- Hospedagem: [GitHub Pages](https://dhx13.github.io/analise-eleitoral/). Não há servidor Python na hospedagem.
- Dados ausentes, cobertura parcial e pagamento sem data são identificados explicitamente.

## Executar

Python 3.11 ou superior:

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
python -m pip install -e .
python -m eleitoral coletar --anos 2018 2022 2026
python -m eleitoral coletar-geografia
python -m eleitoral processar --anos 2018 2022 2026
python -m eleitoral site
python -m http.server 8000 --directory dist
```

Abra http://localhost:8000. Os ZIPs de votação de SP têm aproximadamente 0,5 a 0,9 GB por ano; o processamento lê em blocos, sem descompactar o arquivo inteiro no disco. O cadastro e o arquivo por seção são obtidos pelos links do catálogo oficial do TSE. Downloads novos usam arquivos `.part` e retomada HTTP.

O pacote para download contém o resultado do processamento em `dist/`. No repositório, `docs/index.html` é o painel completo, com os dados por seção compactados no próprio HTML. `preview.html`, gerado localmente, permite abrir a mesma versão sem servidor. Os ZIPs brutos são grandes e não integram a entrega; podem ser obtidos novamente com `coletar`.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `eleitoral/` | Coleta, identificação de candidaturas, processamento, emendas e geração |
| `web/` | HTML, CSS e JavaScript do site, sem frameworks ou dependências externas |
| `data/metadata/` | Metadados oficiais do TSE usados para resolver os downloads |
| `data/curated/` | Registros de emendas com referência documental |
| `data/geography/` | Malha e municípios de SP do IBGE |
| `data/raw/` | Cache local de fontes; ignorado pelo Git |
| `data/processed/` | Resultados intermediários; ignorados pelo Git |
| `dist/` | Site gerado e dados de seções separados por município |
| `docs/` | Painel publicado, fontes, cobertura e decisões analíticas |
| `tests/` | Integridade de chaves, zeros, eleição e período dos pagamentos |

## Fontes

- TSE: https://dadosabertos.tse.jus.br/ — resultados, candidaturas e eleitorado.
- Portal federal: https://portaldatransparencia.gov.br/emendas
- SP: https://www.transparencia.sp.gov.br/home/emendasparlamentares
- Alesp: https://www.al.sp.gov.br/leis/orcamento/emendas-impositivas/
- IBGE: https://servicodados.ibge.gov.br/api/docs/malhas?versao=3

Leia `docs/METODOLOGIA.md` e a aba **Fontes e método** antes de interpretar indicadores. A base federal está importada com empenhos e pagamentos mensais. A cobertura estadual permanece parcial: falta 2019 e a comprovação das datas dos pagamentos. Uma situação “PAGA” de janeiro de 2025 não prova pagamento até dezembro de 2022. O valor empenhado federal não é o valor autorizado original.

Para atualizar emendas e conferir a votação com uma segunda exportação oficial:

```sh
python -m pip install -e ".[pdf]"
python -m eleitoral coletar-emendas
python -m eleitoral.emendas_sp
python -m eleitoral.emendas_federais
python -m eleitoral coletar --conferir
python -m eleitoral conferir
python -m eleitoral site
python -m eleitoral.package
```

A conferência lê a exportação por município e zona e compara os 645 municípios para cada candidato, ano a ano. O download nacional de conferência acrescenta arquivos grandes ao cache. O pacote inicial já traz os dados normalizados e o site, sem exigir nova coleta para visualização.

## GitHub Pages

1. Repositório: https://github.com/dhx13/analise-eleitoral.
2. Na configuração de Pages, selecione **GitHub Actions** como origem.
3. Execute manualmente o workflow **Publicar GitHub Pages**. Ele publica a pasta `docs/` incluída no repositório. Não baixa gigabytes de dados a cada publicação.
4. Para atualizar os dados, rode a coleta e o processamento localmente, gere `dist/` e execute `python -m eleitoral.package --github-pages`. Envie `docs/index.html` e os arquivos de código ou dados alterados; execute novamente o workflow.

`dist/` e `preview.html` são exportações locais. A publicação usa `docs/index.html`, que contém o mapa, as três eleições e todos os detalhes por seção. A versão compactada evita manter milhares de arquivos de seções no histórico do Git. É necessário um navegador atual com suporte a `DecompressionStream` para abrir os detalhes.

## Validação

```sh
python -m unittest discover -s tests -v
python -m compileall -q eleitoral
```

Os totais por município das três eleições foram reconciliados com a exportação oficial por município e zona: **3.870 comparações candidato–município, sem divergências**. A auditoria por ano guarda essa conferência e o SHA-256 do ZIP original por seção.
