/* NTRCA MCQ Practice. Everything runs in the browser: no server and no build step.
   Works on GitHub Pages and when index.html is opened straight from disk. */
"use strict";

const SUBJECTS = ["gk", "math", "english", "bengali"];
const LABEL = { gk: "GK", math: "Math", english: "English", bengali: "Bengali" };
const SUBJECT_ALIAS = { gk: "gk", "general knowledge": "gk", math: "math", maths: "math", mathematics: "math",
  english: "english", eng: "english", bengali: "bengali", bangla: "bengali", bn: "bengali" };
const ANSWER_LETTER = { a: 0, b: 1, c: 2, d: 3, "ক": 0, "খ": 1, "গ": 2, "ঘ": 3 };
const KEY = { history: "ntrca_history", stats: "ntrca_stats", current: "ntrca_current", settings: "ntrca_settings" };
const HISTORY_MAX = 200;   // attempts kept in this browser
const HISTORY_SHOWN = 15;  // exams listed before "Show all"
const RECENT = 6;          // "last 6 exams" is about one week of practice
const PART_SIZE = 25;      // questions per subject in one full exam part
const FROM_DISK = location.protocol === "file:";
const BUST = FROM_DISK ? "" : "?v=" + Date.now();  // on GitHub Pages, always load the newest data files
const MODE_HELP = {
  random: "Equal numbers from GK, Math, English and Bengali, picked at random.",
  fresh: "Questions you have never seen come first, then the ones you have seen least.",
  mistakes: "Only questions you got wrong or skipped last time. These exams don't count in Progress."
};
const FILTERS = [["all", "All"], ["w", "Wrong"], ["u", "Skipped"], ["f", "Marked"]];
const RESULT_LABEL = { r: "Correct", w: "Wrong", u: "Skipped" };
const SCREENS = ["practice", "progress", "files", "exam", "result"];
const CHECK_ICON = '<svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';

let setNames = [];
const setCache = {};      // set name -> Promise of the cleaned set
const setInfo = {};       // set name -> {questions, problems, notes} or {error}
const scriptErrors = {};  // set name -> error the browser hit while running data/<name>.js
let exam = null, tick = null, poolToken = 0, lastPool = null, historyAll = false;
let review = null, reviewFilter = "all";

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const show = (id, on = true) => $(id).classList.toggle("hidden", !on);
const own = (obj, k) => (Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : undefined);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
const pct = (r, t) => (t ? Math.round((r / t) * 100) + "%" : "–");
const round2 = x => Math.round(x * 100) / 100;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const setNote = (id, html) => { $(id).innerHTML = html || ""; show(id, !!html); };

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const getHistory = () => { const h = store.get(KEY.history, []); return Array.isArray(h) ? h.filter(x => x && typeof x === "object") : []; };
const getStats = () => { const s = store.get(KEY.stats, {}); return s && typeof s === "object" && !Array.isArray(s) ? s : {}; };
const getSettings = () => { const s = store.get(KEY.settings, null); return s && typeof s === "object" ? s : {}; };

function daysAgo(iso) {
  const d = new Date(iso), now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function countBySubject(questions) {
  const c = {}; SUBJECTS.forEach(s => (c[s] = questions.filter(q => q.subject === s).length)); return c;
}

/* ---------- screens ---------- */
function showScreen(name) {
  SCREENS.forEach(s => show(s, s === name));
  document.body.classList.toggle("in-exam", name === "exam");
  const tab = name === "result" ? "practice" : name;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  window.scrollTo(0, 0);
}

function openTab(name) {
  if (name === "practice") return backToStart();
  if (name === "progress") renderProgress();
  if (name === "files") renderFilesTab();
  showScreen(name);
}

function backToStart() {
  showScreen("practice");
  refreshSetTiles(); updatePool(); checkResume();
}

/* ---------- loading question files ---------- */
/* Data is loaded with <script> tags (not fetch) so the page also works
   when opened directly from disk (file://) as well as on GitHub Pages. */
window.addEventListener("error", e => {
  const m = /\/data\/([^/?#]+)\.js/.exec(e.filename || "");
  if (m) scriptErrors[decodeURIComponent(m[1])] = `${e.message} (line ${e.lineno})`;
});

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error(src + " not found"));
    document.head.appendChild(s);
  });
}

async function readSetFile(name) {
  window.NTRCA_SETS = window.NTRCA_SETS || {};
  if (!window.NTRCA_SETS[name]) {
    try { await loadScript(`data/${name}.js${BUST}`); }
    catch (e) { throw new Error(`data/${name}.js was not found. The name in data/index.js must match the file name exactly, including capital letters.`); }
  }
  const data = window.NTRCA_SETS[name];
  if (!data) {
    throw new Error(`data/${name}.js loaded, but ` + (scriptErrors[name]
      ? `it has an error: ${scriptErrors[name]}.`
      : `it does not set window.NTRCA_SETS["${name}"], or it has a typo that stops it from running.`));
  }
  return data;
}

