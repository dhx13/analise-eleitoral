# Escopo e metodologia

## Identificação de candidaturas

O nome civil resolve a pessoa no cadastro oficial da eleição. A votação é ligada por `SQ_CANDIDATO`, cargo, eleição e turno. O mesmo número de urna pode identificar pessoas distintas em eleições diferentes.

| Pessoa | 2018 | 2022 | 2026 |
|---|---|---|---|
| Enrico Misasi | Deputado federal, PV, 4336 | Deputado federal, MDB, 1536 | Deputado federal, MDB, 1536 |
| Reinaldo Alguz | Deputado estadual, PV, 43363 | Deputado federal, União, 4436 | Deputado estadual, MDB, 15363 |

Essas identidades foram conferidas nos CSVs de candidatos de SP dos três pleitos. O programa revalida a identidade em cada execução, em vez de confiar somente nesta tabela.

## Votos, seções e locais

- Fonte primária: votação por seção de SP, primeiro turno e eleição ordinária identificada no cadastro.
- Chave: ano, eleição, turno, código TSE do município, zona, seção e cargo.
- Votos absolutos vêm de `QT_VOTOS` para a candidatura identificada.
- Seções sem voto para o candidato são mantidas quando há registros do cargo na seção.
- Local e endereço vêm da própria base por seção. O código do local só é interpretado junto ao município, zona e eleição.
- A soma de todos os votos registrados para o cargo é usada em **% registrados**. Inclui brancos e nulos. Não equivale a votos válidos ou a percentual sobre eleitores aptos.
- Toda situação judicial e a classificação completa dos votos válidos exigem fonte própria de apuração. Não se usa um filtro informal de números de urna como substituto.
- Seções agregadas, mudanças de zona, transferências e mudanças de endereço exigem um vínculo longitudinal documentado. Esta versão compara eleições por município e exibe cada seção dentro de sua própria eleição.

## Geografia

A malha vem da API de malhas do IBGE e representa a versão disponibilizada na coleta. O vínculo dos códigos TSE com IBGE é feito por nome municipal normalizado e UF SP. Os códigos originais são preservados. Lacunas de vínculo são contabilizadas; uma validação completa exige 645 correspondências distintas, sem colisões.

A pontuação dos nomes é normalizada (por exemplo, `D OESTE` e `d'Oeste`). A diferença explícita `SÃO LUÍS DO PARAITINGA` no TSE e `São Luiz do Paraitinga` no IBGE é registrada no código. Não se aplica correspondência aproximada automática. A geração do mapa falha se restar município sem vínculo ou se houver colisão de códigos.

O mapa é municipal. Endereços eleitorais são apresentados em texto; não há coordenadas inferidas de um centroide nem associação de local de votação a bairro de residência.

## Emendas

O mandato decorrente da eleição de 2018 corresponde, para o recorte orçamentário acordado, aos exercícios de 2019, 2020, 2021 e 2022. Enrico é acompanhado na esfera federal e Reinaldo na estadual.

Cada registro guarda exercício, município/beneficiário, objeto, valor destinado, valor pago, data de pagamento, situação documental, fonte e data de atualização. A soma de pagamentos de documentos deve ser consolidada antes da importação canônica; não se somam novamente os valores totais da emenda com as mesmas parcelas.

O indicador de execução no período exige valor e data entre 2019-01-01 e 2022-12-31, ou competência mensal entre 2019-01 e 2022-12. O campo `Ano/Mês` da CGU é preservado como mês, sem inventar um dia de pagamento. Um registro “PAGA” em fonte posterior, sem data/valor detalhado, fica com pagamento no período **não identificado**, e não zero.

A exportação federal “Por Emenda” informa valor empenhado, liquidado e pago na posição da base, além de restos a pagar. O projeto não trata o empenho como valor autorizado. A exportação “Por Favorecido” oferece a competência mensal e o valor recebido; é essa série que filtra os pagamentos ocorridos em 2019–2022. Somam-se apenas registros mensais, sem somar novamente os pagamentos acumulados da tabela por emenda. A autoria identificada de Enrico nessa base é `3977`, uma chave distinta do identificador da Câmara e da candidatura no TSE.

