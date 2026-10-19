/* Perfil censitário municipal; os valores estaduais vêm do recorte oficial da UF. */
(function () {
  "use strict";
  const A = window.ElectoralAnalytics;
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  let data,
    selection,
    chooseMunicipality,
    page = 0,
    tableRows = [];
  const PAGE = 20;

  function format(value, indicator, compact = false) {
    if (value === null || value === undefined || !Number.isFinite(value))
      return "Não disponível";
    const unit = data.census.indicators[indicator]?.unit;
    if (compact)
      return (
        (unit === "brl" ? "R$ " : "") +
        new Intl.NumberFormat("pt-BR", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value) +
        (unit === "percent" ? "%" : "")
      );
    return unit === "brl"
      ? money.format(value)
      : number.format(value) + (unit === "percent" ? "%" : "");
  }

  function temporalNote(year) {
    return year === 2018
      ? "Eleição de 2018 associada ao Censo 2010, com oito anos de defasagem."
      : `Eleição de ${year} associada ao Censo 2022.${year === 2026 ? " Os valores de 2022 são mantidos como referência; não são estimativas de 2026." : " A coleta do Censo 2022 se estendeu a 2023; a base não representa informação integralmente disponível antes da eleição."}`;
  }

  function report(snapshot, filters) {
    const reference = A.censusYear(snapshot.census, filters.year);
    const profile = A.censusProfile(
      snapshot.census,
      filters.year,
      filters.mun ? snapshot.crosswalk[filters.mun] : "35",
    );
    if (!profile)
      return "<h3>Perfil socioeconômico</h3><p>Sem perfil censitário correspondente.</p>";
    return `<h3>Perfil socioeconômico · Censo ${reference}</h3><p>${filters.mun ? escape(profile.municipality) : "Estado de São Paulo"}: ${format(profile.population, "population")} habitantes; alfabetização de 15 anos ou mais de ${format(profile.literacy_15_pct, "literacy_15_pct")}; renda domiciliar per capita média de ${format(profile.income_pc_mean_brl, "income_pc_mean_brl")} por mês; ${format(profile.older_65_pct, "older_65_pct")} de pessoas com 65 anos ou mais.</p><p>${temporalNote(filters.year)} Renda nominal em reais do ano do censo, sem correção pela inflação. Os dados descrevem a população residente no município e não o perfil individual de seus eleitores. A amostra de renda e os quesitos de saneamento têm particularidades entre os censos; consulte as definições em Fontes e método.</p>`;
  }

  function audit(snapshot) {
    const census = snapshot.census;
    if (!census) return "";
    return `<h3>Censos demográficos do IBGE</h3>${census.coverage.map((c) => `<div class="auditrow"><div><strong>Censo ${c.year}</strong><small>${c.municipalities} de ${c.expected} municípios de SP. Indicadores com ao menos um município ausente: ${Object.values(c.missing_by_indicator).filter((n) => n > 0).length}.</small></div><span>${c.year === 2010 ? "Eleição 2018" : "Eleições 2022 e 2026"}</span></div>`).join("")}<p>Ligação pelo código IBGE municipal de sete dígitos, a partir da correspondência TSE–IBGE validada. Os recortes municipais e o estadual foram consultados separadamente. Os valores estaduais são oficiais: não são médias simples das taxas ou medianas dos municípios.</p><dl class="census-definitions">${Object.entries(
      census.indicators,
    )
      .map(
        ([key, meta]) =>
          `<dt>${escape(meta.label)}</dt><dd>${escape(meta.definition)} <a href="${meta.sources[2010]}" target="_blank" rel="noopener">Tabela 2010</a> · <a href="${meta.sources[2022]}" target="_blank" rel="noopener">Tabela 2022</a></dd>`,
      )
      .join(
        "",
      )}</dl><p class="notice">A renda é nominal, com os preços de cada censo, e provém de resultados da amostra (preliminares em 2022). Não se calcula crescimento real de renda entre 2010 e 2022. A água em 2022 usa a rede como fonte principal; o esgoto em 2022 inclui a categoria de fossa ligada à rede. Alterações do questionário e da base territorial limitam comparações diretas. As associações municipais não descrevem escolhas individuais nem demonstram causalidade.</p>`;
  }

  function renderTable() {
    const key = $("#censusSort").value,
      sign = $("#censusDirection").value === "asc" ? 1 : -1;
    tableRows = data.census.rows.filter(
      (row) =>
        row.census_year === A.censusYear(data.census, selection.year) &&
        (!selection.mun || row.municipality_id === selection.mun),
    );
    tableRows.sort((a, b) => {
      if (a[key] === null || b[key] === null)
        return a[key] === b[key] ? 0 : a[key] === null ? 1 : -1;
      return (
        sign * (a[key] - b[key]) ||
        a.municipality.localeCompare(b.municipality, "pt-BR")
      );
    });
    page = Math.max(0, Math.min(page, Math.ceil(tableRows.length / PAGE) - 1));
    $("#censusMetricHeading").textContent = data.census.indicators[key].label;
    $("#censusBody").innerHTML =
      tableRows
        .slice(page * PAGE, (page + 1) * PAGE)
        .map(
          (row) =>
            `<tr><td><button class="text-button" data-municipality="${escape(row.municipality_id)}">${escape(row.municipality)}</button></td><td>${row.ibge_id}</td><td class="num">${format(row[key], key)}</td></tr>`,
        )
        .join("") || '<tr><td colspan="3">Sem perfil correspondente.</td></tr>';
    $("#censusBody")
      .querySelectorAll("button")
      .forEach((button) =>
        button.addEventListener("click", () =>
          chooseMunicipality(button.dataset.municipality),
        ),
      );
    $("#censusPageInfo").textContent = tableRows.length
      ? `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, tableRows.length)} de ${tableRows.length} municípios`
      : "0 municípios";
    $("#censusPrev").disabled = page === 0;
    $("#censusNext").disabled = (page + 1) * PAGE >= tableRows.length;
  }

  function exportCsv() {
    const keys = Object.keys(data.census.indicators);
    const fields = [
      "election",
      "census_year",
      "municipality_id",
      "ibge_id",
      "municipality",
      ...keys,
    ];
    const cell = (value) =>
      '"' + String(value ?? "").replaceAll('"', '""') + '"';
    const text =
      "\ufeff" +
      [
        fields.join(";"),
        ...tableRows.map((row) =>
          fields
            .map((key) => cell(key === "election" ? selection.year : row[key]))
            .join(";"),
        ),
      ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `censo_${A.censusYear(data.census, selection.year)}_eleicao_${selection.year}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function init(snapshot, callback) {
    data = snapshot;
    chooseMunicipality = callback;
    const options = Object.entries(data.census.indicators)
      .map(
        ([key, meta]) =>
          `<option value="${key}">${escape(meta.label)}</option>`,
      )
      .join("");
    $("#censusSort").innerHTML = options;
    $("#censusSort").value = "income_pc_mean_brl";
    $("#mapMeasure").innerHTML =
      '<option value="votes">Votos nominais</option><optgroup label="Indicadores do censo">' +
      options +
      "</optgroup>";
    ["#censusSort", "#censusDirection"].forEach((id) =>
      $(id).addEventListener("change", () => {
        page = 0;
        renderTable();
      }),
    );
    $("#censusPrev").addEventListener("click", () => {
      page--;
      renderTable();
    });
    $("#censusNext").addEventListener("click", () => {
      page++;
      renderTable();
    });
    $("#exportCensus").addEventListener("click", exportCsv);
  }

  function render(snapshot, filters) {
    data = snapshot;
    selection = filters;
    page = 0;
    const reference = A.censusYear(data.census, selection.year);
    const profile = A.censusProfile(
      data.census,
      selection.year,
      selection.mun ? data.crosswalk[selection.mun] : "35",
    );
    $("#censusTag").textContent = `Censo ${reference}`;
    $("#censusContext").textContent =
      `${selection.mun ? profile?.municipality : "Estado de São Paulo"} · ${temporalNote(selection.year)} A seleção de candidato não altera os dados censitários.`;
    $("#censusMetrics").innerHTML = Object.entries(data.census.indicators)
      .map(
        ([key, meta]) =>
          `<article><span>${escape(meta.label)}</span><strong>${format(profile?.[key], key)}</strong><small>${meta.unit === "brl" ? `R$ nominais de ${reference} por mês${reference === 2022 ? " · amostra preliminar" : ""}` : "Censo " + reference} · <a href="${meta.sources[reference]}" target="_blank" rel="noopener">IBGE / SIDRA</a></small></article>`,
      )
      .join("");
    renderTable();
  }
  window.CensusPanel = { init, render, format, report, audit, temporalNote };
})();