/* Checks every question and keeps the good ones. Small slips (subject "Bangla",
   answer "B" or "খ") are fixed; anything unclear is skipped and reported. */
function cleanSet(name, data) {
  const list = Array.isArray(data) ? data : data && data.questions;
  if (!Array.isArray(list)) throw new Error(`data/${name}.js has no "questions" list.`);
  const questions = [], problems = [], notes = [], ids = new Set();
  list.forEach((q, i) => {
    const n = i + 1, where = q && q.id ? `#${n} (${q.id})` : `#${n}`;
    const skip = msg => problems.push(`${where}: ${msg}`);
    if (!q || typeof q !== "object") return skip("is not a question");
    const subject = own(SUBJECT_ALIAS, String(q.subject ?? "").trim().toLowerCase());
    if (!subject) return skip(`unknown subject "${q.subject ?? ""}"`);
    const text = typeof q.question === "string" ? q.question.trim() : "";
    if (!text) return skip("no question text");
    if (!Array.isArray(q.options) || q.options.length < 2) return skip("needs an options list");
    const options = q.options.map(o => String(o ?? "").trim());
    if (options.some(o => !o)) return skip("one of the options is empty");
    let answer = q.answer;
    if (typeof answer === "string") {
      const a = answer.trim().toLowerCase();
      answer = own(ANSWER_LETTER, a) ?? (/^\d+$/.test(a) ? Number(a) : NaN);
    }
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      return skip(`answer ${JSON.stringify(q.answer ?? null)} must be 0–${options.length - 1}`);
    }
    if (options.length !== 4) notes.push(`${where}: has ${options.length} options (kept)`);
    let id = q.id != null && String(q.id).trim() ? String(q.id).trim() : `${name}-${n}`;
    if (ids.has(id)) { notes.push(`${where}: id is used twice (kept)`); id = `${id}~${n}`; }
    ids.add(id);
    questions.push({ id, set: name, n, subject, question: text, options, answer,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "" });
  });
  return { questions, problems, notes };
}

function loadSet(name) {
  if (!setCache[name]) {
    setCache[name] = readSetFile(name)
      .then(data => (setInfo[name] = cleanSet(name, data)))
      .catch(e => { delete setCache[name]; setInfo[name] = { error: e.message }; throw e; });
  }
  return setCache[name];
}

/* Loads every listed file in the background, so counts and problems show up front. */
function preloadSets() {
  setNames.forEach(n => loadSet(n).catch(() => {}).finally(() => { refreshSetTiles(); refreshProblems(); }));
}

/* Combines sets into one pool. A question that appears twice (same id, or same text and options) is used once. */
async function buildPool(names) {
  const results = await Promise.allSettled(names.map(loadSet));
  const pool = [], ids = new Set(), texts = new Set(), errors = [];
  let repeats = 0;
  results.forEach(r => {
    if (r.status === "rejected") return errors.push(r.reason.message);
    r.value.questions.forEach(q => {
      const text = (q.question + "|" + q.options.join("|")).replace(/\s+/g, " ");
      if (ids.has(q.id) || texts.has(text)) { repeats++; return; }
      ids.add(q.id); texts.add(text); pool.push(q);
    });
  });
  return { pool, repeats, errors };
}

/* ---------- picking questions ---------- */
const isMistake = st => !!st && (st.l === "w" || st.l === "u");
const seenCount = (stats, q) => (own(stats, q.id) || {}).s || 0;

function bySubject(pool, mode, stats) {
  const by = {};
  SUBJECTS.forEach(s => {
    let list = shuffle(pool.filter(q => q.subject === s));
    if (mode === "mistakes") list = list.filter(q => isMistake(own(stats, q.id)));
    if (mode === "fresh") list.sort((a, b) => seenCount(stats, a) - seenCount(stats, b));  // stable sort keeps the shuffle among equals
    by[s] = list;
  });
  return by;
}

