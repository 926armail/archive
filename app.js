(function () {
  "use strict";
  const cfg = window.APP_CONFIG || {};
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.initData !== undefined) { try { tg.ready(); tg.expand(); } catch (e) {} }

  const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  const MONTH_STEMS = ["январ","феврал","март","апрел","ма","июн","июл","август","сентябр","октябр","ноябр","декабр"];
  const $ = (id) => document.getElementById(id);
  const el = { org: $("f-org"), type: $("f-type"), year: $("f-year"), month: $("f-month"), q: $("f-q"),
               results: $("results"), count: $("count"), status: $("status") };
  if (cfg.TITLE) { $("title").textContent = cfg.TITLE; document.title = cfg.TITLE; }

  // ---------- CSV ----------
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const delim = (first.split(";").length > first.split(",").length) ? ";" : ",";
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ""));
  }

  // ---------- Период: текст -> диапазон месяцев ----------
  function monthOf(s) {
    s = s.toLowerCase();
    for (let i = 0; i < MONTH_STEMS.length; i++) {
      const stem = MONTH_STEMS[i];
      const re = i === 4 ? /(^|[^а-яё])ма[йяе]([^а-яё]|$)/ : new RegExp("(^|[^а-яё])" + stem);
      if (re.test(s)) return i;
    }
    return null;
  }
  function quarterOf(s) {
    const m = s.toLowerCase().match(/(\b[1-4]|\bi{1,3}v?\b|\biv\b)\s*(-?й)?\s*(кв|квартал)/);
    if (!m) return null;
    const map = { "1":1,"2":2,"3":3,"4":4,"i":1,"ii":2,"iii":3,"iv":4 };
    return map[m[1].trim()] || null;
  }
  function halfOf(s) {
    const m = s.toLowerCase().match(/\b([12]|i{1,2})\s*(-?е)?\s*(полугод)/);
    if (!m) return null;
    return (m[1] === "1" || m[1] === "i") ? 1 : 2;
  }
  function parsePart(s) {
    const y = (s.match(/(19|20)\d{2}/) || [])[0];
    return { year: y ? +y : null, month: monthOf(s), quarter: quarterOf(s), half: halfOf(s) };
  }
  function parsePeriod(text) {
    if (!text) return null;
    const parts = String(text).split(/\s*[—–-]\s*|\s+по\s+/).filter(Boolean);
    const a = parsePart(parts[0]);
    const b = parts.length > 1 ? parsePart(parts[parts.length - 1]) : a;
    const ya = a.year ?? b.year, yb = b.year ?? a.year;
    if (ya == null || yb == null) return null;
    let sm = 0, em = 11;
    if (a.month != null) sm = a.month; else if (a.quarter) sm = (a.quarter - 1) * 3; else if (a.half) sm = (a.half - 1) * 6;
    if (b.month != null) em = b.month; else if (b.quarter) em = b.quarter * 3 - 1; else if (b.half) em = b.half * 6 - 1;
    const from = ya * 12 + sm, to = yb * 12 + em;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  // ---------- Данные ----------
  let DATA = [];
  function findCol(header, keys) {
    const h = header.map(x => x.toLowerCase());
    for (const k of keys) { const i = h.findIndex(x => x.includes(k)); if (i >= 0) return i; }
    return -1;
  }
  function build(rows) {
    const header = rows[0];
    const c = {
      cab: findCol(header, ["шкаф"]), shelf: findCol(header, ["полк"]), folder: findCol(header, ["папк"]),
      org: findCol(header, ["организац"]), type: findCol(header, ["вид"]), period: findCol(header, ["период"])
    };
    const missing = Object.entries(c).filter(([, v]) => v < 0).map(([k]) => k);
    if (missing.length) throw new Error("В реестре не найдены колонки: " + missing.join(", "));
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
    return rows.slice(1).map(r => {
      const rec = {
        cab: clean(r[c.cab]), shelf: clean(r[c.shelf]), folder: clean(r[c.folder]),
        org: clean(r[c.org]), type: clean(r[c.type]), periodText: clean(r[c.period])
      };
      rec.period = parsePeriod(rec.periodText);
      rec.search = [rec.org, rec.type, rec.periodText].join(" ").toLowerCase().replace(/ё/g, "е");
      return rec;
    }).filter(r => r.org || r.type || r.folder);
  }

  // ---------- Фильтрация ----------
  function state() {
    return { org: el.org.value, type: el.type.value, year: el.year.value, month: el.month.value,
             q: el.q.value.trim().toLowerCase().replace(/ё/g, "е") };
  }
  function match(r, s, skip) {
    if (skip !== "org" && s.org && r.org !== s.org) return false;
    if (skip !== "type" && s.type && r.type !== s.type) return false;
    if (skip !== "year" && s.year) {
      if (!r.period) return false;
      const y = +s.year;
      const from = s.month !== "" ? y * 12 + +s.month : y * 12;
      const to = s.month !== "" ? from : y * 12 + 11;
      if (r.period.to < from || r.period.from > to) return false;
    }
    if (s.q) { for (const w of s.q.split(/\s+/)) if (!r.search.includes(w)) return false; }
    return true;
  }
  const collator = new Intl.Collator("ru", { numeric: true });
  function fill(select, values, keep, allLabel, labelFn) {
    const list = [...new Set(values)].filter(v => v !== "");
    if (keep && !list.includes(keep)) list.push(keep);
    select.innerHTML = "";
    select.append(new Option(allLabel, ""));
    for (const v of list) select.append(new Option(labelFn ? labelFn(v) : v, v));
    select.value = keep || "";
  }
  function refreshOptions() {
    const s = state();
    fill(el.org, DATA.filter(r => match(r, s, "org")).map(r => r.org).sort(collator.compare), s.org, "Все организации");
    fill(el.type, DATA.filter(r => match(r, s, "type")).map(r => r.type).sort(collator.compare), s.type, "Все виды");
    const years = new Set();
    DATA.filter(r => match(r, s, "year") && r.period).forEach(r => {
      for (let y = Math.floor(r.period.from / 12); y <= Math.floor(r.period.to / 12); y++) years.add(String(y));
    });
    fill(el.year, [...years].sort().reverse(), s.year, "Любой");
    el.month.disabled = !el.year.value;
    if (!el.year.value) { fill(el.month, [], "", "Весь год"); }
    else fill(el.month, MONTHS.map((_, i) => String(i)), s.month, "Весь год", v => MONTHS[+v]);
  }
  function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100;
    return (m10 === 1 && m100 !== 11) ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) ? b : c; }
  function esc(s) { return s.replace(/[&<>"]/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch])); }

  function render() {
    refreshOptions();
    const s = state();
    const any = s.org || s.type || s.year || s.q;
    const list = DATA.filter(r => match(r, s))
      .sort((a, b) => collator.compare(a.cab, b.cab) || collator.compare(a.shelf, b.shelf) || collator.compare(a.folder, b.folder));
    el.count.textContent = any
      ? (list.length ? `Найдено: ${list.length} ${plural(list.length, "папка", "папки", "папок")}` : "")
      : `Всего в реестре: ${DATA.length} ${plural(DATA.length, "папка", "папки", "папок")}. Выберите параметры поиска.`;
    if (any && !list.length) {
      el.results.innerHTML = `<div class="empty">По этим параметрам папка не найдена.<br>Попробуйте убрать месяц или текстовый запрос.</div>`;
      return;
    }
    const shown = any ? list : list.slice(0, 20);
    el.results.innerHTML = shown.map(r => `
      <article class="card">
        <div class="addr">
          <div class="cell"><small>Шкаф</small><b>${esc(r.cab)}</b></div>
          <div class="cell"><small>Полка</small><b>${esc(r.shelf)}</b></div>
          <div class="cell"><small>Папка</small><b>${esc(r.folder)}</b></div>
        </div>
        <div class="info">
          <div class="t">${esc(r.type)}</div>
          <div class="m">${esc(r.org)} · ${esc(r.periodText || "период не указан")}${r.period ? "" : " (период не распознан)"}</div>
        </div>
      </article>`).join("");
  }

  ["org", "type", "year", "month"].forEach(k => el[k].addEventListener("change", () => {
    if (k === "year" && !el.year.value) el.month.value = "";
    render();
  }));
  let t; el.q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 150); });
  $("reset").addEventListener("click", () => {
    el.org.value = el.type.value = el.year.value = el.q.value = ""; el.month.value = ""; render();
  });

  async function load() {
    const url = cfg.SHEET_CSV_URL || cfg.LOCAL_CSV || "data.csv";
    try {
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      DATA = build(parseCSV(await res.text()));
      const bad = DATA.filter(r => !r.period).length;
      el.status.textContent = `Реестр загружен: ${DATA.length} ${plural(DATA.length, "запись", "записи", "записей")}` +
        (bad ? ` · период не распознан в ${bad}` : "");
      render();
    } catch (e) {
      el.status.textContent = "Не удалось загрузить реестр: " + e.message;
    }
  }
  window.__parsePeriod = parsePeriod;
  load();
})();