O município da fonte federal por emenda pode ser “Múltiplo”; ele não é repartido artificialmente entre cidades. O município do favorecido é apresentado como tal, sem convertê-lo automaticamente em local de aplicação. A UF é mantida para não associar municípios homônimos de estados diferentes. Valores empenhados são a posição acumulada de emendas dos exercícios do recorte, e não uma série de empenhos com data limitada a 2022.

Emendas individuais, coletivas e eventuais indicações informais não são misturadas. Toda atribuição de emenda coletiva depende de vínculo oficial. O município do beneficiário não é automaticamente o local de aplicação; onde não houver essa confirmação, a análise se refere à destinação documental.

Os arquivos estaduais de 2020–2022 são demonstrativos de emendas impositivas. Não comprovam cobertura de toda forma de destinação parlamentar. Emendas apresentadas pela Alesp e execução do Executivo são etapas distintas e exigem conciliação. A fonte estadual de 2019 respondeu HTTP 503 na coleta desta versão e permanece pendente, assim como o valor autorizado original federal e o detalhamento histórico dos pagamentos estaduais.

## Análises

- Evolução de votos absolutos e participação nos votos registrados para o cargo.
- Concentração municipal: participação dos maiores municípios nos votos do próprio candidato em SP.
- Distribuição de votos por zona, local e seção dentro de cada pleito.
- Destinações e pagamentos documentados por município e beneficiário, com sua cobertura.
- Associação exploratória entre recursos e votação no subconjunto municipal documentado, com cobertura e exclusões explícitas; sem interpretação causal e sem imputar recursos a seções por proximidade.

## Comparação municipal de recursos e votação

A versão 0.2 permite comparar a base parcial, sem tratá-la como cobertura completa. A agregação em Python usa município explícito, nome normalizado e UF SP. Para cada candidato e exercício, cada medida permanece separada: destinação estadual, empenho federal acumulado e pagamento ocorrido no período. Valores ausentes permanecem nulos; um zero só entra se estiver documentado na fonte. Parcelas de pagamento não repetem o valor principal da emenda. O painel conta e soma os registros excluídos por município não identificado ou fora de SP.

O conjunto de comparação contém os municípios com recurso documentado na medida e nos exercícios selecionados, além de indicador eleitoral definido na eleição escolhida. Os municípios com recurso, mas sem indicador definido, também são contados como exclusões. O filtro municipal destaca um ponto sem alterar a amostra estadual. O CSV contém exatamente os pares usados no gráfico e nos coeficientes, os filtros e as duas variáveis originais.

Os indicadores disponíveis são votos nominais; participação nos votos registrados para o cargo; variação percentual dos votos desde 2018; e variação da participação em pontos percentuais desde 2018. A variação percentual não é definida com votos zero em 2018, e a variação de participação exige denominadores positivos nos dois anos. Não se calcula variação de 2018 em relação a ele mesmo. Mudanças de cargo são sinalizadas, em especial para Reinaldo em 2022.

Pearson é calculado pela covariância centrada dividida pelo produto das normas centradas. Spearman é o Pearson das posições, com posições médias nos empates. O projeto exige pelo menos três pares para exibir coeficientes; variáveis constantes e dados insuficientes retornam “Não calculável”. Não são calculados valores-p, intervalos de confiança, regressões causais ou estimativas de efeito. A escala logarítmica altera apenas o gráfico; os coeficientes continuam usando valores originais. Referências de definição: [Pearson](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html) e [Spearman](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html), documentação SciPy.

As associações podem refletir porte municipal, composição da amostra documentada e outros fatores. Recursos para hospitais podem atender vários municípios. O município do favorecido de um pagamento federal não prova município de aplicação. O empenho é a posição acumulada da fonte, e não uma execução datada até 2022. O pleito de 2018 antecede as emendas; exercícios e pagamentos de 2022 podem incluir datas posteriores ao pleito. A comparação com 2026 também não controla eventos posteriores ao mandato analisado.

## Próximas decisões com o usuário

- Conta e repositório para publicação no GitHub Pages.
- Preferência visual após revisar o protótipo.
- Interesse em mapas de pontos dos locais, se houver coordenadas oficiais ou geocodificação verificada.
- Profundidade das análises estatísticas após completar e reconciliar as emendas.