function pickQuestions(pool, n, mode, stats) {
  const by = bySubject(pool, mode, stats), picked = [], notes = [];
  if (mode === "mistakes") {
    // Take one from each subject in turn, so subjects stay even when some have fewer mistakes.
    const order = shuffle(SUBJECTS), next = {};
    SUBJECTS.forEach(s => (next[s] = 0));
    for (let added = true; added && picked.length < n;) {
      added = false;
      order.forEach(s => { if (picked.length < n && next[s] < by[s].length) { picked.push(by[s][next[s]++]); added = true; } });
    }
    if (picked.length && picked.length < n) notes.push(`You asked for ${n}, but there are only ${picked.length} past mistakes in these sets.`);
  } else {
    const base = Math.floor(n / 4), bonus = new Set(shuffle(SUBJECTS).slice(0, n % 4));
    SUBJECTS.forEach(s => {
      const want = base + (bonus.has(s) ? 1 : 0), got = Math.min(want, by[s].length);
      if (got < want) notes.push(`${LABEL[s]}: wanted ${want}, only ${by[s].length} available.`);
      picked.push(...by[s].slice(0, got));
    });
    if (notes.length) notes.unshift(`Not enough questions in some subjects, so this exam has ${picked.length} questions instead of ${n}.`);
  }
  return { picked: shuffle(picked), notes };
}

/* ---------- practice: question sets ---------- */
function groupSets() {
  const groups = new Map();
  setNames.forEach(n => { const g = n.split("-")[0].toLowerCase(); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n); });
  return groups;
}

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

/* "school-18" under the School heading is shown as "18th NTRCA". */
function tileName(name, group) {
  const rest = name.toLowerCase().startsWith(group + "-") ? name.slice(group.length + 1) : name;
  return /^\d+$/.test(rest) ? `${ordinal(Number(rest))} NTRCA` : rest || name;
}

function lastTakenBySet() {
  const last = Object.create(null);
  getHistory().forEach(x => (Array.isArray(x.sets) ? x.sets : []).forEach(s => { if (!last[s] || x.date > last[s]) last[s] = x.date; }));
  return last;
}

