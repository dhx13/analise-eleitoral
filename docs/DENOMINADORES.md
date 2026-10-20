# Fichas eleitorais e denominadores

A ficha descritiva apresenta o recorte escolhido (candidato, eleição e município; ou todos os municípios de SP), sem avaliar ou classificar candidatos.

| Medida | Numerador | Denominador |
|---|---|---|
| Percentual nos votos válidos do cargo — principal | `QT_VOTOS_NOMINAIS_VALIDOS` do candidato | `QT_TOTAL_VOTOS_VALIDOS` do cargo |
| Percentual sobre eleitores aptos — complementar | `QT_VOTOS_NOMINAIS` do candidato | `QT_APTOS` do cargo |
| Quantidade absoluta | `QT_VOTOS_NOMINAIS` do candidato | Não se aplica |

Os votos válidos do cargo incluem os nominais válidos e os válidos de legenda. Anulados, anulados sub judice, brancos e nulos não são adicionados ao denominador de válidos. O total de aptos não é inferido do comparecimento. Votos nominais recebidos e votos nominais válidos são campos distintos: cada percentual preserva o numerador indicado na tabela. Ausência ou denominador zero produz indisponibilidade, nunca infinito nem zero presumido.

O campo legado `registered` representa votos registrados para o cargo, incluindo brancos e nulos; **não representa eleitores aptos**. Os módulos anteriores que usam esse campo continuam com seus rótulos de votos registrados. A ficha nova e os indicadores de abertura usam os denominadores oficiais novos. As bases novas são municipais e não são distribuídas proporcionalmente entre locais ou seções.

## Fontes e reprodução

As URLs são resolvidas pelo [catálogo oficial de resultados do TSE](https://dadosabertos.tse.jus.br/), nos conjuntos de 2018, 2022 e 2026. São usadas as exportações **Detalhe da apuração por município e zona** e **Votação nominal por município e zona**. Todas as URLs exatas, membros do ZIP, datas de extração dos recortes e hashes dos ZIPs originais estão em `data/electoral/sources.json`.

`python -m eleitoral.denominators` obtém/reutiliza o cache dos ZIPs oficiais e versiona recortes UTF-8 gzip de SP, primeiro turno, eleição e cargos das candidaturas. O nominal é restrito aos candidatos do projeto. Os recortes mantêm todas as colunas originais e a transformação de encoding/delimitador é documentada no código; não são os bytes do CSV original. Há hashes separados do ZIP original e do recorte descompactado. Atualizações do cache bruto devem ser feitas explicitamente.

Na geração, `municipal_denominators` verifica hashes, ano, UF, turno, duplicidade por zona/trânsito, valores negativos e a identidade **válidos = nominais válidos + legenda válida**. A ligação usa ano, eleição, cargo e código TSE do município; para o numerador, também o identificador oficial da candidatura. São exigidos totais municipais de votos registrados e nominais idênticos aos da exportação por seção já usada no painel. Uma divergência bloqueia a publicação; não é corrigida por aproximação.

Os 3.870 registros (duas candidaturas × três eleições × 645 municípios) reconciliaram sem divergências. Quando o mesmo cargo aparece para os dois candidatos, o total do cargo é aplicado separadamente a cada ficha; não é somado entre candidatos. Para todo o estado, o percentual é a razão entre as somas dos numeradores e denominadores municipais do recorte, não uma média de percentuais municipais.

O workflow de Pages incorpora os denominadores diretamente dos seis recortes versionados, sem rede ou pandas. Os demais dados, CSVs de origem e detalhes por seção do snapshot permanecem intactos. A ficha eleitoral possui seu próprio CSV, com denominadores e percentuais explícitos.
