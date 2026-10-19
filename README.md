# Território do voto

Projeto em Python e site estático sobre a votação de **Enrico Misasi** e **Reinaldo Alguz** em São Paulo, em **2018, 2022 e 2026**, com emendas dos exercícios de **2019 a 2022**.

## Decisões do projeto

- Granularidade: estado, município, zona, local e seção eleitoral.
- Produtos: painel interativo e relatório explicativo.
- Perfil socioeconômico: Censo 2010 para 2018; Censo 2022 para 2022 e 2026, por município.
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
| `data/census/` | Recortes SIDRA compactados, metadados, consultas, SHA-256 e indicadores dos dois censos |
| `data/geography/` | Malha e municípios de SP do IBGE |
| `data/raw/` | Cache local de fontes; ignorado pelo Git |
| `data/processed/` | Resultados intermediários; ignorados pelo Git |
| `dist/` | Site gerado e dados de seções separados por município |
| `docs/` | Painel publicado, fontes, cobertura e decisões analíticas |
| `tests/` | Integridade de chaves, zeros, eleição e período dos pagamentos |

## Explorar o painel

Cada seção possui **Expandir / Recolher**. **Recolher todas** compacta a página; as escolhas ficam salvas apenas no navegador. O mapa abre automaticamente os locais e seções do município escolhido.

Nas emendas, os títulos das colunas ordenam a tabela. O seletor **Ordenar emendas por** também permite ordenar por beneficiário, código, tipo, situação, competência ou atualização da fonte. Campos numéricos são comparados como números; valores ausentes permanecem ao final em ambas as direções. A ordenação abrange todos os registros do recorte, antes da paginação.

**Emendas, censo e votação por município** cruza os recursos documentados com a eleição e o candidato selecionados. Escolha a medida de recurso, os exercícios e o indicador eleitoral. O gráfico, os coeficientes e o CSV usam os mesmos pares elegíveis de SP. O filtro municipal destaca uma observação e mantém a comparação estadual. Localidades múltiplas e municípios sem valor documentado não recebem zeros artificiais. A destinação estadual, o empenho federal e o pagamento continuam separados. Consulte a metodologia sobre temporalidade, porte municipal e mudanças de cargo antes de interpretar as associações.

## Censos do IBGE

O painel inclui nove indicadores para os 645 municípios nos dois censos: população, mulheres, pessoas de 65 anos ou mais, alfabetização de 15 anos ou mais, renda domiciliar per capita média e mediana, água da rede como fonte principal, esgoto por rede geral/pluvial e coleta de lixo. A escolha da eleição determina o censo: **2018 → 2010; 2022 e 2026 → 2022**, sem interpolar valores de 2026.

O perfil acompanha o município e aparece também no relatório. O mapa pode ser colorido por qualquer indicador. Na comparação municipal, escolha um indicador do censo na variável horizontal e compare-o com votação, participação ou recursos de emendas. O CSV usa exatamente os pares dos coeficientes, com código IBGE e ano censitário. Os valores estaduais são os do recorte oficial da UF, nunca médias das taxas municipais.

As respostas oficiais do SIDRA são versionadas em `data/census/sidra/`. A reconstrução valida SHA-256, geografia, ano, denominadores e correspondência municipal. Para atualizar explicitamente os recortes oficiais:

```sh
python -m eleitoral coletar-censos
python -m eleitoral site
python -m eleitoral.package --github-pages --no-archive
```

A renda é **nominal em reais do respectivo censo**, sem correção pela inflação, e vem dos resultados da amostra (preliminares em 2022). Não se calcula crescimento real entre censos. Alterações nos quesitos de saneamento limitam comparações diretas; a definição de cada indicador e as tabelas estão em Fontes e método. Um perfil municipal não identifica características ou escolhas de indivíduos em uma seção eleitoral.

## Fontes

- TSE: https://dadosabertos.tse.jus.br/ — resultados, candidaturas e eleitorado.
- Portal federal: https://portaldatransparencia.gov.br/emendas
- SP: https://www.transparencia.sp.gov.br/home/emendasparlamentares
- Alesp: https://www.al.sp.gov.br/leis/orcamento/emendas-impositivas/
- IBGE / malhas: https://servicodados.ibge.gov.br/api/docs/malhas?versao=3
- IBGE / SIDRA: https://servicodados.ibge.gov.br/api/docs/agregados?versao=3

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
node --test tests/analytics.test.cjs
python -m compileall -q eleitoral
```

Os totais por município das três eleições foram reconciliados com a exportação oficial por município e zona: **3.870 comparações candidato–município, sem divergências**. A auditoria por ano guarda essa conferência e o SHA-256 do ZIP original por seção.

## Desenvolvimento e Git

Crie uma branch a partir de `main`, mantenha alterações relacionadas em commits focados e abra um pull request. O workflow **Verificar código e análise** executa os testes e verifica sintaxe. Após as verificações, integre a branch e publique pelo workflow de Pages. O workflow de publicação é manual, evitando publicar cada commit intermediário.

Os módulos `web/analytics.js` (funções puras), `web/features.js` (ordenação e comparação) e `web/panels.js` (recolhimento) têm responsabilidades separadas. A agregação de recursos é feita em `eleitoral/correlation.py`. O código da interface foi formatado com Prettier 3.9.10. `.editorconfig` e `.gitattributes` padronizam codificação e finais de linha.

Para gerar apenas a página de publicação, sem produzir outro ZIP: `python -m eleitoral.package --github-pages --no-archive`. A versão gerada em `docs/index.html` deve acompanhar as alterações de código no pull request. Os ZIPs brutos do TSE continuam fora do Git; os pequenos recortes oficiais do SIDRA são versionados para reconstrução sem rede.
