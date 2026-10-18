const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../web/analytics.js");

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