function renderSetPicker() {
  const box = $("sets"), remembered = new Set(getSettings().sets || []);
  if (!setNames.length) { box.innerHTML = '<p class="empty">No question sets are listed in data/index.js yet.</p>'; return; }
  box.innerHTML = [...groupSets()].map(([g, names]) => `
    <div class="setgroup">
      <div class="setgroup-head"><span class="eyebrow">${esc(g.replace(/(\D)(\d+)$/, "$1-$2"))}</span><button type="button" class="textbtn" data-toggle></button></div>
      <div class="setgrid">${names.map(n => `
        <label class="settile" title="${esc(n)}">
          <input type="checkbox" value="${esc(n)}"${remembered.has(n) ? " checked" : ""}>
          <span class="tick">${CHECK_ICON}</span><span class="when"></span>
          <span class="name">${esc(tileName(n, g))}</span><span class="meta"></span>
        </label>`).join("")}
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-toggle]").forEach(b => (b.onclick = () => {
    const inputs = [...b.closest(".setgroup").querySelectorAll("input")], all = inputs.every(i => i.checked);
    inputs.forEach(i => (i.checked = !all));
    updatePool();
  }));
  box.onchange = updatePool;
  refreshSetTiles();
}

function refreshSetTiles() {
  const last = lastTakenBySet();
  document.querySelectorAll("#sets .settile").forEach(t => {
    const input = t.querySelector("input"), name = input.value, info = setInfo[name], when = t.querySelector(".when");
    t.classList.toggle("on", input.checked);
    t.classList.toggle("err", !!(info && (info.error || info.problems.length)));
    t.querySelector(".meta").textContent = !info ? "Loading…" : info.error ? "File has an error"
      : plural(info.questions.length, "question") + (info.problems.length ? ` · ${info.problems.length} skipped` : "");
    when.textContent = last[name] ? daysAgo(last[name]) : "New";
    when.classList.toggle("new", !last[name]);
  });
  document.querySelectorAll("#sets .setgroup").forEach(g => {
    const all = [...g.querySelectorAll("input")].every(i => i.checked);
    g.querySelector("[data-toggle]").textContent = all ? "Clear" : "Select all";
  });
  const n = checkedSets().length;
  $("selCount").textContent = n ? `${n} selected` : "";
}

function refreshProblems() {
  const bad = setNames.filter(n => setInfo[n] && (setInfo[n].error || setInfo[n].problems.length));
  show("filesDot", bad.length > 0);
  setNote("problemNote", bad.length
    ? `${bad.length === 1 ? "1 question file has" : `${bad.length} question files have`} problems: ${esc(bad.join(", "))}.` +
      ' <button type="button" class="textbtn" data-goto="files">See details</button>'
    : "");
  if (!$("files").classList.contains("hidden")) renderFilesTab();
}

const checkedSets = () => [...document.querySelectorAll("#sets input:checked")].map(i => i.value);

/* ---------- practice: settings ---------- */
const getMode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || "random";
function setMode(v) { const r = document.querySelector(`input[name="mode"][value="${own(MODE_HELP, v) ? v : "random"}"]`); r.checked = true; }

function saveSettings() {
  const sets = $("sets").querySelector("input") ? checkedSets() : getSettings().sets;  // keep them if the list failed to load
  store.set(KEY.settings, { count: $("count").value, mins: $("mins").value, neg: $("neg").value, mode: getMode(), group: $("group").checked, sets });
}

function loadSettings() {
  const s = getSettings();
  ["count", "mins", "neg"].forEach(k => { if (s[k] != null) $(k).value = s[k]; });
  if (!$("neg").value) $("neg").value = "0";
  setMode(s.mode);
  $("group").checked = !!s.group;
  $("modeHelp").textContent = MODE_HELP[getMode()];
}

async function updatePool() {
  saveSettings(); refreshSetTiles();
  const names = checkedSets(), token = ++poolToken;
  if (!names.length) { lastPool = null; renderPlan(); return; }
  const { pool, repeats } = await buildPool(names);
  if (token !== poolToken) return;  // the selection changed while loading
  const mode = getMode(), stats = getStats();
  lastPool = { by: bySubject(pool, mode, stats), stats, mode, repeats };
  renderPlan();
}

function renderPlan() {
  const n = parseInt($("count").value, 10) || 0, mins = parseInt($("mins").value, 10) || 0;
  $("plan").textContent = `${plural(n, "question")} · ${plural(mins, "minute")}`;
  $("startBtn").disabled = !lastPool;
  if (!lastPool) { $("avail").innerHTML = '<span class="hint">Choose at least one question set above.</span>'; return; }
  const { by, stats, mode, repeats } = lastPool, per = Math.ceil(n / 4);
  $("avail").innerHTML = `<span class="label">${mode === "mistakes" ? "Past mistakes:" : "Available:"}</span>` +
    SUBJECTS.map(s => {
      const c = by[s].length, short = mode !== "mistakes" && c < per;
      const fresh = mode === "fresh" ? ` <span class="sub">· ${by[s].filter(q => !own(stats, q.id)).length} new</span>` : "";
      return `<span class="pill${short ? " short" : ""}">${LABEL[s]} <b>${c}</b>${fresh}</span>`;
    }).join("") +
    (repeats ? `<span class="hint">${plural(repeats, "repeated question")} left out</span>` : "");
}

function checkResume() {
  const c = store.get(KEY.current, null);
  if (!c || !Array.isArray(c.questions) || !c.questions.length || !Array.isArray(c.answers)) { show("resumeCard", false); return; }
  const left = Math.round((c.endAt - Date.now()) / 1000), done = c.answers.filter(a => a !== null).length;
  $("resumeInfo").textContent = `${(c.sets || []).join(", ")} · ${done} of ${c.questions.length} answered · ` +
    (left > 0 ? `${fmt(left)} left` : "time is up");
  $("resumeBtn").textContent = left > 0 ? "Resume" : "See result";
  show("resumeCard");
}

function resume() {
  const c = store.get(KEY.current, null);
  if (!c) return checkResume();
  exam = c;
  if (Date.now() >= exam.endAt) finish(true); else openExam();
}

function discard() {
  if (!confirm("Discard the unfinished exam? It will not be saved.")) return;
  store.del(KEY.current); checkResume();
}

/* ---------- exam ---------- */
async function start() {
  setNote("setupWarn");
  const names = checkedSets(), mode = getMode();
  const n = parseInt($("count").value, 10), mins = parseInt($("mins").value, 10), neg = parseFloat($("neg").value) || 0;
  if (!names.length) return setNote("setupWarn", "Select at least one question set.");
  if (!(n >= 1) || !(mins >= 1)) return setNote("setupWarn", "Enter at least 1 question and 1 minute.");
  if (store.get(KEY.current, null) && !confirm("You have an unfinished exam. Start a new one and discard it?")) return;
  saveSettings();

  $("startBtn").disabled = true;
  const { pool, errors } = await buildPool(names);
  $("startBtn").disabled = false;
  if (errors.length) return setNote("setupWarn", errors.map(esc).join("<br>"));

  const { picked, notes } = pickQuestions(pool, n, mode, getStats());
  if (!picked.length) {
    return setNote("setupWarn", mode === "mistakes" ? "No past mistakes in the selected sets. Pick “Random” or “Unseen first” instead." : "No questions found in the selected sets.");
  }
  const questions = $("group").checked ? SUBJECTS.flatMap(s => picked.filter(q => q.subject === s)) : picked;
  const now = Date.now();
  exam = { questions, answers: questions.map(() => null), flags: questions.map(() => false), cur: 0,
    sets: names, mode, neg, notes, startedAt: now, endAt: now + mins * 60000 };
  saveExam(); show("resumeCard", false); openExam();
}

const saveExam = () => store.set(KEY.current, exam);

function openExam() {
  showScreen("exam");
  setNote("examWarn", (exam.notes || []).map(esc).join("<br>"));
  $("qtotal").textContent = exam.questions.length;
  const p = $("palette"); p.innerHTML = "";
  exam.questions.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pbtn"; b.textContent = i + 1;
    b.onclick = () => { exam.cur = i; saveExam(); render(); scrollToQuestion(); };
    p.appendChild(b);
  });
  $("mapBox").open = window.matchMedia("(min-width: 720px)").matches;
  render();
  clearInterval(tick); tick = setInterval(onTick, 500); onTick();
}

function scrollToQuestion() {
  const top = $("qcard").getBoundingClientRect().top;
  if (top < 80) window.scrollTo({ top: window.scrollY + top - 90, behavior: "smooth" });
}

function onTick() {
  if (!exam) return;
  const left = Math.round((exam.endAt - Date.now()) / 1000);
  $("timerText").textContent = fmt(left);
  $("timer").classList.toggle("low", left <= 300);
  if (left <= 0) finish(true);
}

function optionEl(tag, text, i, cls, mark) {
  const el = document.createElement(tag);
  if (tag === "button") el.type = "button";
  el.className = "opt" + (cls ? " " + cls : "");
  el.innerHTML = `<span class="letter">${String.fromCharCode(65 + i)}</span><span class="otext"></span>` + (mark ? `<span class="omark">${mark}</span>` : "");
  el.querySelector(".otext").textContent = text;
  return el;
}

function render() {
  const { questions, answers, flags, cur } = exam, q = questions[cur];
  const done = answers.filter(a => a !== null).length, marked = flags.filter(Boolean).length;
  $("qnum").textContent = cur + 1;
  $("pbarFill").style.width = (done / questions.length) * 100 + "%";
  $("mapInfo").textContent = `${done} of ${questions.length} answered` + (marked ? ` · ${marked} marked` : "");
  $("qtag").textContent = LABEL[q.subject] || q.subject;
  $("qtext").textContent = q.question;
  const o = $("opts"); o.innerHTML = "";
  q.options.forEach((t, i) => {
    const b = optionEl("button", t, i, answers[cur] === i ? "sel" : "");
    b.onclick = () => choose(i);
    o.appendChild(b);
  });
  $("prevBtn").disabled = cur === 0;
  $("nextBtn").disabled = cur === questions.length - 1;
  $("flagBtn").classList.toggle("on", flags[cur]);
  $("flagLabel").textContent = flags[cur] ? "Marked" : "Mark";
  [...$("palette").children].forEach((b, i) => {
    b.classList.toggle("done", answers[i] !== null);
    b.classList.toggle("flag", flags[i]);
    b.classList.toggle("cur", i === cur);
  });
}

function choose(i) { exam.answers[exam.cur] = exam.answers[exam.cur] === i ? null : i; saveExam(); render(); }
function go(d) { const c = exam.cur + d; if (c < 0 || c >= exam.questions.length) return; exam.cur = c; saveExam(); render(); }
function toggleFlag() { exam.flags[exam.cur] = !exam.flags[exam.cur]; saveExam(); render(); }

function onKey(e) {
  if (!exam || $("exam").classList.contains("hidden")) return;
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  const i = /^[1-9]$/.test(k) ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
  if (i >= 0 && i < exam.questions[exam.cur].options.length) choose(i);
  else if (k === "arrowright") go(1);
  else if (k === "arrowleft") go(-1);
  else if (k === "f") toggleFlag();
  else return;
  e.preventDefault();
}

function quit() {
  if (!confirm("Quit this exam? Nothing from it will be saved.")) return;
  clearInterval(tick); exam = null; store.del(KEY.current);
  backToStart();
}

/* ---------- result ---------- */
function finish(auto) {
  if (!exam) return;
  if (!auto) {
    const left = exam.answers.filter(a => a === null).length, marked = exam.flags.filter(Boolean).length;
    const msg = [left && `${left} unanswered`, marked && `${marked} marked for review`].filter(Boolean).join(" and ");
    if (msg && !confirm(`You have ${msg}. Submit anyway?`)) return;
  }
  clearInterval(tick);
  const e = exam; exam = null; store.del(KEY.current);

  const stats = getStats(), sub = {}, res = [];
  SUBJECTS.forEach(s => (sub[s] = { r: 0, w: 0, u: 0, t: 0 }));
  e.questions.forEach((q, i) => {
    const a = e.answers[i], r = a === null ? "u" : a === q.answer ? "r" : "w";
    res.push(r); sub[q.subject][r]++; sub[q.subject].t++;
    const st = own(stats, q.id) || { s: 0, w: 0 };
    st.s++; if (r === "w") st.w++; st.l = r;  // s = times seen, w = times wrong, l = last result
    stats[q.id] = st;
  });
  store.set(KEY.stats, stats);

  const right = SUBJECTS.reduce((t, s) => t + sub[s].r, 0), wrong = SUBJECTS.reduce((t, s) => t + sub[s].w, 0);
  const entry = { date: new Date().toISOString(), sets: e.sets, mode: e.mode, score: right, wrong, total: e.questions.length,
    neg: e.neg, marks: round2(right - wrong * e.neg), secs: Math.round((Math.min(Date.now(), e.endAt) - e.startedAt) / 1000),
    subj: Object.fromEntries(SUBJECTS.map(s => [s, [sub[s].r, sub[s].t]])) };
  const h = getHistory(); h.unshift(entry); store.set(KEY.history, h.slice(0, HISTORY_MAX));

  showScreen("result");
  $("heroPct").textContent = pct(right, entry.total);
  $("heroSub").textContent = `${right} of ${entry.total} correct`;
  $("heroStats").innerHTML = [
    `<span class="pill">Wrong <b>${wrong}</b></span>`,
    `<span class="pill">Skipped <b>${entry.total - right - wrong}</b></span>`,
    e.neg ? `<span class="pill">Marks <b>${entry.marks}</b></span>` : "",
    `<span class="pill">Time <b>${fmt(entry.secs)}</b> <span class="sub">of ${fmt(Math.round((e.endAt - e.startedAt) / 1000))}</span></span>`
  ].join("");
  $("resTiles").innerHTML = `<div class="stats">${SUBJECTS.map(s =>
    statTile(LABEL[s], sub[s].r, sub[s].t, `<div class="stat-foot">${sub[s].r} of ${sub[s].t} correct</div>`)).join("")}</div>`;
  review = { e, res }; reviewFilter = res.includes("w") ? "w" : "all"; renderReview();
}

/* One subject: label, percentage, a meter whose colour shows the level, and a footer. */
function statTile(label, r, t, footHtml) {
  const p = t ? Math.round((r / t) * 100) : null;
  const lvl = p === null ? "none" : p >= 60 ? "good" : p >= 40 ? "mid" : "low";
  return `<div class="stat lvl-${lvl}"><div class="stat-label">${label}</div><div class="stat-value">${p === null ? "–" : p + "%"}</div>` +
    `<div class="meter"><span style="width:${p || 0}%"></span></div>${footHtml}</div>`;
}

function renderReview() {
  const { e, res } = review;
  const match = (k, i) => k === "all" || (k === "f" ? e.flags[i] : res[i] === k);
  $("reviewFilter").innerHTML = FILTERS.map(([k, label]) =>
    `<button type="button" class="${k === reviewFilter ? "on" : ""}" data-f="${k}">${label} <span class="count">${e.questions.filter((_, i) => match(k, i)).length}</span></button>`).join("");
  $("reviewFilter").querySelectorAll("button").forEach(b => (b.onclick = () => { reviewFilter = b.dataset.f; renderReview(); }));

  const list = $("review"); list.innerHTML = "";
  e.questions.forEach((q, i) => {
    if (!match(reviewFilter, i)) return;
    const d = document.createElement("article"); d.className = "ritem";
    d.innerHTML = `<div class="rhead"><span class="rnum">Q${i + 1}</span><span class="chip">${esc(LABEL[q.subject] || q.subject)}</span>` +
      `<span class="status st-${res[i]}">${RESULT_LABEL[res[i]]}</span>${e.flags[i] ? '<span class="status st-f">Marked</span>' : ""}` +
      `<span class="rsrc" title="${esc(q.set)}.js, question ${esc(q.n)} in the file">${esc(q.id)}</span></div><div class="rq"></div><div class="opts"></div>`;
    d.querySelector(".rq").textContent = q.question;
    const opts = d.querySelector(".opts");
    q.options.forEach((t, j) => {
      const mine = e.answers[i] === j, right = j === q.answer;
      opts.appendChild(optionEl("div", t, j, right ? "right" : mine ? "wrong" : "", right ? (mine ? "Your answer" : "Correct answer") : mine ? "Your answer" : ""));
    });
    if (q.explanation) { const x = document.createElement("div"); x.className = "explain"; x.textContent = q.explanation; d.appendChild(x); }
    list.appendChild(d);
  });
  if (!list.children.length) list.innerHTML = '<p class="empty">Nothing here.</p>';
}

/* ---------- progress ---------- */
function renderProgress() {
  const h = getHistory();
  renderSubjects(h.filter(x => x.mode !== "mistakes"));
  renderHistoryList(h);
}

function renderSubjects(h) {
  const box = $("subjSummary"), list = h.filter(x => x.subj && typeof x.subj === "object");
  if (!list.length) {
    $("subjNote").textContent = "";
    box.innerHTML = h.length
      ? '<p class="empty">Subject scores are saved from your next exam on.</p>'
      : '<p class="empty">No exams yet. Your subject scores will show up here.<br><button type="button" class="btn primary sm" data-goto="practice" style="margin-top:14px">Start practising</button></p>';
    return;
  }
  const sum = part => {
    const a = {};
    SUBJECTS.forEach(s => {
      a[s] = [0, 0];
      part.forEach(x => { const v = x.subj[s]; if (Array.isArray(v)) { a[s][0] += Number(v[0]) || 0; a[s][1] += Number(v[1]) || 0; } });
    });
    return a;
  };
  const rate = v => (v[1] ? v[0] / v[1] : null);
  const recent = sum(list.slice(0, RECENT)), before = sum(list.slice(RECENT, RECENT * 2)), all = sum(list);
  const n = Math.min(list.length, RECENT);
  $("subjNote").textContent = `Last ${plural(n, "exam")}`;
  const tiles = SUBJECTS.map(s => {
    const r = rate(recent[s]), b = rate(before[s]);
    let delta = `${recent[s][0]} of ${recent[s][1]} correct`;
    if (r !== null && b !== null) {
      const d = Math.round((r - b) * 100);
      delta = d === 0 ? `No change vs previous ${RECENT}` : `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ −"}${Math.abs(d)} pts</span> vs previous ${RECENT}`;
    }
    return statTile(LABEL[s], recent[s][0], recent[s][1],
      `<div class="stat-foot">${delta}</div><div class="stat-foot">All time ${pct(...all[s])}</div>`);
  }).join("");
  const tried = SUBJECTS.filter(s => recent[s][1]);
  const weak = tried.length > 1 ? tried.sort((a, b) => rate(recent[a]) - rate(recent[b]))[0] : null;
  box.innerHTML = `<div class="stats">${tiles}</div>` + (weak ? `<p class="hint">Weakest lately: <b>${LABEL[weak]}</b></p>` : "");
}

