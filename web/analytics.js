/* Funções puras: a mesma implementação é executada no navegador e nos testes Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ElectoralAnalytics = api;
})(typeof window === "undefined" ? this : window, function () {
  "use strict";

  const missing = (value) =>
    value === null || value === undefined || value === "";
  const resourceValue = (row) => row.committed_brl ?? row.allocated_brl ?? null;
  const sortValue = (row, field) =>
    field === "resource_value" ? resourceValue(row) : row[field];
  const numericFields = new Set([
    "exercise",
    "resource_value",
    "paid_in_period_brl",
  ]);

  function sortAmendments(rows, field, direction = "asc") {
    const sign = direction === "desc" ? -1 : 1;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const x = sortValue(a.row, field),
          y = sortValue(b.row, field);
        // Ausentes sempre no fim; a direção não transforma ausência em zero.
        if (missing(x) || missing(y))
          return missing(x) === missing(y)
            ? a.index - b.index
            : missing(x)
              ? 1
              : -1;
        const order = numericFields.has(field)
          ? Number(x) - Number(y)
          : String(x).localeCompare(String(y), "pt-BR", {
              sensitivity: "base",
              numeric: true,
            });
        return sign * order || a.index - b.index;
      })
      .map((item) => item.row);
  }

  function pearson(x, y) {
    if (
      x.length !== y.length ||
      x.length < 3 ||
      ![...x, ...y].every(Number.isFinite)
    )
      return null;
    const mx = x.reduce((a, b) => a + b, 0) / x.length;
    const my = y.reduce((a, b) => a + b, 0) / y.length;
    let xx = 0,
      yy = 0,
      xy = 0;
    x.forEach((value, index) => {
      const dx = value - mx,
        dy = y[index] - my;
      xx += dx * dx;
      yy += dy * dy;
      xy += dx * dy;
    });
    return xx === 0 || yy === 0
      ? null
      : Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)));
  }

  function ranks(values) {
    const order = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    const result = Array(values.length);
    for (let i = 0; i < order.length;) {
      let end = i + 1;
      while (end < order.length && order[end].value === order[i].value) end++;
      const rank = (i + 1 + end) / 2;
      for (let j = i; j < end; j++) result[order[j].index] = rank;
      i = end;
    }
    return result;
  }

  function spearman(x, y) {
    if (![...x, ...y].every(Number.isFinite)) return null;
    return pearson(ranks(x), ranks(y));
  }

  function voteValue(row, baseline, metric) {
    if (!row) return null;
    const share =
      row.registered > 0 ? (100 * row.votes) / row.registered : null;
    if (metric === "votes") return row.votes;
    if (metric === "share") return share;
    if (!baseline) return null;
    if (metric === "growth")
      return baseline.votes > 0 ? 100 * (row.votes / baseline.votes - 1) : null;
    if (metric === "delta_share")
      return share !== null && baseline.registered > 0
        ? share - (100 * baseline.votes) / baseline.registered
        : null;
    return null;
  }

  function comparisonRows(summary, resources, options) {
    const { person, year, start, end, measure, metric } = options;
    if (
      start > end ||
      (year === 2018 && ["growth", "delta_share"].includes(metric))
    )
      return [];
    const totals = new Map();
    resources
      .filter(
        (row) =>
          row.person === person &&
          row.exercise >= start &&
          row.exercise <= end &&
          !missing(row[measure]),
      )
      .forEach((row) => {
        const entry = totals.get(row.municipality_id) || {
          resource_brl: 0,
          records: 0,
        };
        entry.resource_brl += row[measure];
        entry.records += row[measure + "_records"];
        totals.set(row.municipality_id, entry);
      });
    const baseline = new Map(
      summary
        .filter((row) => row.person === person && row.year === 2018)
        .map((row) => [row.municipality_id, row]),
    );
    return summary
      .filter(
        (row) =>
          row.person === person &&
          row.year === year &&
          totals.has(row.municipality_id),
      )
      .flatMap((row) => {
        const value = voteValue(row, baseline.get(row.municipality_id), metric);
        return value === null || !Number.isFinite(value)
          ? []
          : [
              {
                ...row,
                ...totals.get(row.municipality_id),
                electoral_value: value,
              },
            ];
      });
  }

  return {
    sortAmendments,
    resourceValue,
    pearson,
    ranks,
    spearman,
    comparisonRows,
  };
});
