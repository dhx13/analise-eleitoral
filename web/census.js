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
    const table = `<div class="tablewrap"><table><caption>Ficha socioeconômica · Censo ${reference}</caption><thead><tr><th>Indicador</th><th>Recorte selecionado</th><th>SP · oficial</th><th>Mediana municipal</th></tr></thead><tbody>${Object.entries(
      snapshot.census.indicators,
    )
      .map(([key, meta]) => {
        const context = A.censusDistribution(
          snapshot.census,
          filters.year,
          key,
        );
        return `<tr><td>${escape(meta.label)}</td><td>${format(profile[key], key)}</td><td>${format(context?.official, key)}</td><td>${format(context?.median, key)}</td></tr>`;
      })
      .join("")}</tbody></table></div>`;
    return `<h3>Perfil socioeconômico · Censo ${reference}</h3><p>${filters.mun ? escape(profile.municipality) : "Estado de São Paulo"}.</p>${table}<p>${temporalNote(filters.year)} Renda nominal em reais do ano do censo, sem correção pela inflação. A mediana dos municípios atribui o mesmo peso a cada município e não substitui a estatística oficial da UF. Os dados descrevem a população residente, não o perfil individual de seus eleitores. Consulte as definições em Fontes e método.</p>`;
  }

  function audit(snapshot) {
    const census = snapshot.census;
    if (!census) return "";
    const denominators = snapshot.electoral_denominators;
    const electoral = denominators
      ? `<h3>Denominadores eleitorais oficiais</h3><p>${denominators.rows.length} registros municipais/candidatura reconciliados com as exportações por seção. Os votos válidos do cargo são a soma dos nominais válidos e dos votos válidos de legenda. Aptos são obtidos de QT_APTOS, nunca de votos registrados.</p><dl>${Object.entries(
          denominators.definitions,
        )
          .map(
            ([key, value]) =>
              `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`,
          )
          .join(
            "",
          )}</dl><ul>${denominators.sources.map((s) => `<li><a href="${escape(s.url)}">TSE · ${s.year} · ${s.kind === "detail" ? "apuração municipal/zona" : "votação nominal municipal/zona"}</a> · recorte versionado com SHA-256; consulta em ${escape(s.downloaded_at.slice(0, 10))}.</li>`).join("")}</ul>`
      : "";
    return `${electoral}<h3>Censos demográficos do IBGE</h3>${census.coverage.map((c) => `<div class="auditrow"><div><strong>Censo ${c.year}</strong><small>${c.municipalities} de ${c.expected} municípios de SP. Indicadores com ao menos um município ausente: ${Object.values(c.missing_by_indicator).filter((n) => n > 0).length}.</small></div><span>${c.year === 2010 ? "Eleição 2018" : "Eleições 2022 e 2026"}</span></div>`).join("")}<p>Ligação pelo código IBGE municipal de sete dígitos, a partir da correspondência TSE–IBGE validada. Os recortes municipais e o estadual foram consultados separadamente. Os valores estaduais são oficiais: não são médias simples das taxas ou medianas dos municípios.</p><dl class="census-definitions">${Object.entries(
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
      (row) => row.census_year === A.censusYear(data.census, selection.year),
    );
    renderDistribution(key);
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
            `<tr class="${row.municipality_id === selection.mun ? "highlighted" : ""}"><td><button class="text-button" data-municipality="${escape(row.municipality_id)}">${escape(row.municipality)}</button></td><td>${row.ibge_id}</td><td class="num">${format(row[key], key)}</td></tr>`,
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

  function renderDistribution(key) {
    const d = A.censusDistribution(
      data.census,
      selection.year,
      key,
      data.crosswalk[selection.mun],
    );
    const target = $("#censusDistribution");
    if (!d) {
      target.innerHTML = "<p>Distribuição não disponível.</p>";
      return;
    }
    const max = Math.max(1, ...d.bins.map((b) => b.count));
    target.innerHTML = `<h3>Distribuição municipal · ${escape(data.census.indicators[key].label)}</h3>
      <div class="census-reference"><span>SP · valor oficial<strong>${format(d.official, key)}</strong></span><span>Mediana dos municípios<strong>${format(d.median, key)}</strong></span><span>Municípios com dado<strong>${d.n} de ${d.n + d.missing}</strong></span></div>
      <figure class="census-histogram"><div class="census-bars" role="img" aria-label="Histograma em ${d.bins.length} intervalos iguais; eixo vertical: número de municípios; eixo horizontal: valor do indicador">
      ${d.bins.map((b, i) => `<div class="census-bin ${b.selected ? "selected" : ""}" style="--bar-height:${(100 * b.count) / max}%" tabindex="0" aria-label="De ${format(b.low, key)} ${i === d.bins.length - 1 ? "até" : "a menos de"} ${format(b.high, key)}: ${b.count} municípios${b.selected ? "; inclui o município selecionado" : ""}"><span>${b.count}</span><i></i><small>${i + 1}</small></div>`).join("")}</div>
      <figcaption><span>${format(d.min, key)}</span><span>${format(d.max, key)}</span></figcaption></figure>
      <p class="note">Cada barra conta municípios, sem ponderar pela população. Os intervalos têm a mesma largura na escala original; valores extremos podem concentrar observações em poucas barras. A mediana municipal não substitui o valor oficial de SP. ${d.selected === null ? "Selecione um município para localizar seu intervalo." : `${escape(A.censusProfile(data.census, selection.year, data.crosswalk[selection.mun])?.municipality)}: ${format(d.selected, key)}. ${d.below} municípios têm valor menor e ${d.equal} têm o mesmo valor, incluindo o selecionado. A barra correspondente está destacada.`}</p>`;
  }

  function exportElectoralCsv() {
    const rows =
      data.electoral_denominators?.rows.filter(
        (r) =>
          r.year === selection.year &&
          r.person === selection.person &&
          (!selection.mun || r.municipality_id === selection.mun),
      ) || [];
    const fields = [
      "year",
      "person",
      "municipality_id",
      "office_id",
      "nominal_votes",
      "valid_nominal_votes",
      "valid_votes",
      "electorate",
      "cast_votes",
      "valid_share_pct",
      "electorate_share_pct",
    ];
    const cell = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    const lines = rows.map((r) => {
      const totals = A.descriptiveVotes({ rows: [r] }, selection);
      return fields
        .map((f) =>
          cell(
            f === "valid_share_pct"
              ? totals.validShare
              : f === "electorate_share_pct"
                ? totals.electorateShare
                : r[f],
          ),
        )
        .join(";");
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\ufeff" + [fields.join(";"), ...lines].join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    a.download = `ficha_eleitoral_${selection.person}_${selection.year}${selection.mun ? "_" + selection.mun : ""}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function electoralFacts(snapshot, filters) {
    const facts = A.descriptiveVotes(snapshot.electoral_denominators, filters);
    if (!facts)
      return "<p>Denominadores oficiais ainda não incorporados para este recorte.</p>";
    const fmt = (v) => (v === null ? "Não disponível" : number.format(v));
    const source = snapshot.electoral_denominators.sources.find(
      (s) => s.year === filters.year && s.kind === "detail",
    );
    const nominal = snapshot.electoral_denominators.sources.find(
      (s) => s.year === filters.year && s.kind === "nominal",
    );
    return `<h3>Ficha eleitoral · ${filters.year}</h3><div class="metrics electoral-facts"><article><span>Percentual nos votos válidos do cargo</span><strong>${fmt(facts.validShare)}${facts.validShare === null ? "" : "%"}</strong><small>${fmt(facts.validNominal)} votos nominais válidos ÷ ${fmt(facts.valid)} votos válidos do cargo</small></article><article><span>Percentual sobre eleitores aptos</span><strong>${fmt(facts.electorateShare)}${facts.electorateShare === null ? "" : "%"}</strong><small>${fmt(facts.votes)} votos nominais ÷ ${fmt(facts.electorate)} eleitores aptos</small></article><article><span>Total de votos nominais</span><strong>${fmt(facts.votes)}</strong><small>Quantidade absoluta no recorte selecionado</small></article></div><p class="note">Os votos válidos do cargo incluem votos nominais válidos e de legenda. Eleitores aptos incluem quem não compareceu. Os denominadores são municipais; não se aplicam automaticamente a um local ou seção. Fontes: <a href="${escape(source?.url)}">TSE · apuração municipal/zona</a> e <a href="${escape(nominal?.url)}">TSE · votação nominal municipal/zona</a>.</p>`;
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
    $("#exportElectoralFacts").addEventListener("click", exportElectoralCsv);
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
    $("#electoralFacts").innerHTML = electoralFacts(data, selection);
    $("#censusContext").textContent =
      `${selection.mun ? profile?.municipality : "Estado de São Paulo"} · ${temporalNote(selection.year)} A seleção de candidato não altera os dados censitários.`;
    $("#censusMetrics").innerHTML = Object.entries(data.census.indicators)
      .map(([key, meta]) => {
        const context = A.censusDistribution(
          data.census,
          selection.year,
          key,
          data.crosswalk[selection.mun],
        );
        return `<article><span>${escape(meta.label)}</span><strong>${format(profile?.[key], key)}</strong><small>${meta.unit === "brl" ? `R$ nominais de ${reference} por mês${reference === 2022 ? " · amostra preliminar" : ""}` : "Censo " + reference} · <a href="${meta.sources[reference]}" target="_blank" rel="noopener">IBGE / SIDRA</a></small><div class="census-card-context">SP · oficial: ${format(context?.official, key)}<br>Mediana municipal: ${format(context?.median, key)}</div></article>`;
      })
      .join("");
    renderTable();
  }
  window.CensusPanel = {
    init,
    render,
    format,
    report,
    audit,
    temporalNote,
    electoralFacts,
  };
})();