function renderHistoryList(h) {
  const box = $("history");
  $("histCount").textContent = h.length ? `${h.length} saved` : "";
  if (!h.length) { box.innerHTML = '<p class="empty">Finished exams will be listed here.</p>'; return; }
  const items = (historyAll ? h : h.slice(0, HISTORY_SHOWN)).map(x => {
    const when = new Date(x.date), sets = Array.isArray(x.sets) ? x.sets : [];
    const subj = SUBJECTS.map(s => { const v = x.subj && x.subj[s]; return Array.isArray(v) && v[1] ? `<span>${LABEL[s]} <b>${pct(v[0], v[1])}</b></span>` : ""; }).join("");
    return `<li class="hitem"><div class="hmain">` +
      `<div class="htitle">${esc(isNaN(when) ? "" : when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }))}${x.mode === "mistakes" ? '<span class="chip plain">Mistakes</span>' : ""}</div>` +
      `<div class="hsets">${esc(sets.join(" · "))}</div>${subj ? `<div class="hsubj">${subj}</div>` : ""}</div>` +
      `<div class="hscore"><b>${pct(Number(x.score), Number(x.total))}</b><span>${esc(x.score)}/${esc(x.total)} · ${fmt(Number(x.secs) || 0)}</span>` +
      `${x.neg ? `<span>${esc(x.marks)} marks</span>` : ""}</div></li>`;
  }).join("");
  box.innerHTML = `<ul class="hlist">${items}</ul>` +
    (h.length > HISTORY_SHOWN ? `<button type="button" class="textbtn" id="histMore">${historyAll ? "Show fewer" : `Show all ${h.length}`}</button>` : "");
  if ($("histMore")) $("histMore").onclick = () => { historyAll = !historyAll; renderHistoryList(getHistory()); };
}

