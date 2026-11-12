/* The "Subjects" tab: an exam on chosen topics of one subject.
   Math is real: its topics come from data/topics-math.js (collected from the পড়াশোনা site's math notes),
   the counts and scores from your question files and saved answers, and Start runs a normal exam.
   GK, English and Bengali still show the made-up data below and can't be started.
   Uses app.js's helpers and exam functions (exam, buildPool, pickQuestions, openExam, …), so it loads after it. */
"use strict";
(() => {
  const BN = { gk: "সাধারণ জ্ঞান", math: "গণিত", english: "ইংরেজি", bengali: "বাংলা" };
  // Made-up data for subjects not collected yet: [group, [[topic, questions, your accuracy % or null], ...]]
  const FAKE = {
    gk: { last: "Yesterday", groups: [
      ["বাংলাদেশ বিষয়াবলি", [["মুক্তিযুদ্ধ ও ইতিহাস", 64, 72], ["সংবিধান", 38, 55], ["ভূগোল ও পরিবেশ", 41, 48], ["অর্থনীতি", 29, 35], ["সংস্কৃতি ও ঐতিহ্য", 33, 61]]],
      ["আন্তর্জাতিক বিষয়াবলি", [["সংস্থা ও সংগঠন", 45, 58], ["দেশ ও রাজধানী", 27, 80], ["চুক্তি ও সম্মেলন", 22, null]]],
      ["বিজ্ঞান ও প্রযুক্তি", [["সাধারণ বিজ্ঞান", 56, 52], ["কম্পিউটার ও আইসিটি", 31, 44]]]
    ] },
    english: { last: "2 days ago", groups: [
      ["Grammar", [["Parts of speech", 40, 48], ["Tense & verb", 35, 57], ["Voice & narration", 22, 71], ["Preposition", 30, 39], ["Sentence correction", 28, 46]]],
      ["Vocabulary", [["Synonym & antonym", 52, 42], ["Spelling", 18, 77], ["Idioms & phrases", 26, 35], ["One-word substitution", 14, null]]],
      ["Literature", [["English literature", 38, 29]]]
    ] },
    bengali: { last: "Today", groups: [
      ["ব্যাকরণ", [["ধ্বনি ও বর্ণ", 30, 66], ["সন্ধি", 26, 58], ["সমাস", 31, 38], ["কারক ও বিভক্তি", 22, 47], ["প্রকৃতি ও প্রত্যয়", 18, 44], ["শুদ্ধ বানান", 24, 71], ["বাগধারা ও প্রবাদ", 28, 62], ["সমার্থক ও বিপরীত শব্দ", 35, 69]]],
      ["সাহিত্য", [["প্রাচীন ও মধ্যযুগ", 34, 52], ["রবীন্দ্রনাথ ও নজরুল", 40, 64], ["আধুনিক সাহিত্য", 46, 41], ["ছদ্মনাম ও উপাধি", 19, null]]]
    ] }
  };
  const REAL = window.NTRCA_TOPICS || {};
  const STUDY_DIR = STUDY_URL.replace(/index\.html$/, "");
  const WEAK = 50;

  const radio = name => (document.querySelector(`input[name="${name}"]:checked`) || {}).value;
  const level = p => (p === null ? "none" : p >= 60 ? "good" : p >= 40 ? "mid" : "low");
  const ratio = (r, t) => (t ? Math.round((r / t) * 100) : null);

  function lastExam(s) {
    const x = getHistory().find(h => h.subj && Array.isArray(h.subj[s]) && Number(h.subj[s][1]) > 0);
    return x ? daysAgo(x.date) : "Not yet";
  }

  /* One subject as groups of rows {key, name, n, done, acc, ids}. Accuracy counts each question you've
     answered once, by how you did on it last time. `all` includes BCS questions whatever the setting. */
  function model(s, all = false) {
    const bcs = all || radio("sxsrc") === "bcs";
    const t = REAL[s];
    if (t) {
      const stats = getStats();
      let tDone = 0, tRight = 0;
      const groups = t.topics.map((topic, ti) => ({
        name: topic.name, note: topic.note,
        rows: topic.groups.map((g, gi) => {
          const ids = g.ids.filter(id => bcs || !id.startsWith("bcs-"));
          let done = 0, right = 0;
          ids.forEach(id => { const st = own(stats, id); if (st && st.s) { done++; if (st.l === "r") right++; } });
          tDone += done; tRight += right;
          return { key: `${ti}:${gi}`, name: g.name, ids, n: ids.length, done, acc: ratio(right, done) };
        }).filter(r => r.n)
      }));
      return { real: true, groups, acc: ratio(tRight, tDone), last: lastExam(s) };
    }
    const f = FAKE[s] || { last: "", groups: [] };
    const groups = f.groups.map(([name, list]) => ({
      name, rows: list.map(([topic, n, acc]) => ({ key: topic, name: topic, n: bcs ? Math.round(n * 1.45) : n, done: 0, acc }))
    }));
    const tried = groups.flatMap(g => g.rows).filter(r => r.acc !== null), w = tried.reduce((a, r) => a + r.n, 0);
    return { real: false, groups, acc: w ? Math.round(tried.reduce((a, r) => a + r.n * r.acc, 0) / w) : null, last: f.last };
  }

  const rowsOf = m => m.groups.flatMap(g => g.rows);
  const picked = Object.fromEntries(SUBJECTS.map(s => [s, new Set(rowsOf(model(s, true)).map(r => r.key))]));
  let cur = REAL.math ? "math" : "bengali";

  function renderSubjectTiles() {
    $("sxSubjects").innerHTML = SUBJECTS.map(s => {
      const m = model(s), rows = rowsOf(m), p = m.acc;
      const topics = m.groups.filter(g => g.rows.length).length;
      return `<button type="button" class="sx-subj lvl-${level(p)}${s === cur ? " on" : ""}" data-s="${s}" aria-pressed="${s === cur}">` +
        `<span class="sx-shead"><span class="sx-sname">${LABEL[s]}</span><span class="sx-sbn">${BN[s]}</span></span>` +
        `<span class="sx-sval">${p === null ? "–" : p + "%"}</span><span class="meter"><span style="width:${p || 0}%"></span></span>` +
        `<span class="stat-foot">${rows.reduce((a, r) => a + r.n, 0)} questions</span><span class="stat-foot">${topics} topics</span>` +
        (m.real ? `<span class="stat-foot">Last: ${esc(m.last)}</span>` : '<span class="stat-foot sx-fake">Made-up data</span>') + "</button>";
    }).join("");
  }

  function renderTopics() {
    const m = model(cur), sel = picked[cur];
    $("sxTopicTitle").textContent = `${LABEL[cur]} topics`;
    $("sxSource").innerHTML = m.real ? `From the পড়াশোনা notes · ${rowsOf(m).reduce((a, r) => a + r.n, 0)} questions` : '<span class="sx-fake">Made-up data</span>';
    $("sxTopics").innerHTML = m.groups.map((g, gi) => {
      const all = g.rows.length && g.rows.every(r => sel.has(r.key));
      const link = g.note ? `<a class="textbtn sx-note" href="${esc(encodeURI(STUDY_DIR + g.note))}" target="_blank" rel="noopener">নোট ↗</a>` : "";
      const head = `<div class="sx-ghead"><span class="sx-gname">${esc(g.name)}</span>` +
        `<span class="muted">${m.real ? `${g.rows.reduce((a, r) => a + r.n, 0)} questions` : `${g.rows.length} topics`}</span>${link}` +
        (g.rows.length ? `<button type="button" class="textbtn" data-group="${gi}">${all ? "Clear" : "Select all"}</button>` : "") + "</div>";
      if (!g.rows.length) return `<div class="sx-group">${head}<p class="hint flush">No MCQs for this topic in the study note yet.</p></div>`;
      return `<div class="sx-group">${head}<div class="sx-tlist">` + g.rows.map(r => {
        const on = sel.has(r.key);
        const tag = r.acc === null ? '<span class="status st-u">New</span>' : r.acc < WEAK ? '<span class="status st-w">Weak</span>' : "";
        return `<label class="sx-topic${on ? " on" : ""}"><input type="checkbox" value="${esc(r.key)}"${on ? " checked" : ""}>` +
          `<span class="box">${CHECK_ICON}</span><span class="sx-tmain"><span class="sx-tname">${esc(r.name)}${tag}</span>` +
          `<span class="sx-tcount">${r.n} questions${r.done ? ` · ${r.done} done` : ""}</span></span>` +
          `<span class="sx-tacc lvl-${level(r.acc)}"><b>${r.acc === null ? "–" : r.acc + "%"}</b><span class="meter"><span style="width:${r.acc || 0}%"></span></span></span></label>`;
      }).join("") + "</div></div>";
    }).join("");
  }

  /* Rows ticked for the current subject, and how many questions an exam could draw from them. */
  function choice() {
    const m = model(cur), rows = rowsOf(m).filter(r => picked[cur].has(r.key));
    let pool = rows.reduce((a, r) => a + r.n, 0);
    if (m.real && radio("sxmode") === "mistakes") {
      const stats = getStats();
      pool = new Set(rows.flatMap(r => r.ids).filter(id => isMistake(own(stats, id)))).size;
    }
    return { m, rows, pool };
  }

  function renderPlan() {
    const { m, rows, pool } = choice(), n = Math.min(Number(radio("sxn")) || 25, pool);
    const what = radio("sxmode") === "mistakes" && m.real ? "past mistakes" : "questions";
    $("sxSel").innerHTML = rows.length ? `${esc(examTitle(m, rows).replace(": ", " › "))} · ${pool} ${what} to pick from` : "No topics chosen";
    const neg = parseFloat($("neg").value) || 0;
    $("sxPlan").innerHTML = !rows.length ? "Pick at least one topic" : !n ? "No past mistakes in these topics"
      : `<span>${n} questions</span> · <span>${Math.max(1, Math.round(n * 0.6))} minutes</span>` + (neg ? ` · <span>−${neg} per wrong answer</span>` : "");
    $("sxStart").disabled = !n;
    $("sxStart").textContent = `Start ${LABEL[cur]} exam`;
    setNote("sxNote");
  }

  const renderAll = () => { renderSubjectTiles(); renderTopics(); renderPlan(); };

  $("sxSubjects").onclick = e => { const b = e.target.closest("[data-s]"); if (b) { cur = b.dataset.s; renderAll(); } };
  $("sxTopics").onchange = e => {
    const sel = picked[cur], v = e.target.value;
    if (e.target.checked) sel.add(v); else sel.delete(v);
    renderTopics(); renderPlan();
  };
  $("sxTopics").onclick = e => {
    const b = e.target.closest("[data-group]"); if (!b) return;
    const rows = model(cur).groups[b.dataset.group].rows, sel = picked[cur], all = rows.every(r => sel.has(r.key));
    rows.forEach(r => (all ? sel.delete(r.key) : sel.add(r.key)));
    renderTopics(); renderPlan();
  };
  $("sxQuick").onclick = e => {
    const b = e.target.closest("[data-quick]"); if (!b) return;
    const keep = { all: () => true, weak: r => r.acc !== null && r.acc < WEAK, fresh: r => r.acc === null, none: () => false }[b.dataset.quick];
    picked[cur] = new Set(rowsOf(model(cur)).filter(keep).map(r => r.key));
    renderTopics(); renderPlan();
  };
  $("sxSettings").onchange = renderAll;
  /* "Math: all topics", or the ticked topics: a whole note by its name, otherwise its ticked parts. */
  function examTitle(m, rows) {
    const on = new Set(rows.map(r => r.key));
    if (rowsOf(m).every(r => on.has(r.key))) return `${LABEL[cur]}: all topics`;
    const parts = m.groups.flatMap(g => (g.rows.length && g.rows.every(r => on.has(r.key)) ? [g.name] : g.rows.filter(r => on.has(r.key)).map(r => r.name)));
    return `${LABEL[cur]}: ` + (parts.length <= 2 ? parts.join(", ") : `${parts.slice(0, 2).join(", ")} +${parts.length - 2} more`);
  }

  /* A normal exam (same timer, saving, resume, result and review as the Practice tab), drawn only from
     the ticked topics. The minus mark is the one set on the Practice tab. */
  async function startTopicExam() {
    setNote("sxNote");
    const { m, rows, pool: available } = choice();
    if (!m.real) return setNote("sxNote", `${LABEL[cur]} topics haven't been collected from the পড়াশোনা site yet, so there are no real questions to start.`);
    const mode = radio("sxmode"), n = Math.min(Number(radio("sxn")) || 25, available), neg = parseFloat($("neg").value) || 0;
    if (!n) return;
    if (store.get(KEY.current, null) && !confirm("You have an unfinished exam. Start a new one and discard it?")) return;
    const ids = new Set(rows.flatMap(r => r.ids));
    const names = [...new Set([...ids].map(id => id.replace(/-\d+$/, "")))].filter(x => setNames.includes(x));
    $("sxStart").disabled = true;
    const { pool, errors } = await buildPool(names);
    $("sxStart").disabled = false;
    const { picked, notes } = pickQuestions(pool.filter(q => q.subject === cur && ids.has(q.id)), n, mode, getStats(), [cur]);
    if (!picked.length) return setNote("sxNote", errors.length ? errors.map(esc).join("<br>") : "No questions found for these topics.");
    const now = Date.now();
    exam = { questions: picked, answers: picked.map(() => null), flags: picked.map(() => false), cur: 0,
      sets: [...new Set(picked.map(q => q.set))], mode, subjects: [cur], neg, notes: [...errors, ...notes],
      title: examTitle(m, rows), startedAt: now, endAt: now + Math.max(1, Math.round(picked.length * 0.6)) * 60000 };
    saveExam(); show("resumeCard", false); openExam();
  }
  $("sxStart").onclick = startTopicExam;
  // Scores change after every exam, so redraw whenever the tab is opened.
  document.querySelector('#tabs [data-tab="subjects"]').addEventListener("click", renderAll);

  renderAll();
})();
