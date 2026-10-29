"use strict";

// 日期鍵一律用檔名（data/index.json），不使用 CSV「抓取日期」欄。
// 人數空白（空字串）不列入排名；0 是有效數字，但畫面不顯示名次。
// 名次 = 1 + 人數嚴格大於該院的醫院數。

const CHIMEI = "1141310019";
const NCKU = "0421040011";
const FOCUS = [CHIMEI, NCKU];

const METRICS = {
  ward: { field: "待住院", label: "待住院" },
  icu: { field: "待加護病房", label: "待加護病房" },
};

const state = {
  dates: [],
  byDate: new Map(),
  selected: "",
  metric: "ward",
  sortKey: "ward",
  sortDir: "desc",
  query: "",
};

function $(id) {
  return document.getElementById(id);
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children || []) {
    if (child != null) node.append(child);
  }
  return node;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value != null) node.setAttribute(key, String(value));
  }
  return node;
}

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map((name) => name.trim());
  return rows.slice(1)
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) => {
      const record = {};
      header.forEach((name, index) => {
        record[name] = cells[index] == null ? "" : cells[index];
      });
      return record;
    });
}

function parseCount(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function assignRanks(hospitals, metric) {
  const values = hospitals
    .map((hospital) => hospital[metric])
    .filter((value) => value != null);
  hospitals.forEach((hospital) => {
    const value = hospital[metric];
    hospital[`${metric}Rank`] = value == null
      ? null
      : 1 + values.filter((other) => other > value).length;
    hospital[`${metric}Universe`] = values.length;
  });
}

function shownRank(hospital, metric) {
  const value = hospital[metric];
  if (value == null || value === 0) return null;
  return hospital[`${metric}Rank`];
}

function parseDay(date, text) {
  const records = parseCsv(text);
  let updated = "";
  const hospitals = records.map((record) => {
    const stamp = (record["資料更新時間"] || "").trim();
    if (stamp && (!updated || stamp < updated)) updated = stamp;
    return {
      code: (record["醫院代碼"] || "").trim(),
      name: (record["醫院名稱"] || "").trim(),
      ward: parseCount(record["待住院"]),
      icu: parseCount(record["待加護病房"]),
    };
  }).filter((hospital) => hospital.code && hospital.name);
  assignRanks(hospitals, "ward");
  assignRanks(hospitals, "icu");
  return { date, updated, hospitals };
}

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatClock(stamp) {
  const match = /T(\d{2}):(\d{2})/.exec(stamp || "");
  return match ? `${match[1]}:${match[2]}` : "";
}

function dayGap(later, earlier) {
  const [y1, m1, d1] = later.split("-").map(Number);
  const [y2, m2, d2] = earlier.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((a - b) / 86400000);
}

function previousDate(date) {
  const ascending = state.dates.slice().sort();
  const index = ascending.indexOf(date);
  return index > 0 ? ascending[index - 1] : null;
}

function hospitalOn(date, code) {
  const day = state.byDate.get(date);
  if (!day) return null;
  return day.hospitals.find((hospital) => hospital.code === code) || null;
}

function deltaInfo(current, previous, currDate, prevDate) {
  if (prevDate == null || previous == null || current == null) {
    return { text: "無前一日資料", kind: "flat" };
  }
  const diff = current - previous;
  const adjacent = dayGap(currDate, prevDate) === 1;
  if (diff === 0) {
    return {
      text: adjacent ? "與前一日相同" : `與${formatDate(prevDate)}相同`,
      kind: "flat",
    };
  }
  const prefix = adjacent ? "較前一日" : `較${formatDate(prevDate)}`;
  if (diff > 0) return { text: `${prefix}增加 ${diff} 人`, kind: "up" };
  return { text: `${prefix}減少 ${-diff} 人`, kind: "down" };
}

function phrase(value, rank) {
  if (value == null) return "無資料";
  if (value === 0 || rank == null) return "0 人";
  return `${value} 人，全台第 ${rank}`;
}

function focusName(code) {
  for (const date of state.dates) {
    const hospital = hospitalOn(date, code);
    if (hospital) return hospital.name;
  }
  return code;
}

function renderMeta(day) {
  const clock = formatClock(day.updated);
  const when = `${formatDate(day.date)}${clock ? ` ${clock}` : ""}（台北時間）`;
  const latest = state.dates[0] === day.date;
  $("data-meta").textContent = latest ? `最新資料：${when}` : `資料日期：${when}`;

  const wardN = day.hospitals.filter((hospital) => hospital.ward != null).length;
  const icuN = day.hospitals.filter((hospital) => hospital.icu != null).length;
  const blanks = day.hospitals
    .filter((hospital) => hospital.ward == null && hospital.icu == null)
    .map((hospital) => hospital.name);
  const base = wardN === icuN
    ? `排名母數 ${wardN} 家（有回報人數者；同人數並列同名次；0 人不顯示名次）。`
    : `排名母數：待住院 ${wardN} 家、待加護病房 ${icuN} 家（同人數並列同名次；0 人不顯示名次）。`;
  const blankText = blanks.length ? `人數空白不列入：${blanks.join("、")}。` : "";
  $("rank-note").textContent = base + blankText;
}

function renderValue(value, rank) {
  if (value == null) return el("p", { class: "metric-value", text: "無資料" });
  if (value === 0 || rank == null) return el("p", { class: "metric-value", text: "0 人" });
  return el("p", { class: "metric-value" }, [
    document.createTextNode(`${value} 人，`),
    el("span", { class: "rank-part", text: `全台第 ${rank}` }),
  ]);
}

function renderCompare() {
  const day = state.byDate.get(state.selected);
  const prevDate = previousDate(state.selected);
  const cards = FOCUS.map((code) => {
    const hospital = hospitalOn(state.selected, code);
    const previous = prevDate ? hospitalOn(prevDate, code) : null;
    const card = el("article", {
      class: `hospital-card ${code === CHIMEI ? "is-chimei" : "is-ncku"}`,
      "data-code": code,
    }, [
      el("h3", { text: hospital ? hospital.name : focusName(code) }),
    ]);
    const metrics = el("div", { class: "metrics" });
    ["ward", "icu"].forEach((metric) => {
      const spec = METRICS[metric];
      const value = hospital ? hospital[metric] : null;
      const rank = hospital ? shownRank(hospital, metric) : null;
      const prevValue = previous ? previous[metric] : null;
      const delta = deltaInfo(value, prevValue, state.selected, prevDate);
      const block = el("div", {
        class: "metric",
        "data-metric": metric,
        "data-value": value == null ? "" : String(value),
        "data-rank": rank == null ? "" : String(rank),
      }, [
        el("span", { class: "metric-label", text: spec.label }),
        renderValue(value, rank),
        el("p", { class: `metric-delta delta-${delta.kind}`, text: delta.text }),
      ]);
      metrics.append(block);
    });
    card.append(metrics);
    return card;
  });
  $("compare").replaceChildren(...cards);
}

function renderBars() {
  const day = state.byDate.get(state.selected);
  const metric = state.metric;
  const spec = METRICS[metric];
  const rows = day.hospitals
    .filter((hospital) => hospital[metric] != null)
    .slice()
    .sort((a, b) => {
      if (b[metric] !== a[metric]) return b[metric] - a[metric];
      return a.name.localeCompare(b.name, "zh-Hant");
    });
  const max = rows.reduce((peak, hospital) => Math.max(peak, hospital[metric]), 0);
  $("bar-caption").textContent = `僅列出有回報人數的醫院，共 ${rows.length} 家，由高到低排列。可捲動查看全部。`;
  const list = el("div", { class: "bar-list" });
  rows.forEach((hospital) => {
    const value = hospital[metric];
    const rank = shownRank(hospital, metric);
    const width = max > 0 ? (value / max) * 100 : 0;
    const classes = ["bar-row"];
    if (hospital.code === CHIMEI) classes.push("is-chimei");
    if (hospital.code === NCKU) classes.push("is-ncku");
    const label = `${hospital.name}，${spec.label} ${phrase(value, rank)}`;
    list.append(el("div", {
      class: classes.join(" "),
      role: "listitem",
      "data-code": hospital.code,
      "data-value": String(value),
      "data-rank": rank == null ? "" : String(rank),
      "aria-label": label,
    }, [
      el("span", { class: "bar-rank", text: rank == null ? "—" : `第 ${rank}` }),
      el("span", { class: "bar-name", text: hospital.name }),
      el("span", { class: "bar-track", "aria-hidden": "true" }, [
        el("span", { class: "bar-fill", style: `width:${width}%` }),
      ]),
      el("span", { class: "bar-value", text: String(value) }),
    ]));
  });
  $("bars").replaceChildren(list);
  $("tab-ward").setAttribute("aria-selected", metric === "ward" ? "true" : "false");
  $("tab-icu").setAttribute("aria-selected", metric === "icu" ? "true" : "false");
}

function niceTop(max) {
  if (max <= 0) return 1;
  if (max <= 5) return 5;
  if (max <= 10) return 10;
  const pow = 10 ** Math.floor(Math.log10(max));
  const steps = [1, 2, 2.5, 5, 10].map((step) => step * pow);
  return steps.find((step) => step >= max) || steps[steps.length - 1];
}

function axisOf(max) {
  const top = niceTop(max);
  const step = top <= 5 ? 1 : top <= 10 ? 2 : top / 4;
  const ticks = [];
  for (let value = 0; value <= top + 1e-6; value += step) {
    ticks.push(Math.round(value * 10) / 10);
  }
  return { top, ticks };
}

function formatTick(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function shortDate(iso) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function seriesFor(metric) {
  const dates = state.dates.slice().sort();
  return FOCUS.map((code) => ({
    code,
    name: focusName(code),
    color: code === CHIMEI ? "#d4691a" : "#1d4e89",
    dash: code === NCKU ? "5 4" : null,
    values: dates.map((date) => {
      const hospital = hospitalOn(date, code);
      return hospital ? hospital[metric] : null;
    }),
  }));
}

function drawLineChart(holder, metric) {
  const dates = state.dates.slice().sort();
  const series = seriesFor(metric);
  const width = Math.max(280, Math.floor(holder.clientWidth || 320));
  const height = 260;
  const pad = { l: 42, r: 28, t: 20, b: 32 };
  const values = series.flatMap((item) => item.values).filter((value) => value != null);
  const { top, ticks } = axisOf(values.length ? Math.max(...values) : 0);
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const xAt = (index) => pad.l + (dates.length === 1 ? plotW / 2 : (plotW * index) / (dates.length - 1));
  const yAt = (value) => pad.t + plotH - (plotH * value) / top;

  const svg = svgEl("svg", {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${METRICS[metric].label}趨勢，${series.map((item) => item.name).join("與")}`,
  });

  ticks.forEach((tick) => {
    const y = yAt(tick);
    svg.append(svgEl("line", {
      x1: pad.l, x2: width - pad.r, y1: y, y2: y,
      stroke: "#e2ebed", "stroke-width": 1,
    }));
    const label = svgEl("text", {
      x: pad.l - 6, y: y + 4, "text-anchor": "end", fill: "#3e555c", "font-size": 12,
    });
    label.textContent = formatTick(tick);
    svg.append(label);
  });

  const selectedIndex = dates.indexOf(state.selected);
  if (selectedIndex >= 0) {
    const x = xAt(selectedIndex);
    svg.append(svgEl("line", {
      x1: x, x2: x, y1: pad.t, y2: pad.t + plotH,
      stroke: "#0f766e", "stroke-width": 1, "stroke-dasharray": "3 3",
    }));
  }

  series.forEach((item, seriesIndex) => {
    let pen = false;
    let path = "";
    item.values.forEach((value, index) => {
      if (value == null) {
        pen = false;
        return;
      }
      const x = xAt(index);
      const y = yAt(value);
      path += `${pen ? "L" : "M"}${x},${y}`;
      pen = true;
    });
    if (path) {
      const attrs = {
        d: path, fill: "none", stroke: item.color, "stroke-width": 2.5, "stroke-linejoin": "round",
      };
      if (item.dash) attrs["stroke-dasharray"] = item.dash;
      svg.append(svgEl("path", attrs));
    }
    const above = seriesIndex === 0;
    item.values.forEach((value, index) => {
      if (value == null) return;
      const x = xAt(index);
      const y = yAt(value);
      svg.append(svgEl("circle", {
        cx: x, cy: y, r: dates[index] === state.selected ? 4.5 : 3.5,
        fill: "#fff", stroke: item.color, "stroke-width": 2,
        "data-code": item.code,
        "data-metric": metric,
        "data-date": dates[index],
        "data-value": String(value),
      }));
      let labelY = above ? y - 12 : y + 16;
      if (labelY < 12) labelY = y + 16;
      if (labelY > height - 28) labelY = y - 12;
      const text = svgEl("text", {
        x, y: labelY, "text-anchor": "middle", fill: item.color, "font-size": 12, "font-weight": 700,
      });
      text.textContent = String(value);
      svg.append(text);
    });
  });

  dates.forEach((date, index) => {
    const text = svgEl("text", {
      x: xAt(index), y: height - 8, "text-anchor": "middle",
      fill: date === state.selected ? "#0c3f48" : "#3e555c",
      "font-size": 12, "font-weight": date === state.selected ? 700 : 400,
    });
    text.textContent = shortDate(date);
    svg.append(text);
  });

  holder.replaceChildren(svg);
}

function renderTrends() {
  const host = $("trends");
  if (!host.childElementCount) {
    ["ward", "icu"].forEach((metric) => {
      const figure = el("figure", { class: "trend-card", "data-metric": metric });
      figure.append(
        el("figcaption", { text: METRICS[metric].label }),
        el("div", { class: "trend-legend" }, [
          el("span", {}, [el("i", { class: "swatch swatch-chimei", "aria-hidden": "true" }), document.createTextNode(focusName(CHIMEI))]),
          el("span", {}, [el("i", { class: "swatch swatch-ncku", "aria-hidden": "true" }), document.createTextNode(focusName(NCKU))]),
        ]),
        el("div", { class: "trend-plot" }),
      );
      host.append(figure);
    });
  }
  host.querySelectorAll(".trend-card").forEach((figure) => {
    drawLineChart(figure.querySelector(".trend-plot"), figure.dataset.metric);
  });
}

function sortHospitals(hospitals) {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const key = state.sortKey;
  return hospitals.slice().sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name, "zh-Hant") * dir;
    const metric = key.startsWith("icu") ? "icu" : "ward";
    const av = key.endsWith("Rank") ? shownRank(a, metric) : a[metric];
    const bv = key.endsWith("Rank") ? shownRank(b, metric) : b[metric];
    if (av == null || bv == null) {
      if (av == null && bv == null) return a.name.localeCompare(b.name, "zh-Hant");
      return av == null ? 1 : -1;
    }
    if (av !== bv) return (av - bv) * dir;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

function countCell(hospital, metric, label) {
  const value = hospital[metric];
  const text = value == null ? "無資料" : String(value);
  return el("td", { class: "num", text, "data-label": label });
}

function rankCell(hospital, metric, label) {
  const value = hospital[metric];
  const rank = shownRank(hospital, metric);
  if (value == null) {
    return el("td", { class: "num", text: "—", "data-label": label, "aria-label": "無資料，不列入排名" });
  }
  if (rank == null) {
    return el("td", { class: "num", text: "—", "data-label": label, "aria-label": "0 人，不顯示排名" });
  }
  return el("td", { class: "num", text: `第 ${rank}`, "data-label": label });
}

function renderTable() {
  const day = state.byDate.get(state.selected);
  const query = state.query.trim();
  const filtered = day.hospitals.filter((hospital) => !query || hospital.name.includes(query));
  const rows = sortHospitals(filtered);
  const total = day.hospitals.length;
  $("table-count").textContent = query
    ? `符合 ${rows.length} 家（共 ${total} 家）。人數為 0 不顯示排名。`
    : `共 ${total} 家。可依欄位排序。人數為 0 不顯示排名；空白者不列入。`;

  if (!rows.length) {
    $("table-host").replaceChildren(el("p", { class: "empty", text: "找不到符合的醫院" }));
    return;
  }

  const columns = [
    { key: "name", label: "醫院名稱", aria: "醫院名稱", numeric: false },
    { key: "ward", label: "待住院", aria: "待住院人數", numeric: true },
    { key: "wardRank", label: "排名", aria: "待住院排名", numeric: true },
    { key: "icu", label: "待加護病房", aria: "待加護病房人數", numeric: true },
    { key: "icuRank", label: "排名", aria: "待加護病房排名", numeric: true },
  ];

  const head = el("tr");
  columns.forEach((column) => {
    const active = state.sortKey === column.key;
    const arrow = active ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    const button = el("button", { type: "button", text: `${column.label}${arrow}`, "aria-label": column.aria });
    button.addEventListener("click", () => {
      if (state.sortKey === column.key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = column.key;
        state.sortDir = column.key === "name" ? "asc" : "desc";
      }
      renderTable();
    });
    const th = el("th", {
      scope: "col",
      class: `${column.numeric ? "num" : ""} ${column.key === "name" ? "sticky" : ""}`.trim(),
      "aria-sort": active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none",
    }, [button]);
    head.append(th);
  });

  const body = el("tbody");
  rows.forEach((hospital) => {
    const classes = [];
    if (hospital.code === CHIMEI) classes.push("is-chimei");
    if (hospital.code === NCKU) classes.push("is-ncku");
    body.append(el("tr", {
      class: classes.join(" "),
      "data-code": hospital.code,
    }, [
      el("th", { scope: "row", class: "sticky", text: hospital.name }),
      countCell(hospital, "ward", "待住院"),
      rankCell(hospital, "ward", "待住院排名"),
      countCell(hospital, "icu", "待加護病房"),
      rankCell(hospital, "icu", "待加護病房排名"),
    ]));
  });

  const table = el("table", {}, [el("thead", {}, [head]), body]);
  $("table-host").replaceChildren(el("div", { class: "table-scroll" }, [table]));
}

function render() {
  const day = state.byDate.get(state.selected);
  renderMeta(day);
  renderCompare();
  renderBars();
  renderTrends();
  renderTable();
}

function fillSelect() {
  const select = $("date-select");
  select.replaceChildren(...state.dates.map((date, index) => {
    const option = el("option", {
      value: date,
      text: index === 0 ? `${formatDate(date)}（最新）` : formatDate(date),
    });
    return option;
  }));
  select.value = state.selected;
  select.disabled = false;
}

function bind() {
  $("date-select").addEventListener("change", (event) => {
    state.selected = event.target.value;
    render();
  });
  $("tab-ward").addEventListener("click", () => {
    state.metric = "ward";
    renderBars();
  });
  $("tab-icu").addEventListener("click", () => {
    state.metric = "icu";
    renderBars();
  });
  $("search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderTable();
  });
  const trends = $("trends");
  if (typeof ResizeObserver === "function") {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => renderTrends());
    });
    observer.observe(trends);
  } else {
    window.addEventListener("resize", () => renderTrends());
  }
}

async function loadIndex() {
  const response = await fetch(new URL("data/index.json", document.baseURI));
  if (!response.ok) throw new Error("index");
  const payload = await response.json();
  const source = Array.isArray(payload) ? payload : payload.dates;
  const dates = [...new Set((source || []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))];
  dates.sort();
  dates.reverse();
  return dates;
}

async function loadDay(date) {
  const response = await fetch(new URL(`data/nhi_ed_${date}.csv`, document.baseURI));
  if (!response.ok) throw new Error(date);
  return parseDay(date, await response.text());
}

async function init() {
  const dates = await loadIndex();
  if (!dates.length) throw new Error("empty");
  const days = await Promise.all(dates.map(loadDay));
  state.dates = dates;
  state.byDate = new Map(days.map((day) => [day.date, day]));
  state.selected = dates[0];
  fillSelect();
  bind();
  render();
}

init().catch(() => {
  $("data-meta").textContent = "資料載入失敗，請確認日期索引與 CSV 是否存在。";
});
