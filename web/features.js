/* Controles do painel. Cálculos e ordenação ficam nas funções puras de analytics.js. */
(function () {
  "use strict";
  const A = window.ElectoralAnalytics;
  const $ = (selector) => document.querySelector(selector);
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const compact = new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
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
  const normalize = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^SAO LUIS DO PARAITINGA$/, "SAO LUIZ DO PARAITINGA");
  const PAGE_SIZE = 20;
  let data,
    selection,
    selectMunicipality,
    amendmentPage = 0,
    currentPerson,
    currentCensusYear;
  let comparison = [];

  const resourceLabels = {
    allocated_brl: "Destinação documentada estadual",
    committed_brl: "Empenho federal acumulado",
    paid_in_period_brl: "Pagamento em 2019–2022",
  };
  const voteLabels = {
    votes: "Votos nominais",
    share: "Participação nos votos registrados (%)",
    growth: "Variação dos votos desde 2018 (%)",
    delta_share: "Variação da participação desde 2018 (p.p.)",
  };
  const voteFormat = (value) =>
    number.format(value) +
    (["share", "growth"].includes($("#voteMeasure").value)
      ? "%"
      : $("#voteMeasure").value === "delta_share"
        ? " p.p."
        : "");

  function selectedAmendments() {
    const name = data.summary.find(
      (row) =>
        row.person === selection.person &&
        row.year === selection.year &&
        row.municipality_id === selection.mun,
    )?.municipality;
    return data.amendments.filter(
      (row) =>
        row.person === selection.person &&
        (!selection.mun ||
          (row.uf === "SP" && normalize(row.municipality) === normalize(name))),
    );
  }

  function renderAmendments() {
    const rows = selectedAmendments();
    const federal = selection.person === "enrico",
      measure = federal ? "committed_brl" : "allocated_brl";
    $("#amendmentCoverage").textContent = data.amendment_coverage;
    $("#amendmentTag").textContent = federal
      ? "Base federal importada"
      : "Cobertura estadual parcial";
    $("#allocatedLabel").textContent = federal
      ? "Valor empenhado · fonte federal"
      : "Valor destinado · fonte estadual";
    $("#allocatedNote").textContent = federal
      ? "Posição acumulada; autorização original ainda pendente"
      : "Registros documentados de 2020–2022; 2019 pendente";
    for (const [selector, field] of [
      ["#allocated", measure],
      ["#paid", "paid_in_period_brl"],
    ]) {
      const known = rows.filter(
        (row) => row[field] !== null && row[field] !== undefined,
      );
      $(selector).textContent = known.length
        ? money.format(known.reduce((total, row) => total + row[field], 0))
        : selector === "#paid"
          ? "Não identificado"
          : "Sem dados conferidos";
    }
    const field = $("#amendmentSort").value,
      direction = $("#amendmentDirection").value;
    const ordered = A.sortAmendments(rows, field, direction);
    amendmentPage = Math.min(
      amendmentPage,
      Math.max(0, Math.ceil(ordered.length / PAGE_SIZE) - 1),
    );
    $("#amendmentsBody").innerHTML =
      ordered
        .slice(amendmentPage * PAGE_SIZE, (amendmentPage + 1) * PAGE_SIZE)
        .map((row) => {
          const value = A.resourceValue(row);
          const amount =
            value === null
              ? "—"
              : money.format(value) +
                "<small>" +
                (row.committed_brl !== null
                  ? "Empenhado"
                  : "Destinação documental") +
                "</small>";
          const payment =
            row.paid_in_period_brl !== null
              ? money.format(row.paid_in_period_brl) +
                "<small>" +
                escape(row.payment_date || row.payment_month) +
                "</small>"
              : row.record_type === "empenho"
                ? "Ver registros de pagamento"
                : "Não identificado no período";
          return `<tr><td>${escape(row.exercise)}<small>${escape(row.sphere)} · ${escape(row.record_type || "destinação documental")}</small>${escape(row.official_code)}</td><td>${escape(row.municipality)}<small>${escape(row.beneficiary)}</small></td><td>${escape(row.purpose)}</td><td class="num">${amount}</td><td>${payment}<small>${escape(row.status)}</small></td><td><a href="${escape(row.source)}" target="_blank" rel="noopener">Consultar</a><small>Atualização: ${escape(row.source_as_of || "não informada")}</small></td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="6" class="empty">Sem registros documentados neste recorte. Isso não comprova ausência de destinações.</td></tr>';
    $("#amendmentPageInfo").textContent = ordered.length
      ? `${amendmentPage * PAGE_SIZE + 1}–${Math.min((amendmentPage + 1) * PAGE_SIZE, ordered.length)} de ${ordered.length} registros`
      : "0 registros";
    $("#amendmentPrev").disabled = amendmentPage === 0;
    $("#amendmentNext").disabled =
      (amendmentPage + 1) * PAGE_SIZE >= ordered.length;
    document.querySelectorAll("[data-amendment-sort]").forEach((button) => {
      const active = button.dataset.amendmentSort === field;
      button
        .closest("th")
        .setAttribute(
          "aria-sort",
          active ? (direction === "asc" ? "ascending" : "descending") : "none",
        );
      button.querySelector(".sort-arrow").textContent = active
        ? direction === "asc"
          ? " ↑"
          : " ↓"
        : " ↕";
    });
  }

  function correlationOptions() {
    const measure = $("#resourceMeasure").value;
    return {
      person: selection.person,
      year: selection.year,
      measure,
      censusIndicator: measure.startsWith("census:") ? measure.slice(7) : null,
      metric: $("#voteMeasure").value,
      amendmentMeasure: $("#censusResourceMeasure").value,
      start: Number($("#resourceStart").value),
      end: Number($("#resourceEnd").value),
    };
  }
  const xLabel = (options) =>
    options.censusIndicator
      ? data.census.indicators[options.censusIndicator].label +
        " · Censo " +
        A.censusYear(data.census, options.year)
      : resourceLabels[options.measure];
  const yLabel = (options) =>
    options.metric === "amendments"
      ? resourceLabels[options.amendmentMeasure]
      : voteLabels[options.metric];
  const xFormat = (value, options, short = false) =>
    options.censusIndicator
      ? CensusPanel.format(value, options.censusIndicator, short)
      : short
        ? "R$ " + compact.format(value)
        : money.format(value);
  const yFormat = (value, options, short = false) =>
    options.metric === "amendments"
      ? short
        ? "R$ " + compact.format(value)
        : money.format(value)
      : voteFormat(value);

  function drawScatter(rows, options) {
    if (!rows.length) {
      $("#scatter").innerHTML =
        '<p class="empty">Não há pares municipais documentados para esta combinação de filtros.</p>';
      return;
    }
    const width = 920,
      height = 390,
      left = 92,
      right = 24,
      top = 36,
      bottom = 72;
    const log = $("#resourceLog").checked;
    const transform = (value) =>
      log ? Math.sign(value) * Math.log10(1 + Math.abs(value)) : value;
    const inverse = (value) =>
      log ? Math.sign(value) * (10 ** Math.abs(value) - 1) : value;
    const xs = rows.map((row) => transform(row.comparison_value)),
      ys = rows.map((row) => row.electoral_value);
    let xmin = Math.min(0, ...xs),
      xmax = Math.max(0, ...xs),
      ymin = Math.min(0, ...ys),
      ymax = Math.max(0, ...ys);
    if (xmin === xmax) xmax = xmin + 1;
    if (ymin === ymax) ymax = ymin + 1;
    const x = (value) =>
      left +
      ((transform(value) - xmin) / (xmax - xmin)) * (width - left - right);
    const y = (value) =>
      height -
      bottom -
      ((value - ymin) / (ymax - ymin)) * (height - top - bottom);
    const axes = Array.from({ length: 5 }, (_, i) => i / 4)
      .map((t) => {
        const tx = left + t * (width - left - right),
          ty = height - bottom - t * (height - top - bottom);
        return `<line x1="${left}" x2="${width - right}" y1="${ty}" y2="${ty}" class="plot-grid"/><text x="${left - 12}" y="${ty + 4}" text-anchor="end">${escape(yFormat(ymin + t * (ymax - ymin), options, true))}</text><text x="${tx}" y="${height - bottom + 25}" text-anchor="middle">${escape(xFormat(inverse(xmin + t * (xmax - xmin)), options, true))}</text>`;
      })
      .join("");
    const points = rows
      .map((row) => {
        const label = `${row.municipality}: ${xFormat(row.comparison_value, options)}; ${yLabel(options)}: ${yFormat(row.electoral_value, options)}`;
        return `<circle cx="${x(row.comparison_value)}" cy="${y(row.electoral_value)}" r="${row.municipality_id === selection.mun ? 7 : 5}" class="plot-point ${row.municipality_id === selection.mun ? "chosen" : ""}" data-municipality="${escape(row.municipality_id)}" role="button" tabindex="0" aria-label="${escape(label)}"><title>${escape(label)}</title></circle>`;
      })
      .join("");
    $("#scatter").innerHTML =
      `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Dispersão de indicadores municipais"><text x="${left}" y="15">${escape(yLabel(options))}</text>${axes}<line x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}" class="plot-axis"/>${points}<text x="${width / 2}" y="${height - 12}" text-anchor="middle">${escape(xLabel(options))}${log ? " · escala logarítmica" : ""}</text></svg>`;
    $("#scatter")
      .querySelectorAll("[data-municipality]")
      .forEach((point) => {
        const show = () => {
          $("#correlationHint").textContent = point.getAttribute("aria-label");
        };
        point.addEventListener("mouseenter", show);
        point.addEventListener("focus", show);
        point.addEventListener("click", () =>
          selectMunicipality(point.dataset.municipality),
        );
        point.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectMunicipality(point.dataset.municipality);
          }
        });
      });
  }

  function resourceNotes(options, measure) {
    const audit = (data.municipal_resources?.coverage || []).filter(
      (row) =>
        row.person === options.person &&
        row.measure === measure &&
        row.exercise >= options.start &&
        row.exercise <= options.end,
    );
    const excluded = audit.reduce((n, row) => n + row.excluded_records, 0);
    const amount = audit.reduce((n, row) => n + row.excluded_brl, 0);
    const notes = [
      `Exercícios ${options.start}–${options.end}. Municípios sem registro elegível ficam fora, sem atribuir valor zero.`,
      `${excluded} registros com valor (${money.format(amount)}) excluídos por localidade não municipal ou fora de SP.`,
    ];
    if (options.start > options.end)
      notes.push("Escolha um exercício inicial menor ou igual ao final.");
    if (selection.person === "reinaldo")
      notes.push(
        "Cobertura estadual parcial: 2019 e datas dos pagamentos pendentes.",
      );
    if (measure === "committed_brl")
      notes.push(
        "Empenho federal acumulado na posição da base; não é autorização original nem execução limitada a 2022.",
      );
    if (measure === "paid_in_period_brl")
      notes.push(
        "Localidade do favorecido; não comprova o município de aplicação do recurso.",
      );
    if (selection.year === 2018)
      notes.push("2018 é anterior às emendas do recorte.");
    if (selection.year === 2022)
      notes.push(
        "O recorte de emendas inclui 2022 inteiro e pode conter registros posteriores à eleição.",
      );
    return notes;
  }

  function renderCorrelation() {
    let options = correlationOptions();
    const isCensus = Boolean(options.censusIndicator);
    const amendmentOption = $("#voteMeasure option[value='amendments']");
    amendmentOption.disabled = !isCensus;
    if (!isCensus && options.metric === "amendments") {
      $("#voteMeasure").value = "share";
      options = correlationOptions();
    }
    const usesAmendments = !isCensus || options.metric === "amendments";
    $("#resourceStartLabel").hidden = $("#resourceEndLabel").hidden =
      !usesAmendments;
    $("#censusResourceMeasure").closest("label").hidden =
      !isCensus || options.metric !== "amendments";
    comparison = isCensus
      ? A.censusComparisonRows(
          data.summary,
          data.municipal_resources?.rows || [],
          data.census,
          data.crosswalk,
          options,
        )
      : A.comparisonRows(
          data.summary,
          data.municipal_resources?.rows || [],
          options,
        ).map((row) => ({
          ...row,
          comparison_value: row.resource_brl,
          ibge_id: data.crosswalk[row.municipality_id],
        }));
    const notes = [
      `${selection.person === "enrico" ? "Enrico Misasi" : "Reinaldo Alguz"} · eleição ${selection.year}. Comparação municipal de SP, com um par por município.`,
    ];
    if (isCensus) {
      notes.push(CensusPanel.temporalNote(selection.year));
      notes.push(
        "O censo descreve residentes, não indivíduos que votaram no candidato. Dados ausentes não recebem zero.",
      );
      const profileCount = data.census.rows.filter(
        (row) =>
          row.census_year === A.censusYear(data.census, options.year) &&
          Number.isFinite(row[options.censusIndicator]),
      ).length;
      if (options.metric !== "amendments")
        notes.push(
          `${profileCount} municípios com indicador censitário; ${comparison.length} com par definido na variável escolhida.`,
        );
      if (data.census.indicators[options.censusIndicator].unit === "brl")
        notes.push(
          "Renda nominal em reais do ano do censo, sem ajuste pela inflação; não mede ganho real de poder de compra entre censos.",
        );
      if (options.censusIndicator === "sewer_network_pct")
        notes.push(
          "Em 2022, rede inclui fossa ligada à rede; o questionário mudou em relação a 2010.",
        );
    }
    if (usesAmendments) {
      const measure = isCensus ? options.amendmentMeasure : options.measure;
      notes.push(...resourceNotes(options, measure));
      const available = new Set(
        (data.municipal_resources?.rows || [])
          .filter(
            (row) =>
              row.person === options.person &&
              row.exercise >= options.start &&
              row.exercise <= options.end &&
              Number.isFinite(row[measure]),
          )
          .map((row) => row.municipality_id),
      ).size;
      if (available > comparison.length)
        notes.push(
          `${available - comparison.length} municípios com recurso ficaram fora por falta de indicador definido na outra variável.`,
        );
    }
    if (
      selection.year === 2018 &&
      ["growth", "delta_share"].includes(options.metric)
    )
      notes.push(
        "As variações desde 2018 não são calculadas para o próprio ano de 2018.",
      );
    const baselineOffice = data.people.find(
      (row) => row.person === selection.person && row.year === 2018,
    )?.office_id;
    const office = data.people.find(
      (row) => row.person === selection.person && row.year === selection.year,
    )?.office_id;
    if (
      baselineOffice !== office &&
      ["growth", "delta_share"].includes(options.metric)
    )
      notes.push(
        "Há mudança de cargo em relação a 2018; a variação não é uma comparação do mesmo cargo.",
      );
    const x = comparison.map((row) => row.comparison_value),
      y = comparison.map((row) => row.electoral_value);
    const pearson = A.pearson(x, y),
      spearman = A.spearman(x, y);
    if (comparison.length < 3)
      notes.push(
        "São necessários pelo menos três pares para mostrar os coeficientes.",
      );
    else if (pearson === null)
      notes.push(
        "Uma das variáveis não apresenta variação; os coeficientes não são definidos.",
      );
    const coefficient = (value) =>
      value === null
        ? "Não calculável"
        : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    $("#correlationCount").textContent = comparison.length;
    $("#pearson").textContent = coefficient(pearson);
    $("#spearman").textContent = coefficient(spearman);
    if (isCensus) {
      const reference = A.censusProfile(data.census, options.year);
      $("#correlationReferenceLabel").textContent =
        "Indicador oficial no estado de SP";
      $("#correlationReferenceNote").textContent =
        "Censo " +
        A.censusYear(data.census, options.year) +
        "; não é a média dos municípios";
      $("#correlationAmount").textContent = CensusPanel.format(
        reference?.[options.censusIndicator],
        options.censusIndicator,
      );
    } else {
      $("#correlationReferenceLabel").textContent =
        "Recurso nos municípios comparados";
      $("#correlationReferenceNote").textContent =
        "Medida e exercícios selecionados";
      $("#correlationAmount").textContent = money.format(
        comparison.reduce((n, row) => n + row.resource_brl, 0),
      );
    }
    $("#correlationCoverage").textContent = notes.join(" ");
    $("#correlationSelection").textContent = selection.mun
      ? comparison.some((row) => row.municipality_id === selection.mun)
        ? "O município selecionado está destacado. Os coeficientes continuam usando todos os pares elegíveis de SP."
        : "O município selecionado não tem par elegível neste recorte. Ausência de dado não comprova ausência de recursos."
      : "Selecione um ponto ou município na tabela para destacá-lo no painel. O filtro municipal mantém a comparação estadual.";
    $("#correlationHint").textContent = "";
    drawScatter(comparison, options);
    $("#correlationMetricHeading").textContent = yLabel(options);
    $("#comparisonXHeading").textContent = xLabel(options);
    $("#comparisonRecordsHeading").textContent = isCensus
      ? "Censo / registros de emendas"
      : "Registros com valor";
    $("#comparisonBody").innerHTML =
      [...comparison]
        .sort((a, b) => b.comparison_value - a.comparison_value)
        .map(
          (row) =>
            `<tr class="${row.municipality_id === selection.mun ? "highlighted" : ""}"><td><button class="text-button" data-municipality="${escape(row.municipality_id)}">${escape(row.municipality)}</button></td><td class="num">${xFormat(row.comparison_value, options)}</td><td class="num">${yFormat(row.electoral_value, options)}</td><td class="num">${isCensus ? row.census_year + (options.metric === "amendments" ? " / " + row.records : "") : row.records}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="4" class="empty">Sem pares municipais elegíveis.</td></tr>';
    $("#comparisonBody")
      .querySelectorAll("button")
      .forEach((button) =>
        button.addEventListener("click", () =>
          selectMunicipality(button.dataset.municipality),
        ),
      );
    $("#exportComparison").disabled = comparison.length === 0;
  }

  function exportComparison() {
    const options = correlationOptions();
    const fields = [
      "person",
      "election",
      "exercise_start",
      "exercise_end",
      "measure",
      "electoral_metric",
      "municipality_id",
      "municipality",
      "resource_brl",
      "comparison_value",
      "electoral_value",
      "census_year",
      "ibge_id",
      "census_indicator",
      "census_source",
      "amendment_measure",
      "votes",
      "registered",
      "records",
    ];
    const cell = (value) =>
      '"' +
      String(
        typeof value === "string" && /^[=+@]/.test(value)
          ? "'" + value
          : (value ?? ""),
      ).replaceAll('"', '""') +
      '"';
    const rows = comparison.map((row) => ({
      ...row,
      election: options.year,
      exercise_start:
        !options.censusIndicator || options.metric === "amendments"
          ? options.start
          : null,
      exercise_end:
        !options.censusIndicator || options.metric === "amendments"
          ? options.end
          : null,
      measure: options.measure,
      electoral_metric: options.metric,
      census_indicator: options.censusIndicator,
      census_source: options.censusIndicator
        ? data.census.indicators[options.censusIndicator].sources[
            A.censusYear(data.census, options.year)
          ]
        : null,
      amendment_measure:
        options.censusIndicator && options.metric === "amendments"
          ? options.amendmentMeasure
          : null,
    }));
    const text =
      "\ufeff" +
      [
        fields.join(";"),
        ...rows.map((row) => fields.map((field) => cell(row[field])).join(";")),
      ].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `correlacao_${selection.person}_${selection.year}_${options.measure}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function init(callback) {
    selectMunicipality = callback;
    ["#amendmentSort", "#amendmentDirection"].forEach((id) =>
      $(id).addEventListener("change", () => {
        amendmentPage = 0;
        renderAmendments();
      }),
    );
    document.querySelectorAll("[data-amendment-sort]").forEach((button) =>
      button.addEventListener("click", () => {
        const field = button.dataset.amendmentSort;
        $("#amendmentDirection").value =
          $("#amendmentSort").value === field &&
          $("#amendmentDirection").value === "asc"
            ? "desc"
            : "asc";
        $("#amendmentSort").value = field;
        amendmentPage = 0;
        renderAmendments();
      }),
    );
    $("#amendmentPrev").addEventListener("click", () => {
      amendmentPage--;
      renderAmendments();
    });
    $("#amendmentNext").addEventListener("click", () => {
      amendmentPage++;
      renderAmendments();
    });
    [
      "#resourceMeasure",
      "#voteMeasure",
      "#resourceStart",
      "#resourceEnd",
      "#resourceLog",
      "#censusResourceMeasure",
    ].forEach((id) => $(id).addEventListener("change", renderCorrelation));
    $("#exportComparison").addEventListener("click", exportComparison);
  }

  function render(snapshot, filters) {
    data = snapshot;
    selection = filters;
    amendmentPage = 0;
    const reference = A.censusYear(data.census, selection.year);
    if (currentPerson !== selection.person || currentCensusYear !== reference) {
      const old = $("#resourceMeasure").value;
      const measures = [
        selection.person === "enrico" ? "committed_brl" : "allocated_brl",
        "paid_in_period_brl",
      ];
      const resourceOptions = measures
        .map(
          (measure) =>
            `<option value="${measure}">${resourceLabels[measure]}</option>`,
        )
        .join("");
      $("#resourceMeasure").innerHTML =
        '<optgroup label="Emendas">' +
        resourceOptions +
        '</optgroup><optgroup label="Censo ' +
        reference +
        '">' +
        Object.entries(data.census.indicators)
          .map(
            ([key, meta]) =>
              `<option value="census:${key}">${escape(meta.label)}</option>`,
          )
          .join("") +
        "</optgroup>";
      if ([...$("#resourceMeasure").options].some((o) => o.value === old))
        $("#resourceMeasure").value = old;
      const oldAmendment = $("#censusResourceMeasure").value;
      $("#censusResourceMeasure").innerHTML = resourceOptions;
      if (measures.includes(oldAmendment))
        $("#censusResourceMeasure").value = oldAmendment;
      currentPerson = selection.person;
      currentCensusYear = reference;
    }
    renderAmendments();
    renderCorrelation();
  }
  window.DashboardFeatures = { init, render };
})();
