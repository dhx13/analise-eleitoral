# Integração dos Censos 2010 e 2022

## Referência temporal

| Eleição | Censo utilizado | Interpretação |
|---|---|---|
| 2018 | 2010 | Perfil observado oito anos antes da eleição |
| 2022 | 2022 | Perfil censitário com coleta estendida a 2023; não é uma base integralmente disponível antes do pleito |
| 2026 | 2022 | Mantém o perfil de 2022; não estima valores socioeconômicos de 2026 |

O ano do censo aparece no perfil, mapa, gráfico, relatório e CSV. Não há interpolação temporal. O universo geográfico desta versão é o dos 645 municípios de São Paulo, com observações separadas em cada censo: 1.290 perfis. A UF tem dois perfis próprios, obtidos nas mesmas consultas oficiais.

## Indicadores e tabelas oficiais

| Indicador | Unidade / denominador | SIDRA 2010 | SIDRA 2022 |
|---|---|---|---|
| População residente | Pessoas | [1378](https://sidra.ibge.gov.br/tabela/1378) | [9514](https://sidra.ibge.gov.br/tabela/9514) |
| Mulheres | % da população residente | 1378 | 9514 |
| Pessoas de 65 anos ou mais | % da população residente | 1378 | 9514 |
| Alfabetização de 15 anos ou mais | % das pessoas de 15 anos ou mais | [1379](https://sidra.ibge.gov.br/tabela/1379) | [9542](https://sidra.ibge.gov.br/tabela/9542) |
| Renda domiciliar per capita média | Reais nominais por morador elegível, por mês | [3578](https://sidra.ibge.gov.br/tabela/3578) | [10295](https://sidra.ibge.gov.br/tabela/10295) |
| Renda domiciliar per capita mediana | Reais nominais por morador elegível, por mês | 3578 | 10295 |
| Água da rede geral como fonte principal | % dos domicílios particulares permanentes ocupados | [3218](https://sidra.ibge.gov.br/tabela/3218) | [6803](https://sidra.ibge.gov.br/tabela/6803) |
| Esgoto por rede geral ou pluvial | % dos domicílios particulares permanentes ocupados | [1394](https://sidra.ibge.gov.br/tabela/1394) | [6805](https://sidra.ibge.gov.br/tabela/6805) |
| Lixo coletado | % dos domicílios particulares permanentes ocupados | 3218 | [6892](https://sidra.ibge.gov.br/tabela/6892) |

**Renda:** inclui os moradores sem rendimento, mas exclui pensionistas, empregados domésticos e parentes de empregados domésticos, conforme as tabelas. Não corresponde ao rendimento médio apenas de trabalhadores ocupados, ao salário médio ou ao rendimento médio dos domicílios. Os dados são resultados da amostra; os de 2022 são preliminares, estimados com Áreas de Ponderação preliminares. A [apresentação oficial do IBGE sobre trabalho e rendimento](https://agenciadenoticias.ibge.gov.br/media/com_mediaibge/arquivos/53fde9c24f6d8df3108c83f6378e018f.pdf) identifica expressamente a tabela 10295 e esse estágio dos resultados.

Os valores monetários mantêm os preços de cada censo. Não são convertidos para preços de 2018/2026, não são deflacionados e não se calcula crescimento real de renda entre os censos. A mediana estadual vem do SIDRA: não se calcula mediana ou média das medianas municipais.

**Saneamento:** a fonte de água de 2022 seleciona quem possui ligação e usa a rede como fonte principal, em vez de somar todos os domicílios que possuem ligação. A categoria de esgoto de 2022 inclui explicitamente fossa séptica/filtro ligada à rede; a categoria de 2010 é rede geral de esgoto ou pluvial. A alteração de quesito impede tratar a diferença como uma medida perfeitamente homogênea de expansão da rede. Lixo coletado reúne coleta direta pelo serviço de limpeza e depósito em caçamba do serviço nos dois anos.

**Faixas etárias:** em 2010, 65+ soma 65–69 e 70+; em 2022 soma faixas quinquenais de 65–69 até 95–99 e 100+. A alfabetização de 2010 usa a soma de numeradores e denominadores das faixas não sobrepostas de 15–19 até 55–59, 60–69 e 70+. A de 2022 usa o total de 15+. Nenhuma taxa é obtida por média simples das taxas de faixas ou municípios.

## Importação e integridade

As 13 consultas usam a [API oficial de agregados do IBGE](https://servicodados.ibge.gov.br/api/docs/agregados?versao=3), com `N6[N3[35]]` para municípios e `N3[35]` para a UF. `data/census/sources.json` registra URL exata, tabela, variáveis, categorias, ano, data/hora da coleta e SHA-256 dos bytes originais descompactados. As respostas são preservadas em gzip, os metadados das 11 tabelas em JSON e o resultado normalizado em `data/census/indicators.json`.

O processamento confere os hashes antes de usar as respostas. Rejeita ano inesperado, localidades de outras UFs, células duplicadas ou ambíguas, numeradores maiores que denominadores e códigos sem correspondência. O símbolo SIDRA `-` preserva zero absoluto; `X`, `..` e `...` continuam sem valor. Uma faixa suprimida torna a soma indisponível, em vez de ser substituída por zero.

A ligação ao TSE usa o código IBGE de sete dígitos através da correspondência municipal já validada. O nome não é usado para juntar diretamente as novas tabelas censitárias. O código da UF `35` permanece distinto do município de São Paulo `3550308`.

Os nove indicadores têm cobertura dos 645 municípios nos dois censos. Os totais municipais de população, mulheres, 65+, alfabetização e domicílios foram reconciliados com os recortes oficiais estaduais, sem divergências. As contagens estimadas da amostra de renda não são usadas para exigir igualdade exata de somas municipais, pois são sujeitas a arredondamento/estimação.

## Uso analítico

O filtro de município seleciona o perfil e o relatório. O candidato não altera características censitárias. O mapa permite escolher qualquer um dos nove indicadores; a referência temporal acompanha a eleição. Percentuais usam escala de cor linear de 0 a 100%; população e renda usam escala logarítmica. Ausência teria cor própria, nunca a cor de zero.

O gráfico municipal cruza um indicador censitário com votos, participação, variação eleitoral desde 2018 ou recurso de emendas. Para emendas, preserva medidas e exercícios, usa somente localidades documentadas e mantém ausências fora da amostra, sem imputação. Cada município contribui com um par. O filtro municipal destaca um ponto e não altera os coeficientes estaduais. A associação não é ponderada por população. O valor estadual exibido é uma referência descritiva e não entra como ponto adicional.

Pearson, Spearman, escala visual e critérios para bases eleitorais zero continuam os da metodologia geral. Os CSVs registram o censo, os dois códigos municipais, variáveis e fontes. O gráfico e seus coeficientes usam os mesmos pares exportados.

Uma associação municipal não permite concluir que indivíduos com determinada renda, idade ou escolaridade votaram em um candidato. Locais de votação não delimitam setores censitários nem áreas de residência dos votantes. Esta versão não distribui perfis municipais por seções nem faz inferência causal sobre recursos ou votos. Comparações de censos não corrigem eventuais alterações territoriais internas do município.

## Atualização

`python -m eleitoral coletar-censos` atualiza explicitamente as consultas do manifesto. `python -m eleitoral site` recompõe os indicadores a partir dos recortes versionados e valida a ligação com o TSE. `python -m eleitoral.package --github-pages --no-archive` gera a publicação independente, incluindo o novo módulo e os downloads. A hospedagem não consulta a API do IBGE em tempo real.
