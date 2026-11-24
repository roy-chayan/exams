/* Rapid fire: a few seconds a question (5 unless changed). Every second ticks and the last one beeps higher; when the
   time runs out, the correct answer is marked, with its own sound, and the next question comes. An answer given in
   time sounds right or wrong and shows the correct one. There is no minus mark and no going back.
   - Chosen with "Exam type" in Exam settings. The papers, subjects, Random / Unseen first / My mistakes and "Group
     questions by subject" work as for a normal exam. Math starts unticked (most of it needs working out).
   - It ends on the usual result screen and review; a question that ran out counts as Skipped, and the answers feed
     "My mistakes" as usual. In Progress it is listed with the other exams but left out of "By subject".
   - The round lives only in the page's memory: unlike a normal exam it isn't resumed after a reload.
   - The sounds are made by the browser (Web Audio), so there are no sound files.
   Uses app.js's helpers and its finish() for the result, so it loads after it. */
"use strict";
(() => {
  const SETTINGS = "ntrca_rapid";                            // { on, secs, sound, mathOff }, kept on this device
  const HOLD = { right: 800, wrong: 1600, out: 1300 };      // how long the marked answer stays before the next question
  const clampSecs = v => Math.min(60, Math.max(2, Math.round(Number(v)) || 5));
  const cfg = Object.assign({ on: false, secs: 5, sound: true, mathOff: false }, store.get(SETTINGS, {}) || {});
  cfg.secs = clampSecs(cfg.secs);
  const save = () => store.set(SETTINGS, cfg);
  let rf = null, timer = 0, nextTimer = 0;

  /* ---------- sounds ---------- */
  // A phone only allows sound after a tap, so Start (and Test sound) call unlock() inside the tap.
  const SOUND = (() => {
    let ctx = null;
    const get = () => {
      try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); }
      catch (e) { ctx = null; }
      return ctx;
    };
    const tone = (freq, at, dur, type = "sine", vol = 0.2) => {
      const c = get(); if (!c) return;
      const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.03);
    };
    // One soft chime note: a sine with a faint octave above it, both dying away quickly (like a small marimba).
    const chime = (freq, at) => { tone(freq, at, 0.5, "sine", 0.11); tone(freq * 2, at, 0.25, "sine", 0.025); };
    const play = f => () => { if (cfg.sound) f(); };
    return {
      unlock: get,
      tick: play(() => tone(1050, 0, 0.05, "square", 0.05)),                                    // each second
      last: play(() => { tone(1568, 0, 0.16, "square", 0.08); tone(1568, 0.2, 0.16, "square", 0.08); }),   // the last second
      // Time is up, the answer is marked: two soft chime notes going down (going up is the "right" sound). It is
      // kept a little quieter than the others; the downloaded recording used before was about twice as loud.
      out: play(() => { chime(1319, 0); chime(988, 0.14); }),
      right: play(() => { tone(659, 0, 0.12, "sine", 0.22); tone(988, 0.1, 0.26, "sine", 0.22); }),
      wrong: play(() => tone(155, 0, 0.34, "sawtooth", 0.09))
    };
  })();

  /* ---------- settings ---------- */
  const isRapid = () => cfg.on;
  const mathBox = () => document.querySelector('#subjPick input[value="math"]');
  const aboutTime = n => { const s = n * cfg.secs; return s < 60 ? `${s} seconds in all` : `about ${Math.ceil(s / 60)} min in all`; };
  // For app.js's plan line: "20 questions · 5 per subject · 5 seconds each · about 2 min in all".
  window.NTRCA_RAPID = { on: isRapid, plan: n => `${cfg.secs} seconds each · ${aboutTime(n)}` };

  function renderType() {
    document.querySelectorAll('input[name="etype"]').forEach(i => (i.checked = (i.value === "rapid") === cfg.on));
    show("minsField", !cfg.on); show("negField", !cfg.on); show("secsField", cfg.on); show("rfSoundRow", cfg.on);
    $("secs").value = cfg.secs;
    $("rfSound").checked = cfg.sound;
    $("startBtn").textContent = cfg.on ? "Start rapid fire" : "Start exam";
    $("etypeHelp").textContent = cfg.on ? "Each question gets a few seconds, with a tick every second. When the time runs out the correct answer is shown and the next question comes. No minus mark, no going back." : "";
    show("etypeHelp", cfg.on);
    show("rfMathHint", cfg.on && cfg.mathOff && !mathBox().checked);
    renderPlan();
  }
  // Rapid fire starts with Math unticked (when other subjects are ticked too); going back to Normal ticks it again.
  function setType(on) {
    if (on === cfg.on) return;
    cfg.on = on;
    const m = mathBox(), others = [...document.querySelectorAll("#subjPick input:checked")].some(i => i !== m);
    if (on && m.checked && others) { m.checked = false; cfg.mathOff = true; }
    else if (!on && cfg.mathOff) { m.checked = true; cfg.mathOff = false; }
    save(); renderSubjHelp(); saveSettings(); renderType();
  }
  document.querySelectorAll('input[name="etype"]').forEach(i => i.addEventListener("change", () => setType(i.value === "rapid")));
  $("subjPick").addEventListener("change", e => {
    if (e.target === mathBox() && e.target.checked) { cfg.mathOff = false; save(); }   // ticked by hand: it stays
    renderType();
  });
  $("secs").addEventListener("input", () => { if ($("secs").value !== "") { cfg.secs = clampSecs($("secs").value); save(); renderPlan(); } });
  $("secs").addEventListener("change", () => { cfg.secs = clampSecs($("secs").value); $("secs").value = cfg.secs; save(); renderPlan(); });
  const setSound = on => { cfg.sound = on; $("rfSound").checked = $("rfSound2").checked = on; save(); };
  $("rfSound").onchange = () => setSound($("rfSound").checked);
  $("rfSound2").onchange = () => setSound($("rfSound2").checked);
  $("rfTest").onclick = () => {
    SOUND.unlock();
    if (!cfg.sound) { setSound(true); }
    [[SOUND.tick, 0], [SOUND.tick, 600], [SOUND.last, 1200], [SOUND.out, 1900]].forEach(([f, ms]) => setTimeout(f, ms));
  };

  // The Start button runs a rapid-fire round when that type is chosen, otherwise the normal exam (app.js).
  $("startBtn").onclick = () => (cfg.on ? startRapid() : start());

  /* ---------- the round ---------- */
  async function startRapid() {
    setNote("setupWarn");
    SOUND.unlock();                                  // inside the tap, so a phone lets the round make sounds
    const names = checkedSets(), mode = getMode(), subjects = getSubjects(), n = parseInt($("count").value, 10);
    cfg.secs = clampSecs($("secs").value); $("secs").value = cfg.secs; save();
    if (!names.length) return setNote("setupWarn", "Select at least one question set.");
    if (!(n >= 1)) return setNote("setupWarn", "Enter at least 1 question.");
    saveSettings();
    $("startBtn").disabled = true;
    const { pool, errors } = await buildPool(names);
    $("startBtn").disabled = false;
    if (errors.length) return setNote("setupWarn", errors.map(esc).join("<br>"));
    const { picked, notes } = pickQuestions(pool, n, mode, getStats(), subjects);
    if (!picked.length) {
      const what = subjectsLabel(subjects) ? `${subjectsLabel(subjects).replace(" only", "")} questions` : "questions";
      return setNote("setupWarn", mode === "mistakes" ? "No past mistakes in the selected sets. Pick “Random” or “Unseen first” instead." : `No ${esc(what)} found in the selected sets.`);
    }
    const questions = $("group").checked ? SUBJECTS.flatMap(s => picked.filter(q => q.subject === s)) : picked;
    rf = { questions, answers: questions.map(() => null), i: 0, secs: cfg.secs, sets: names, mode, subjects, notes, used: 0 };
    showScreen("rapid");
    $("rfTotal").textContent = questions.length;
    $("rfSound2").checked = cfg.sound;
    showQuestion();
  }

  const rightCount = () => rf.answers.filter((a, k) => a !== null && a === rf.questions[k].answer).length;

  function showQuestion() {
    clearInterval(timer); clearTimeout(nextTimer);
    if (!rf) return;
    const q = rf.questions[rf.i];
    rf.locked = false; rf.paused = false; rf.left = rf.secs * 1000; rf.shown = null;
    $("rfNum").textContent = rf.i + 1;
    $("rfRight").textContent = rightCount();
    $("rfBar").style.width = (rf.i / rf.questions.length) * 100 + "%";
    $("rfTag").textContent = LABEL[q.subject] || q.subject;
    $("rfText").textContent = q.question;
    const o = $("rfOpts"); o.innerHTML = "";
    q.options.forEach((t, i) => { const b = optionEl("button", t, i); b.onclick = () => answer(i); o.appendChild(b); });
    $("rapid").classList.remove("paused", "low");
    show("rfPaused", false); $("rfPause").textContent = "Pause";
    const ring = $("rfRing");
    ring.style.animationDuration = rf.secs + "s";
    ring.classList.remove("run", "stop"); void ring.getBoundingClientRect(); ring.classList.add("run");   // restart the ring
    go();
    if (document.hidden) pause();                    // the next question came while another tab was in front
  }
  function go() {
    rf.deadline = Date.now() + rf.left;
    timer = setInterval(onTick, 50); onTick();
  }
  // Every whole second: a tick, the last one a higher double beep; at zero the correct answer is marked.
  function onTick() {
    if (!rf) return clearInterval(timer);
    const left = rf.deadline - Date.now(), s = Math.max(0, Math.ceil(left / 1000));
    if (s !== rf.shown) {
      rf.shown = s;
      $("rfSec").textContent = s;
      $("rapid").classList.toggle("low", s === 1);
      if (s > 1) SOUND.tick(); else if (s === 1) SOUND.last();
    }
    if (left <= 0) answer(null);
  }
  /* i: the option tapped, or null when the time ran out. The options are redrawn as they look in the review. */
  function answer(i) {
    if (!rf || rf.locked || rf.paused) return;
    rf.locked = true; clearInterval(timer);
    rf.used += rf.secs * 1000 - Math.max(0, rf.deadline - Date.now());   // the time this question took
    $("rfRing").classList.add("stop");
    const q = rf.questions[rf.i], o = $("rfOpts");
    if (i !== null) rf.answers[rf.i] = i;
    const mark = j => (j === q.answer ? (i === null ? "Time's up · correct answer" : i === j ? "Correct" : "Correct answer") : j === i ? "Your answer" : "");
    o.innerHTML = "";
    q.options.forEach((t, j) => o.appendChild(optionEl("div", t, j, j === q.answer ? "right" : j === i ? "wrong" : "", mark(j))));
    let hold;
    if (i === null) { SOUND.out(); hold = HOLD.out; }
    else if (i === q.answer) { SOUND.right(); hold = HOLD.right; }
    else { SOUND.wrong(); hold = HOLD.wrong; }
    $("rfRight").textContent = rightCount();
    nextTimer = setTimeout(() => {
      if (!rf) return;
      if (rf.i + 1 >= rf.questions.length) return end();
      rf.i++; showQuestion();
    }, hold);
  }
  function pause() {
    if (!rf || rf.paused || rf.locked) return;
    clearInterval(timer);
    rf.left = Math.max(0, rf.deadline - Date.now()); rf.paused = true;
    $("rapid").classList.add("paused"); show("rfPaused", true); $("rfPause").textContent = "Resume";
  }
  function resume() {
    if (!rf || !rf.paused) return;
    SOUND.unlock();
    rf.paused = false;
    $("rapid").classList.remove("paused"); show("rfPaused", false); $("rfPause").textContent = "Pause";
    rf.shown = null; go();
  }
  /* The usual result screen (app.js's finish). Only the questions that came up count: ending early doesn't turn the
     rest into "Skipped" mistakes. */
  function end() {
    if (!rf) return;
    clearInterval(timer); clearTimeout(nextTimer);
    const reached = Math.min(rf.questions.length, rf.i + 1), now = Date.now(), startedAt = now - rf.used;
    exam = { questions: rf.questions.slice(0, reached), answers: rf.answers.slice(0, reached), flags: Array(reached).fill(false), cur: 0,
      sets: rf.sets, mode: "rapid", subjects: rf.subjects, neg: 0, notes: rf.notes, startedAt, endAt: startedAt + reached * rf.secs * 1000, rapid: rf.secs };
    rf = null;
    finish(true);
  }

  $("rfPause").onclick = () => (rf && rf.paused ? resume() : pause());
  $("rfResume").onclick = resume;
  $("rfEnd").onclick = () => {
    if (!rf) return;
    const was = rf.paused; pause();
    if (confirm(`End here? Your result will count the ${rf.i + 1} question${rf.i ? "s" : ""} you have seen.`)) end();
    else if (!was) resume();
  };
  // Switching to another tab or app pauses the round; it never runs on unseen.
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  document.addEventListener("keydown", e => {
    if (!rf || $("rapid").classList.contains("hidden") || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase(), i = /^[1-4]$/.test(k) ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
    if (i >= 0 && i < rf.questions[rf.i].options.length) answer(i);
    else if (k === " ") (rf.paused ? resume() : pause());
    else return;
    e.preventDefault();
  });

  renderType();
})();
