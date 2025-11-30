const DATA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT63xZTk2mm-6LomO1T9J-7JA_rvRK-gYFFbsZsFJG69U0KKzg8KLhFd--Er31HBkspNOPJUiRwtjiy/pub?output=csv";
const DATA_SOURCES = [
  DATA_URL,
  // Fallback para contornar CORS em origem file:// ou ambientes mais restritos.
  `https://cors.isomorphic-git.org/${DATA_URL}`
];

const state = {
  rows: [],
  filtered: []
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadData();
});

function bindEvents() {
  document.getElementById("refreshBtn").addEventListener("click", loadData);
  document.getElementById("unitFilter").addEventListener("change", applyFilters);
  document.getElementById("statusFilter").addEventListener("change", applyFilters);
  document.getElementById("searchInput").addEventListener("input", applyFilters);
}

async function loadData() {
  setStatus("Carregando dados...");
  try {
    const text = await fetchFirstAvailable(DATA_SOURCES);
    const parsed = parseCSV(text);
    state.rows = parsed;
    populateFilters(parsed);
    updateSummary(parsed);
    applyFilters();
    setStatus(`Atualizado agora (${new Date().toLocaleTimeString("pt-BR")})`);
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao carregar dados: ${err?.message || err}`);
  }
}

async function fetchFirstAvailable(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      console.warn("Falha ao buscar", url, err);
    }
  }
  throw lastError || new Error("Falha ao buscar dados");
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  // Remove header
  lines.slice(1).forEach((line) => {
    if (!line.trim()) return;
    const cols = splitCSV(line);
    const [
      data,
      abertura,
      sangria,
      unidade,
      recebidoDinheiro,
      troco,
      despesasDinheiro,
      totalDinheiro,
      saldoCaixa,
      recebidoOutras,
      despesasOutras,
      saldoDiaAnterior,
      difAberturaSaldoAnterior,
      statusDivergencia
    ] = cols;

    rows.push({
      data,
      abertura: toNumber(abertura),
      sangria: toNumber(sangria),
      unidade: unidade || "Nao informado",
      recebidoDinheiro: toNumber(recebidoDinheiro),
      troco: toNumber(troco),
      despesasDinheiro: toNumber(despesasDinheiro),
      totalDinheiro: toNumber(totalDinheiro),
      saldoCaixa: toNumber(saldoCaixa),
      recebidoOutras: toNumber(recebidoOutras),
      despesasOutras: toNumber(despesasOutras),
      saldoDiaAnterior: toNumber(saldoDiaAnterior),
      difAberturaSaldoAnterior: toNumber(difAberturaSaldoAnterior),
      status: normalizeStatus(statusDivergencia)
    });
  });

  return rows;
}

function splitCSV(line) {
  // Basic CSV split that respects quoted commas
  const regex = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
  return line.split(regex).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

function toNumber(value) {
  const cleaned = value ? value.replace(",", ".") : "";
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function normalizeStatus(raw) {
  const val = (raw || "").trim().toUpperCase();
  if (val === "" || val === "OK" || val === "SEM DIA ANTERIOR") return "OK";
  return val;
}

function parseDatePtBR(str) {
  const [d, m, y] = str.split("/").map((v) => parseInt(v, 10));
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function populateFilters(rows) {
  const unitSelect = document.getElementById("unitFilter");
  const units = Array.from(new Set(rows.map((r) => r.unidade))).sort();
  unitSelect.innerHTML = `<option value="ALL">Todas</option>${units.map((u) => `<option value="${u}">${u}</option>`).join("")}`;
}

function applyFilters() {
  const unit = document.getElementById("unitFilter").value;
  const status = document.getElementById("statusFilter").value;
  const search = document.getElementById("searchInput").value.toLowerCase();

  state.filtered = state.rows.filter((row) => {
    const matchUnit = unit === "ALL" || row.unidade === unit;
    const isDivergent = row.status !== "OK";
    const matchStatus = status === "ALL" || (status === "OK" ? !isDivergent : isDivergent);
    const matchSearch =
      !search ||
      row.data.toLowerCase().includes(search) ||
      row.unidade.toLowerCase().includes(search) ||
      row.status.toLowerCase().includes(search);
    return matchUnit && matchStatus && matchSearch;
  });

  renderTable(state.filtered);
  document.getElementById("rowCount").textContent = `${state.filtered.length} registros`;
}

function updateSummary(rows) {
  const units = Array.from(new Set(rows.map((r) => r.unidade)));
  const latestByUnit = new Map();

  rows.forEach((row) => {
    const current = latestByUnit.get(row.unidade);
    const currentDate = current ? parseDatePtBR(current.data) : null;
    const newDate = parseDatePtBR(row.data);
    if (!current || (newDate && currentDate && newDate > currentDate)) {
      latestByUnit.set(row.unidade, row);
    }
  });

  const divergentUnits = units.filter((unit) => rows.some((r) => r.unidade === unit && r.status !== "OK"));
  const totalSaldo = Array.from(latestByUnit.values()).reduce((sum, row) => sum + row.saldoCaixa, 0);
  const lastDateObj = rows
    .map((r) => parseDatePtBR(r.data))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  document.getElementById("totalUnits").textContent = units.length;
  document.getElementById("divergentUnits").textContent = divergentUnits.length;
  document.getElementById("totalSaldo").textContent = formatMoney(totalSaldo);
  document.getElementById("lastDate").textContent = lastDateObj ? lastDateObj.toLocaleDateString("pt-BR") : "-";
}

function renderTable(rows) {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.data}</td>
      <td class="money muted">${formatMoney(row.abertura)}</td>
      <td class="money muted">${formatMoney(row.recebidoDinheiro)}</td>
      <td class="money muted">${formatMoney(row.despesasDinheiro)}</td>
      <td class="money muted">${formatMoney(row.totalDinheiro)}</td>
      <td class="money">${formatMoney(row.saldoCaixa)}</td>
      <td class="money muted">${formatMoney(row.saldoDiaAnterior)}</td>
      <td class="money muted">${formatMoney(row.difAberturaSaldoAnterior)}</td>
      <td>${statusBadge(row.status)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function statusBadge(status) {
  const isOk = status === "OK";
  const label = isOk ? "OK" : status || "Divergencia";
  const emoji = isOk ? "✔" : "⚠";
  return `<span class="badge ${isOk ? "ok" : "div"}">${emoji} ${label}</span>`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
}

function setStatus(text) {
  document.getElementById("dataStatus").textContent = text;
}
