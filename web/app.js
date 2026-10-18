/* Site estático: dados processados em Python; carregamento de seções por município. */
"use strict";
const $ = (s) => document.querySelector(s),
  nf = new Intl.NumberFormat("pt-BR");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const sum = (rows, key) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);
let D,
  geo,
  detailRows = [],
  page = 0,
  requestId = 0,
  mapPaths = [];
const PAGE = 40,
  sectionCache = new Map();
async function loadJson(file) {
  const response = await fetch(file);
  if (!response.ok)
    throw Error(`Não foi possível carregar ${file} (${response.status}).`);
  return response.json();
}
async function sections(year, mun) {
  const key = year + "/" + mun;
  if (sectionCache.has(key)) return sectionCache.get(key);
  let rows;
  if (window.INLINE_SECTIONS?.[key]) {
    const bytes = Uint8Array.from(atob(window.INLINE_SECTIONS[key]), (c) =>
      c.charCodeAt(0),
    );
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    rows = JSON.parse(await new Response(stream).text());
  } else rows = await loadJson(`data/sections/${year}/${mun}.json`);
  sectionCache.set(key, rows);
  return rows;
}
function selected() {
  return {
    year: Number($("#year").value),
    person: $("#person").value,
    mun: $("#municipality").value,
  };
}
function summary(year, person, mun = "") {
  return D.summary.filter(
    (r) =>
      Number(r.year) === Number(year) &&
      r.person === person &&
      (!mun || r.municipality_id === mun),
  );
}
function candidate(year, person) {
  return D.people.find(
    (r) => Number(r.year) === Number(year) && r.person === person,
  );
}
function activate(tab) {
  document
    .querySelectorAll(".tab")
    .forEach((el) => el.classList.toggle("active", el.id === tab));
  document
    .querySelectorAll(".nav")
    .forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  history.replaceState(null, "", "#" + tab);
}
function initMap() {
  if (!geo) return;
  let all = [];
  const collect = (c) =>
    typeof c[0] === "number" ? all.push(c) : c.forEach(collect);
  geo.features.forEach((f) => collect(f.geometry.coordinates));
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]),
    minx = xs.reduce((a, b) => Math.min(a, b), Infinity),
    maxx = xs.reduce((a, b) => Math.max(a, b), -Infinity),
    miny = ys.reduce((a, b) => Math.min(a, b), Infinity),
    maxy = ys.reduce((a, b) => Math.max(a, b), -Infinity);
  const factor = Math.min(640 / (maxx - minx), 365 / (maxy - miny));
  const project = (p) => [
    (p[0] - minx) * factor + 8,
    (maxy - p[1]) * factor + 8,
  ];
  const ring = (coords) =>
    coords
      .map((p, i) => {
        const [x, y] = project(p);
        return (i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
      })
      .join("") + "Z";
  mapPaths = geo.features.map((f) => ({
    id: String(f.properties.codarea ?? f.properties.CD_MUN ?? f.id),
    d: (f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates
    )
      .map((poly) => poly.map(ring).join(""))
      .join(""),
  }));
}
function drawMap(rows, mun, person) {
  if (!geo) {
    $("#map").innerHTML =
      '<p class="empty">Malha municipal ainda não importada.</p>';
    return;
  }
  const max = Math.max(1, ...rows.map((r) => r.votes)),
    reverse = Object.fromEntries(
      Object.entries(D.crosswalk).map(([a, b]) => [b, a]),
    );
  const lookup = new Map(rows.map((r) => [D.crosswalk[r.municipality_id], r]));
  const end = person === "enrico" ? [34, 111, 145] : [174, 122, 28];
  const paths = mapPaths
    .map((p) => {
      const r = lookup.get(p.id),
        t = r ? Math.log1p(r.votes) / Math.log1p(max) : 0;
      const rgb = [236, 242, 242].map((v, i) =>
        Math.round(v + (end[i] - v) * t),
      );
      return `<path d="${p.d}" fill="rgb(${rgb.join(",")})" class="${r?.municipality_id === mun ? "chosen" : ""}" data-ibge="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(r?.municipality ?? p.id)}: ${nf.format(r?.votes ?? 0)} votos"><title>${esc(r?.municipality ?? p.id)} · ${nf.format(r?.votes ?? 0)} votos</title></path>`;
    })
    .join("");
  $("#map").innerHTML =
    `<svg viewBox="0 0 660 385" aria-label="Distribuição de votos nos municípios de São Paulo">${paths}</svg>`;
  $("#map")
    .querySelectorAll("path")
    .forEach((el) => {
      const choose = () => {
        const code = reverse[el.dataset.ibge];
        if (code) {
          $("#municipality").value = code;
          render();
          PanelControls.open("detail");
          $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      el.addEventListener("click", choose);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
        }
      });
      el.addEventListener("mouseenter", () => {
        $("#mapHint").textContent = el.getAttribute("aria-label");
      });
    });
  $(".maplegend i").style.background =
    `linear-gradient(90deg,#ecf2f2,rgb(${end.join(",")}))`;
}
function municipalityOptions() {
  const old = $("#municipality").value;
  const rows = summary($("#year").value, $("#person").value).sort((a, b) =>
    a.municipality.localeCompare(b.municipality, "pt-BR"),
  );
  $("#municipality").innerHTML =
    '<option value="">Todo o estado</option>' +
    rows
      .map(
        (r) =>
          `<option value="${esc(r.municipality_id)}">${esc(r.municipality)}</option>`,
      )
      .join("");
  if (rows.some((r) => r.municipality_id === old))
    $("#municipality").value = old;
}
async function render() {
  const { year, person, mun } = selected(),
    all = summary(year, person),
    rows = summary(year, person, mun),
    c = candidate(year, person),
    v = sum(rows, "votes"),
    registered = sum(rows, "registered");
  $("#candidateInfo").textContent = c
    ? `${c.name} · ${c.office} · ${c.party} · número ${c.number} · ${c.result}`
    : "Candidatura ainda não resolvida";
  $("#votes").textContent = nf.format(v);
  $("#municipalities").textContent = nf.format(
    rows.filter((r) => r.votes > 0).length,
  );
  $("#sections").textContent = nf.format(sum(rows, "sections"));
  $("#share").textContent = registered
    ? ((100 * v) / registered).toLocaleString("pt-BR", {
        maximumFractionDigits: 2,
      }) + "%"
    : "Sem denominador";
  $("#votesNote").textContent = mun
    ? (rows[0]?.municipality ?? "Município selecionado")
    : `São Paulo · ${year}`;
  const ranked = [...all].sort((a, b) => b.votes - a.votes).slice(0, 10),
    max = ranked[0]?.votes || 1;
  $("#ranking").innerHTML = ranked
    .map(
      (r, i) =>
        `<button class="rank" data-mun="${esc(r.municipality_id)}"><span>${String(i + 1).padStart(2, "0")}</span><span>${esc(r.municipality)}<div class="track"><div class="fill" style="width:${(100 * r.votes) / max}%"></div></div></span><strong>${nf.format(r.votes)}</strong></button>`,
    )
    .join("");
  $("#ranking")
    .querySelectorAll("button")
    .forEach((b) =>
      b.addEventListener("click", () => {
        $("#municipality").value = b.dataset.mun;
        render();
      }),
    );
  drawMap(all, mun, person);
  renderTimeline(mun);
  DashboardFeatures.render(D, { year, person, mun });
  renderReport(year, person, mun);
  const id = ++requestId;
  detailRows = [];
  page = 0;
  $("#sectionsBody").innerHTML = "";
  $("#pageInfo").textContent = "";
  $("#prev").disabled = $("#next").disabled = true;
  $("#location").disabled =
    $("#sectionSearch").disabled =
    $("#exportSections").disabled =
      true;
  $("#location").innerHTML = '<option value="">Todos os locais</option>';
  $("#sectionSearch").value = "";
  $("#detailTitle").textContent = mun
    ? `Locais e seções · ${rows[0]?.municipality ?? ""}`
    : "Locais e seções de votação";
  if (!mun) {
    $("#detailStatus").textContent =
      "Selecione um município para carregar o detalhamento.";
    return;
  }
  $("#detailStatus").textContent = "Carregando seções do município…";
  try {
    const loaded = await sections(year, mun);
    if (id !== requestId) return;
    detailRows = loaded.filter((r) => r.person === person);
    const locs = [
      ...new Map(
        detailRows.map((r) => [r.zone + "|" + r.location_id, r]),
      ).entries(),
    ].sort((a, b) => a[1].location.localeCompare(b[1].location, "pt-BR"));
    $("#location").innerHTML =
      '<option value="">Todos os locais</option>' +
      locs
        .map(
          ([key, r]) =>
            `<option value="${esc(key)}">Zona ${esc(r.zone)} · ${esc(r.location)} (${esc(r.location_id)})</option>`,
        )
        .join("");
    $("#location").disabled =
      $("#sectionSearch").disabled =
      $("#exportSections").disabled =
        false;
    $("#detailStatus").textContent =
      `${nf.format(locs.length)} locais e ${nf.format(detailRows.length)} seções observadas. Registros com zero voto são exibidos.`;
    renderSections();
  } catch (e) {
    if (id === requestId)
      $("#detailStatus").textContent =
        e.message + " Verifique se o site foi gerado por completo.";
  }
}
function renderTimeline(mun) {
  const values = D.scope.years.flatMap((year) =>
      ["enrico", "reinaldo"].map((p) => sum(summary(year, p, mun), "votes")),
    ),
    max = Math.max(1, ...values);
  $("#timeline").innerHTML = D.scope.years
    .map((year) => {
      const audit = D.audits.find((a) => a.year === year);
      return `<div class="yearcol"><div class="yearlabel">${year}</div>${
        audit?.status !== "importado"
          ? '<p class="muted">Importação pendente</p>'
          : ["enrico", "reinaldo"]
              .map((p) => {
                const v = sum(summary(year, p, mun), "votes"),
                  c = candidate(year, p);
                return `<div class="compare ${p === "reinaldo" ? "goldbar" : ""}" aria-label="${esc(c?.name)}: ${nf.format(v)} votos"><div><b style="width:${Math.max(0, (100 * v) / max)}%"></b></div><span>${nf.format(v)}</span></div><p class="office">${esc(c?.name)} · ${esc(c?.office)}</p>`;
              })
              .join("")
      }</div>`;
    })
    .join("");
}
function filteredSections() {
  const loc = $("#location").value,
    q = $("#sectionSearch").value.trim();
  return detailRows
    .filter(
      (r) =>
        (!loc || r.zone + "|" + r.location_id === loc) &&
        (!q || String(r.section) === q),
    )
    .sort(
      (a, b) =>
        Number(a.zone) - Number(b.zone) ||
        Number(a.section) - Number(b.section),
    );
}
function renderSections() {
  const rows = filteredSections();
  page = Math.max(0, Math.min(page, Math.ceil(rows.length / PAGE) - 1));
  $("#sectionsBody").innerHTML =
    rows
      .slice(page * PAGE, (page + 1) * PAGE)
      .map(
        (r) =>
          `<tr><td>${esc(r.zone)} / ${esc(r.section)}</td><td>${esc(r.location)}<small>Local ${esc(r.location_id)}</small></td><td>${esc(r.address)}</td><td class="num">${nf.format(r.votes)}</td><td class="num">${r.registered ? ((100 * r.votes) / r.registered).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%" : "—"}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="5" class="empty">Nenhuma seção encontrada neste filtro.</td></tr>';
  $("#pageInfo").textContent = rows.length
    ? `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, rows.length)} de ${nf.format(rows.length)} seções`
    : "0 seções no filtro";
  $("#prev").disabled = page === 0;
  $("#next").disabled = (page + 1) * PAGE >= rows.length;
}
function renderReport(year, person, mun) {
  const c = candidate(year, person),
    all = summary(year, person),
    rows = summary(year, person, mun),
    total = sum(all, "votes"),
    top = [...all].sort((a, b) => b.votes - a.votes).slice(0, 5),
    topShare = total ? (100 * sum(top, "votes")) / total : 0;
  const previous = D.scope.years.filter((y) => y < year).at(-1),
    prev = previous ? candidate(previous, person) : null;
  const before = previous ? sum(summary(previous, person, mun), "votes") : 0,
    now = sum(rows, "votes");
  const available =
    D.audits.find((a) => a.year === year)?.status === "importado";
  $("#reportContent").innerHTML =
    `<h3>${esc(c?.name)} · ${year}</h3><p>Recorte: <strong>${esc(mun ? rows[0]?.municipality : "estado de São Paulo")}</strong>. Cargo: ${esc(c?.office)}. Partido na eleição: ${esc(c?.party)}.</p>${available ? `<div class="insight">Foram registrados <strong>${nf.format(now)} votos nominais</strong> para o candidato no recorte. No estado, as cinco maiores votações municipais reuniram <strong>${topShare.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong> de seus votos.</div><h3>Distribuição no estado</h3><table><thead><tr><th>Município</th><th class="num">Votos</th><th class="num">% dos votos do candidato em SP</th></tr></thead><tbody>${top.map((r) => `<tr><td>${esc(r.municipality)}</td><td class="num">${nf.format(r.votes)}</td><td class="num">${((100 * r.votes) / total).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td></tr>`).join("")}</tbody></table>` : '<p class="notice">A votação deste ano ainda não foi importada.</p>'}<h3>Comparação temporal</h3>${previous && D.audits.find((a) => a.year === previous)?.status === "importado" ? `<p>Em ${previous}, o candidato recebeu ${nf.format(before)} votos no mesmo recorte municipal; em ${year}, ${nf.format(now)}. ${before ? "A variação nominal foi de " + ((now / before - 1) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%." : "Não se calcula variação percentual sobre uma base de zero."}</p>${prev?.office_id !== c?.office_id ? '<p class="notice">Houve mudança de cargo. Esta variação não representa uma comparação direta de desempenho para o mesmo cargo.</p>' : ""}` : "<p>Não há eleição anterior importada para calcular a variação neste recorte.</p>"}<h3>Como interpretar as emendas</h3><p>${esc(D.amendment_coverage)} A destinação estadual, o empenho federal e o pagamento comprovado em 2019–2022 aparecem separados. Pagamentos federais são filtrados por competência mensal. Um status estadual posterior não comprova execução no período.</p><h3>Limites desta leitura</h3><p>Os indicadores são descritivos. Comparações entre seções de anos diferentes exigem uma conferência de continuidade. Os dados não permitem inferir escolhas individuais, bairros de residência ou efeito causal das emendas sobre os votos.</p><p class="muted">Fonte dos cálculos: arquivo oficial do TSE por seção. Reconciliação de totais: consulte Fontes e método.</p>`;
}
function audit() {
  const checked = D.audits
    .map(
      (a) =>
        `<div class="auditrow"><div><strong>Votação ${a.year}</strong><small>${esc(a.note)}</small></div><span>${esc(a.status)}${a.raw_rows ? " · " + nf.format(a.raw_rows) + " linhas lidas" : ""}</span></div>`,
    )
    .join("");
  const count = Object.keys(D.crosswalk).length;
  $("#audit").innerHTML =
    checked +
    `<p class="notice">Emendas: ${esc(D.amendment_coverage)}</p><p class="muted">Correspondências municipais TSE → IBGE: ${count}. A ligação usa nomes normalizados e a UF SP, com verificação de cobertura; os códigos das duas instituições são mantidos separados.</p>`;
}
function exportCsv() {
  const rows = filteredSections(),
    fields = [
      "year",
      "person",
      "municipality",
      "zone",
      "section",
      "location_id",
      "location",
      "address",
      "votes",
      "registered",
      "share_registered",
    ];
  const cell = (value) =>
    '"' +
    String(
      typeof value === "string" && /^[=+@]/.test(value)
        ? "'" + value
        : (value ?? ""),
    ).replaceAll('"', '""') +
    '"';
  const text =
    "\ufeff" +
    [
      fields.join(";"),
      ...rows.map((r) => fields.map((k) => cell(r[k])).join(";")),
    ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  a.download = `secoes_${selected().year}_${selected().person}_${selected().mun}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function start() {
  try {
    D = window.SNAPSHOT ?? (await loadJson("data/dashboard.json"));
    geo =
      window.INLINE_GEO ??
      (await loadJson("data/municipalities.geojson").catch(() => null));
    const available = D.audits
      .filter((a) => a.status === "importado")
      .map((a) => a.year);
    $("#year").innerHTML = D.scope.years
      .map(
        (y) =>
          `<option value="${y}" ${available.includes(y) ? "" : "disabled"}>${y}${available.includes(y) ? "" : " · pendente"}</option>`,
      )
      .join("");
    if (!available.length)
      throw Error(
        "Nenhuma base de votação foi processada. Execute o coletor e o processamento Python.",
      );
    $("#year").value = Math.max(...available);
    DashboardFeatures.init((code) => {
      $("#municipality").value = code;
      render();
    });
    initMap();
    municipalityOptions();
    audit();
    $("#loading").textContent =
      `${available.length} de 3 eleições importadas · emendas com cobertura parcial · detalhes de cobertura em Fontes e método`;
    $("#year").addEventListener("change", () => {
      municipalityOptions();
      render();
    });
    $("#person").addEventListener("change", () => {
      municipalityOptions();
      render();
    });
    $("#municipality").addEventListener("change", render);
    $("#reset").addEventListener("click", () => {
      $("#municipality").value = "";
      render();
    });
    $("#location").addEventListener("change", () => {
      page = 0;
      renderSections();
    });
    $("#sectionSearch").addEventListener("input", () => {
      page = 0;
      renderSections();
    });
    $("#prev").addEventListener("click", () => {
      page--;
      renderSections();
    });
    $("#next").addEventListener("click", () => {
      page++;
      renderSections();
    });
    $("#exportSections").addEventListener("click", exportCsv);
    $("#print").addEventListener("click", () => window.print());
    document
      .querySelectorAll(".nav")
      .forEach((b) =>
        b.addEventListener("click", () => activate(b.dataset.tab)),
      );
    activate(
      ["painel", "relatorio", "fontes"].includes(location.hash.slice(1))
        ? location.hash.slice(1)
        : "painel",
    );
    await render();
  } catch (e) {
    $("#loading").textContent = e.message;
    $("#loading").setAttribute("role", "alert");
  }
}
start();
$(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  activate("painel");
});
