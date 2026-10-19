const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../web/analytics.js");

const census = {
  election_census: { 2018: 2010, 2022: 2022, 2026: 2022 },
  indicators: { income: { unit: "brl" } },
  states: [
    { census_year: 2010, ibge_id: "35", income: 90 },
    { census_year: 2022, ibge_id: "35", income: 180 },
  ],
  rows: [
    { census_year: 2010, ibge_id: "3500001", income: 10 },
    { census_year: 2022, ibge_id: "3500001", income: 20 },
    { census_year: 2022, ibge_id: "3500002", income: 0 },
    { census_year: 2022, ibge_id: "3500003", income: null },
  ],
};

test("censo segue a eleição e o dado de 2026 mantém referência em 2022", () => {
  assert.equal(A.censusYear(census, 2018), 2010);
  assert.equal(A.censusYear(census, 2022), 2022);
  assert.equal(A.censusYear(census, 2026), 2022);
  assert.equal(A.censusYear(census, 2020), null);
  assert.equal(A.censusProfile(census, 2018, "3500001").income, 10);
  assert.equal(A.censusProfile(census, 2026, "3500001").income, 20);
  assert.equal(A.censusProfile(census, 2022).income, 180);
  assert.equal(A.censusProfile(census, 2022, "9999999"), null);
});

test("cruza censo por código IBGE, preserva zero e exclui ausências", () => {
  const votes = [1, 2, 3, 4].map((id) => ({
    person: "enrico",
    year: 2022,
    municipality_id: String(id),
    votes: id,
    registered: 10,
  }));
  const crosswalk = { 1: "3500001", 2: "3500002", 3: "3500003", 4: "3500004" };
  const result = A.censusComparisonRows(votes, [], census, crosswalk, {
    person: "enrico",
    year: 2022,
    censusIndicator: "income",
    metric: "share",
  });
  assert.deepEqual(
    result.map((r) => [
      r.municipality_id,
      r.comparison_value,
      r.electoral_value,
    ]),
    [
      ["1", 20, 10],
      ["2", 0, 20],
    ],
  );
  assert.equal(result[0].census_year, 2022);
  assert.deepEqual(
    A.censusComparisonRows(
      votes,
      [],
      census,
      {},
      {
        person: "enrico",
        year: 2022,
        censusIndicator: "income",
        metric: "share",
      },
    ),
    [],
  );
});

test("censo com emendas usa apenas recursos documentados no período escolhido", () => {
  const votes = [1, 2].map((id) => ({
    person: "enrico",
    year: 2022,
    municipality_id: String(id),
    votes: 10,
    registered: 100,
  }));
  const resources = [
    {
      person: "enrico",
      exercise: 2020,
      municipality_id: "1",
      committed_brl: 10,
      committed_brl_records: 1,
    },
    {
      person: "enrico",
      exercise: 2021,
      municipality_id: "1",
      committed_brl: 20,
      committed_brl_records: 1,
    },
    {
      person: "enrico",
      exercise: 2020,
      municipality_id: "2",
      committed_brl: null,
      committed_brl_records: 0,
    },
  ];
  const options = {
    person: "enrico",
    year: 2022,
    censusIndicator: "income",
    metric: "amendments",
    amendmentMeasure: "committed_brl",
    start: 2020,
    end: 2020,
  };
  const result = A.censusComparisonRows(
    votes,
    resources,
    census,
    { 1: "3500001", 2: "3500002" },
    options,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].comparison_value, 20);
  assert.equal(result[0].electoral_value, 10);
  assert.equal(result[0].records, 1);
  assert.deepEqual(
    A.censusComparisonRows(
      votes,
      resources,
      census,
      { 1: "3500001" },
      { ...options, start: 2022, end: 2020 },
    ),
    [],
  );
});

test("variações com censo preservam a base eleitoral e rejeitam 2018 contra si mesmo", () => {
  const votes = [
    {
      person: "enrico",
      year: 2018,
      municipality_id: "1",
      votes: 10,
      registered: 100,
    },
    {
      person: "enrico",
      year: 2022,
      municipality_id: "1",
      votes: 20,
      registered: 100,
    },
    {
      person: "enrico",
      year: 2018,
      municipality_id: "2",
      votes: 0,
      registered: 100,
    },
    {
      person: "enrico",
      year: 2022,
      municipality_id: "2",
      votes: 20,
      registered: 100,
    },
  ];
  const options = {
    person: "enrico",
    year: 2022,
    censusIndicator: "income",
    metric: "growth",
  };
  const result = A.censusComparisonRows(
    votes,
    [],
    census,
    { 1: "3500001", 2: "3500002" },
    options,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].electoral_value, 100);
  assert.equal(result[0].comparison_value, 20);
  assert.deepEqual(
    A.censusComparisonRows(
      votes,
      [],
      census,
      { 1: "3500001" },
      { ...options, year: 2018 },
    ),
    [],
  );
});

