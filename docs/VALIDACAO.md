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

Quatro testes automatizados passaram, cobrindo preservação de zeros e do recorte eleitoral, bloqueio de votos duplicados, ausência de base e classificação temporal dos pagamentos (inclusive mês sem dia). A compilação dos módulos Python e a verificação de sintaxe do JavaScript passaram.

A revisão visual e dos controles no navegador não foi concluída. A prévia HTTP local não pôde ser acessada pelas restrições de rede do ambiente, e a política do navegador bloqueou o protocolo de arquivos locais. Não houve tentativa de contornar essa política. O HTML independente é entregue para revisão pelo usuário; não se afirma que o comportamento em desktop e celular foi validado visualmente.

A publicação no GitHub Pages ainda não foi executada. O repositório e seu nome serão definidos com o usuário. O workflow de publicação é manual e usa o resultado de `dist/`, sem refazer a coleta pesada durante a publicação.
