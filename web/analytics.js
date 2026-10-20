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

  function censusYear(census, election) {
    const year = Number(census?.election_census?.[election]);
    return [2010, 2022].includes(year) ? year : null;
  }

  function censusProfile(census, election, ibge = "35") {
    const year = censusYear(census, election);
    if (year === null) return null;
    const rows = ibge === "35" ? census.states : census.rows;
    return (
      rows.find((row) => row.census_year === year && row.ibge_id === ibge) ||
      null
    );
  }

  // Estatísticas apenas dos indicadores municipais do IBGE, sem ponderação.
  function censusDistribution(census, election, indicator, ibge = null) {
    const reference = censusYear(census, election);
    const rows = census.rows.filter((r) => r.census_year === reference);
    const values = rows
      .map((r) => r[indicator])
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!values.length) return null;
    const n = values.length,
      min = values[0],
      max = values[n - 1];
    const median =
      n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
    const selected = rows.find((r) => r.ibge_id === ibge)?.[indicator];
    const count = min === max ? 1 : 10;
    const index = (v) =>
      min === max
        ? 0
        : Math.min(count - 1, Math.floor(((v - min) / (max - min)) * count));
    const bins = Array.from({ length: count }, (_, i) => ({
      low: min + ((max - min) * i) / count,
      high: min + ((max - min) * (i + 1)) / count,
      count: 0,
      selected: Number.isFinite(selected) && index(selected) === i,
    }));
    values.forEach((v) => bins[index(v)].count++);
    const official = censusProfile(census, election)?.[indicator];
    return {
      n,
      missing: rows.length - n,
      min,
      max,
      median,
      bins,
      official: Number.isFinite(official) ? official : null,
      selected: Number.isFinite(selected) ? selected : null,
      below: Number.isFinite(selected)
        ? values.filter((v) => v < selected).length
        : null,
      equal: Number.isFinite(selected)
        ? values.filter((v) => v === selected).length
        : null,
    };
  }

  // Ficha de um único recorte; denominadores e numeradores têm conceitos distintos.
  function descriptiveVotes(denominators, filters) {
    const rows =
      denominators?.rows.filter(
        (r) =>
          r.year === filters.year &&
          r.person === filters.person &&
          (!filters.mun || r.municipality_id === filters.mun),
      ) || [];
    if (!rows.length) return null;
    const total = (key) =>
      rows.every((r) => Number.isFinite(r[key]))
        ? rows.reduce((s, r) => s + r[key], 0)
        : null;
    const votes = total("nominal_votes"),
      validNominal = total("valid_nominal_votes"),
      valid = total("valid_votes"),
      electorate = total("electorate");
    return {
      votes,
      validNominal,
      valid,
      electorate,
      validShare:
        valid > 0 && validNominal !== null
          ? (100 * validNominal) / valid
          : null,
      electorateShare:
        electorate > 0 && votes !== null ? (100 * votes) / electorate : null,
    };
  }

  function censusComparisonRows(
    summary,
    resources,
    census,
    crosswalk,
    options,
  ) {
    const { person, year, metric, censusIndicator } = options;
    const reference = censusYear(census, year);
    if (reference === null || !census.indicators[censusIndicator]) return [];
    const profiles = new Map(
      census.rows
        .filter((row) => row.census_year === reference)
        .map((row) => [row.ibge_id, row]),
    );
    const baseline = new Map(
      summary
        .filter((row) => row.person === person && row.year === 2018)
        .map((row) => [row.municipality_id, row]),
    );
    if (year === 2018 && ["growth", "delta_share"].includes(metric)) return [];
    const rows =
      metric === "amendments"
        ? comparisonRows(summary, resources, {
            ...options,
            measure: options.amendmentMeasure,
            metric: "votes",
          })
        : summary.filter((row) => row.person === person && row.year === year);
    return rows.flatMap((row) => {
      const profile = profiles.get(crosswalk[row.municipality_id]);
      const x = profile?.[censusIndicator];
      const y =
        metric === "amendments"
          ? row.resource_brl
          : voteValue(row, baseline.get(row.municipality_id), metric);
      if (
        missing(x) ||
        missing(y) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      )
        return [];
      return [
        {
          ...row,
          ibge_id: profile.ibge_id,
          census_year: reference,
          comparison_value: x,
          electoral_value: y,
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
    censusYear,
    censusProfile,
    censusDistribution,
    descriptiveVotes,
    censusComparisonRows,
  };
});