test("ordena valores numéricos e preserva ausentes no fim nas duas direções", () => {
  const rows = [null, 20, 3, 0].map((value, id) => ({
    id,
    committed_brl: value,
    allocated_brl: null,
  }));
  assert.deepEqual(
    A.sortAmendments(rows, "resource_value").map((r) => r.id),
    [3, 2, 1, 0],
  );
  assert.deepEqual(
    A.sortAmendments(rows, "resource_value", "desc").map((r) => r.id),
    [1, 2, 3, 0],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [0, 1, 2, 3],
  );
});

test("ordenação por texto e exercício é estável e usa ordem portuguesa", () => {
  const rows = [
    { id: 1, municipality: "Bauru", exercise: 2022 },
    { id: 2, municipality: "Águaí", exercise: 2019 },
    { id: 3, municipality: "Águaí", exercise: 2020 },
  ];
  assert.deepEqual(
    A.sortAmendments(rows, "municipality").map((r) => r.id),
    [2, 3, 1],
  );
  assert.deepEqual(
    A.sortAmendments(rows, "exercise", "desc").map((r) => r.id),
    [1, 3, 2],
  );
});

test("Pearson reconhece sinais, amostra insuficiente e variável constante", () => {
  assert.equal(A.pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(A.pearson([1, 2, 3], [6, 4, 2]), -1);
  assert.equal(A.pearson([1, 1, 1], [2, 4, 6]), null);
  assert.equal(A.pearson([1, 2], [2, 4]), null);
  assert.equal(A.pearson([1, 2, NaN], [2, 4, 6]), null);
  assert.equal(A.pearson([1, 2, 3], [2, 4]), null);
});

test("Spearman calcula correlação dos postos médios em caso de empate", () => {
  assert.deepEqual(A.ranks([9, 1, 1, 5]), [4, 1.5, 1.5, 3]);
  assert.ok(
    Math.abs(A.spearman([1, 1, 2], [1, 2, 3]) - Math.sqrt(3) / 2) < 1e-12,
  );
  assert.equal(A.spearman([1, 2, 3], [9, 5, 1]), -1);
  assert.equal(A.spearman([1, 1, 1], [1, 2, 3]), null);
});

const summary = [
  {
    person: "enrico",
    year: 2018,
    municipality_id: "1",
    votes: 10,
    registered: 100,
  },
  {
    person: "enrico",
    year: 2018,
    municipality_id: "2",
    votes: 0,
    registered: 100,
  },
  {
    person: "enrico",
    year: 2022,
    municipality_id: "1",
    votes: 20,
    registered: 100,
  },
  {
    person: "enrico",
    year: 2022,
    municipality_id: "2",
    votes: 0,
    registered: 100,
  },
  {
    person: "enrico",
    year: 2022,
    municipality_id: "3",
    votes: 7,
    registered: 100,
  },
];
const resources = [
  {
    person: "enrico",
    exercise: 2020,
    municipality_id: "1",
    committed_brl: 100,
    committed_brl_records: 1,
  },
  {
    person: "enrico",
    exercise: 2021,
    municipality_id: "1",
    committed_brl: 200,
    committed_brl_records: 1,
  },
  {
    person: "enrico",
    exercise: 2021,
    municipality_id: "2",
    committed_brl: 0,
    committed_brl_records: 1,
  },
];
const options = {
  person: "enrico",
  year: 2022,
  measure: "committed_brl",
  metric: "share",
  start: 2019,
  end: 2022,
};

test("comparação não imputa recurso zero a município sem valor documentado", () => {
  const rows = A.comparisonRows(summary, resources, options);
  assert.deepEqual(
    rows.map((r) => [r.municipality_id, r.resource_brl, r.electoral_value]),
    [
      ["1", 300, 20],
      ["2", 0, 0],
    ],
  );
  assert.equal(rows[0].records, 2);
});

test("intervalo de exercícios afeta recursos e base eleitoral zero não produz infinito", () => {
  const rows = A.comparisonRows(summary, resources, { ...options, end: 2020 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].resource_brl, 100);
  const growth = A.comparisonRows(summary, resources, {
    ...options,
    metric: "growth",
  });
  assert.equal(growth.length, 1);
  assert.equal(growth[0].electoral_value, 100);
  assert.equal(
    A.comparisonRows(summary, resources, {
      ...options,
      year: 2018,
      metric: "growth",
    }).length,
    0,
  );
  assert.equal(
    A.comparisonRows(summary, resources, { ...options, start: 2022, end: 2020 })
      .length,
    0,
  );
});

test("variação da participação usa pontos percentuais e exige denominadores", () => {
  const rows = A.comparisonRows(summary, resources, {
    ...options,
    metric: "delta_share",
  });
  assert.equal(rows[0].electoral_value, 10);
  assert.equal(rows[1].electoral_value, 0);
});
