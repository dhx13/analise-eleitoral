# Alterações

## 0.3.1

- Fichas descritivas com percentual nos votos válidos como principal e percentual sobre eleitores aptos como complemento, sempre com numerador, denominador e fonte.
- Seis recortes oficiais do TSE versionados, SHA-256 e reconciliação dos 3.870 registros municipais; votos válidos nominais e de legenda tratados separadamente.
- Perfil dos nove indicadores do IBGE com referência oficial de SP e mediana municipal, também no relatório.
- Histograma por indicador, seleção municipal destacada e base estadual preservada na tabela e nos CSVs.

## 0.3.0

- Importa os Censos 2010 e 2022 do IBGE/SIDRA: nove indicadores nos 645 municípios de SP e estatísticas estaduais oficiais.
- Associa 2018 ao Censo 2010 e 2022/2026 ao Censo 2022; preserva ano, unidade, fonte, denominadores e ausência de dados.
- Integra perfil, mapa temático, relatório, comparação com votos ou emendas e CSVs com códigos das duas instituições.
- Versiona 13 respostas oficiais compactadas e metadados, com SHA-256 e atualização explícita em Python.
- Acrescenta testes de integridade censitária, reconciliação estadual, referência temporal e cruzamento por código IBGE.

## 0.2.0

- Seções da página inicial podem ser recolhidas individualmente ou em conjunto. O navegador guarda a escolha; selecionar um município no mapa abre o detalhamento eleitoral.
- Ordenação de emendas pelos cabeçalhos e por 14 campos, em ambas as direções. Valores ausentes ficam no fim; a tabela mostra 20 registros por página.
- Comparação municipal de recursos com votos nominais, participação e variações desde 2018. Gráfico, Pearson, Spearman, cobertura explícita e download dos pares usados.
- Agregação territorial de recursos em Python e cálculos de interação isolados em funções puras JavaScript. Formatação consistente do código da interface.
- Verificações automáticas em pull requests: testes Python e Node, compilação e sintaxe JavaScript.

As fontes brutas e os votos não foram alterados. A comparação é exploratória e mantém as lacunas documentais da versão anterior.