function exportBackup() {
  const data = { app: "ntrca-practice", version: 1, exported: new Date().toISOString(), history: getHistory(), stats: getStats() };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  a.download = `ntrca-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* Merges a backup into what is already here, so nothing on this device is lost. */
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  if (!data || !Array.isArray(data.history)) return alert("That file is not a backup from this site.");
  const byDate = new Map();
  [...getHistory(), ...data.history].forEach(x => { if (x && typeof x.date === "string") byDate.set(x.date, x); });
  const history = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, HISTORY_MAX);
  const stats = getStats(), incoming = data.stats && typeof data.stats === "object" ? data.stats : {};
  Object.keys(incoming).forEach(id => {
    const st = incoming[id];
    if (id === "__proto__" || !st || typeof st !== "object") return;
    if (!own(stats, id) || (Number(st.s) || 0) > (Number(stats[id].s) || 0)) stats[id] = st;  // keep the record with more practice
  });
  store.set(KEY.history, history); store.set(KEY.stats, stats);
  alert(`Backup imported. ${history.length} exams are saved now.`);
  renderProgress(); refreshSetTiles();
}

function clearAll() {
  if (!confirm("Delete all saved exams and the record of which questions you have seen or got wrong? Export a backup first if you want to keep them.")) return;
  store.del(KEY.history); store.del(KEY.stats);
  renderProgress(); refreshSetTiles();
}

/* ---------- files ---------- */
function renderFilesTab() {
  $("filesCount").textContent = setNames.length ? plural(setNames.length, "file") : "";
  if (!setNames.length) { $("fileTable").innerHTML = '<p class="empty">No files are listed in data/index.js.</p>'; $("fileIssues").innerHTML = ""; return; }
  $("fileTable").innerHTML = `<div class="scroll"><table class="table"><thead><tr><th>File</th><th class="num">Total</th>` +
    SUBJECTS.map(s => `<th class="num">${LABEL[s]}</th>`).join("") + "<th>Status</th></tr></thead><tbody>" +
    setNames.map(n => {
      const i = setInfo[n];
      if (!i) return `<tr><td>${esc(n)}</td><td colspan="5" class="muted">Loading…</td><td></td></tr>`;
      if (i.error) return `<tr><td>${esc(n)}</td><td colspan="5"></td><td><span class="status bad">Error</span></td></tr>`;
      const c = countBySubject(i.questions);
      return `<tr><td>${esc(n)}</td><td class="num">${i.questions.length}</td>` +
        SUBJECTS.map(s => `<td class="num${c[s] === PART_SIZE ? "" : " off"}">${c[s]}</td>`).join("") +
        `<td>${i.problems.length ? `<span class="status bad">${i.problems.length} skipped</span>` : '<span class="status ok">OK</span>'}</td></tr>`;
    }).join("") + "</tbody></table></div>";
  $("fileIssues").innerHTML = setNames.filter(n => setInfo[n]).map(n => {
    const i = setInfo[n], lines = i.error ? [i.error] : [...i.problems.map(p => "Skipped " + p), ...i.notes.map(p => "Note " + p)];
    if (!lines.length) return "";
    return `<div class="issue"><h3>${esc(n)}</h3><ul>${lines.slice(0, 12).map(l => `<li>${esc(l)}</li>`).join("")}` +
      `${lines.length > 12 ? `<li>…and ${lines.length - 12} more</li>` : ""}</ul></div>`;
  }).join("");
}

/* ---------- start ---------- */
async function init() {
  loadSettings(); checkResume(); showScreen("practice"); renderPlan();
  try {
    await loadScript("data/index.js" + BUST);
    if (!Array.isArray(window.NTRCA_INDEX)) {
      throw new Error(scriptErrors.index ? `It has an error: ${scriptErrors.index}.` : 'It must contain: window.NTRCA_INDEX = ["school-18", "college-18"];');
    }
    setNames = [...new Set(window.NTRCA_INDEX.map(n => String(n).trim().replace(/^data\//, "").replace(/\.js$/i, "")).filter(Boolean))];
    renderSetPicker(); preloadSets(); updatePool();
  } catch (e) {
    setNote("loadErr", esc("Could not load data/index.js. " + e.message));
  }
}

document.querySelectorAll("#tabs button").forEach(b => (b.onclick = () => openTab(b.dataset.tab)));
document.addEventListener("click", e => { const g = e.target.closest("[data-goto]"); if (g) openTab(g.dataset.goto); });
$("startBtn").onclick = start;
$("prevBtn").onclick = () => go(-1);
$("nextBtn").onclick = () => go(1);
$("flagBtn").onclick = toggleFlag;
$("submitBtn").onclick = () => finish(false);
$("quitBtn").onclick = quit;
$("againBtn").onclick = backToStart;
$("resumeBtn").onclick = resume;
$("discardBtn").onclick = discard;
document.querySelectorAll('input[name="mode"]').forEach(r => (r.onchange = () => { $("modeHelp").textContent = MODE_HELP[getMode()]; updatePool(); }));
["count", "mins"].forEach(id => ($(id).oninput = () => { saveSettings(); renderPlan(); }));
["neg", "group"].forEach(id => ($(id).onchange = saveSettings));
$("exportBtn").onclick = exportBackup;
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importBackup(f); };
$("clearBtn").onclick = clearAll;
document.addEventListener("keydown", onKey);
init();
