# Validação da versão 0.1

## Votação

| Eleição | Linhas oficiais lidas | Votos Enrico | Votos Reinaldo | Conferências municipais |
|---|---:|---:|---:|---:|
| 2018 | 17.834.220 | 108.038 | 114.352 | 1.290, sem divergências |
| 2022 | 18.761.482 | 77.949 | 62.666 | 1.290, sem divergências |
| 2026 | 17.043.634 | 106.225 | 101.946 | 1.290, sem divergências |

As contagens foram extraídas dos ZIPs oficiais por seção de SP e confrontadas, município a município e candidato a candidato, com os arquivos oficiais de votação nominal por município e zona. O processamento dos membros ZIP verifica seu CRC. A auditoria guarda o SHA-256 dos arquivos por seção.

O site contém 602.114 registros candidato–seção, incluindo zeros observados, e 1.935 arquivos de detalhamento por município/ano. Os 645 municípios têm correspondência única entre código TSE e código IBGE. Não há comparação longitudinal automática entre seções de eleições distintas.

## Emendas

- 93 registros estaduais extraídos de seis demonstrativos de 2020–2022, com fonte e página.
- 94 registros federais de empenhos e pagamentos elegíveis, obtidos da exportação única da CGU. Autor resolvido: Enrico Misasi, código 3977.
- Pagamentos federais são filtrados por competência mensal e pelo exercício da emenda. Nenhum dia foi inventado para uma competência mensal.
- Os pagamentos estaduais sem data permanecem não identificados no indicador de execução em 2019–2022.
- A conferência manual integral dos demonstrativos estaduais, 2019 estadual e a autorização original federal permanecem pendentes.

## Código e limitações de revisão

Na versão 0.2.0, dez testes Python e sete testes Node passaram. Cobrem preservação de zeros e do recorte eleitoral, votos duplicados, ausência de base, classificação temporal dos pagamentos, correspondência municipal, exclusão de outras UFs e localidades múltiplas, separação entre principal e parcelas, ordenação numérica com ausentes, empates de postos, variáveis constantes e variações eleitorais sem base definida. A compilação dos módulos Python e a sintaxe de todos os arquivos JavaScript também foram conferidas.

A exportação independente foi comparada com o HTML da versão anterior no Git: votos, candidaturas, emendas, geografia e os 1.935 blocos de seções são idênticos. A nova agregação de recursos acrescenta 124 linhas de candidato/exercício/município e contadores de cobertura, sem substituir as bases originais. Os quatro módulos JavaScript e o CSS estão incorporados ao HTML, assim como os CSVs de download.

A publicação usa `docs/index.html` em https://dhx13.github.io/analise-eleitoral/. As alterações passam pela branch `feat/painel-emendas-correlacao`, por pull request e pelo workflow de verificações. O workflow de publicação é manual e usa `docs/`, sem refazer a coleta pesada. A revisão dos controles no site publicado acompanha o pull request; não há alegação de teste em dispositivos móveis físicos.
