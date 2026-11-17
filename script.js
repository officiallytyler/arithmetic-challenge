"use strict";
/* Tyler's Arithmetic Challenge - script.js
   Sections: 1 Difficulty settings | 2 Challenge generator | 3 Page elements & saved data
             4 Drawing the board   | 5 Game flow            | 6 Controls */

/* ================= 1. DIFFICULTY SETTINGS =================
   start    = range for the starting number
   min/max  = every number along the way must stay inside this range
   endMax   = the final answer must be no bigger than this
   families = which kinds of instruction can appear, with a weight (higher = more common)
   maxKind  = most times one kind may appear in a challenge (default 3)
   need     = kinds that MUST appear at least this many times
   minKinds = how many different kinds a challenge must contain */
const LEVELS = {
  easy: {
    start: [2, 12], min: 1, max: 40, endMax: 30, minKinds: 4, need: {},
    families: [["add", 3], ["sub", 3], ["double", 3], ["half", 3], ["treble", 1], ["square", 1], ["mul", 1]],
    add: [1, 9], sub: [1, 9], mul: [2, 3, 4, 5],
    maxKind: { treble: 1, square: 1, mul: 1 }
  },
  medium: {
    start: [4, 20], min: 2, max: 100, endMax: 80, minKinds: 5, need: { frac: 1 },
    families: [["add", 2], ["sub", 2], ["double", 3], ["half", 3], ["mul", 2], ["div", 2], ["treble", 1], ["square", 1], ["frac", 2]],
    add: [3, 20], sub: [3, 20], mul: [2, 3, 4, 5, 6, 7, 8, 9], div: [2, 3, 4, 5],
    frac: [[1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5]],
    maxKind: { treble: 1, square: 1, mul: 2, frac: 2 }
  },
  hard: {
    start: [8, 40], min: 2, max: 150, endMax: 120, minKinds: 5, need: { frac: 1, pct: 1 },
    families: [["add", 2], ["sub", 2], ["double", 2], ["half", 2], ["mul", 1], ["div", 2], ["treble", 1], ["square", 1], ["frac", 3], ["pct", 3]],
    add: [5, 30], sub: [5, 30], mul: [2, 3, 4, 5, 6, 7, 8, 9], div: [2, 3, 4, 5, 6],
    frac: [[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [5, 6]],
    pct: [10, 20, 25, 30, 75], inc: [10, 20, 25, 50], dec: [10, 20, 25, 50],
    maxKind: { treble: 1, square: 1, mul: 2, div: 2, frac: 2, pct: 2 }
  }
};

/* ================= 2. CHALLENGE GENERATOR ================= */
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const fracHTML = (n, d) => `<span class="frac"><b>${n}</b><b>${d}</b></span> of this`;

// A "builder" lists every move of one kind that is possible from the current number v.
// to = the number after the move. Only whole-number moves are ever listed.
const BUILDERS = {
  add: (v, c) => range(...c.add).map(n => ({ n, key: "+" + n, html: "+" + n, to: v + n })),
  sub: (v, c) => range(...c.sub).map(n => ({ n, key: "-" + n, html: "−" + n, to: v - n })),
  mul: (v, c) => c.mul.map(n => ({ n, key: "×" + n, html: "×" + n, to: v * n })),
  div: (v, c) => c.div.filter(n => v % n === 0).map(n => ({ n, key: "÷" + n, html: "÷" + n, to: v / n })),
  double: v => [{ n: 2, key: "dbl", html: "Double it", long: true, to: v * 2 }],
  half: v => (v % 2 === 0 ? [{ n: 2, key: "half", html: "Halve it", long: true, to: v / 2 }] : []),
  treble: v => [{ n: 3, key: "tre", html: "Treble it", long: true, to: v * 3 }],
  square: v => (v > 1 ? [{ n: 1, key: "sq", html: "Times it by itself", long: true, to: v * v }] : []),
  frac: (v, c) => c.frac.filter(([n, d]) => v % d === 0)
    .map(([n, d]) => ({ n: n + "/" + d, key: "f" + n + d, html: fracHTML(n, d), long: true, to: (v / d) * n })),
  pct: (v, c) => [
    ...c.pct.filter(x => (v * x) % 100 === 0).map(x => ({ n: x, key: "p" + x, html: x + "% of this", long: true, to: (v * x) / 100 })),
    ...c.inc.filter(x => (v * x) % 100 === 0).map(x => ({ n: x, key: "i" + x, html: "Increase by " + x + "%", long: true, to: v + (v * x) / 100 })),
    ...c.dec.filter(x => (v * x) % 100 === 0).map(x => ({ n: x, key: "d" + x, html: "Decrease by " + x + "%", long: true, to: v - (v * x) / 100 }))
  ]
};
// Pairs that would simply undo each other (e.g. ×3 then ÷3) are not allowed next to each other.
const UNDO = { add: ["sub"], sub: ["add"], mul: ["div"], div: ["mul", "treble", "double"], treble: ["div"], double: ["half", "div"], half: ["double", "mul"] };

function buildChallenge(level) {
  const c = LEVELS[level];
  for (let attempt = 0; attempt < 3000; attempt++) {
    const strict = attempt < 1500;           // after 1500 tries, relax the "variety" rules
    const start = rand(...c.start);
    let v = start, failed = false;
    const steps = [], counts = {};

    for (let i = 0; i < 9; i++) {
      const prev = steps[steps.length - 1];
      const options = [];
      for (const [kind, weight] of c.families) {
        if ((counts[kind] || 0) >= (c.maxKind[kind] || 3)) continue;
        const list = BUILDERS[kind](v, c).filter(o =>
          o.to >= c.min && o.to <= c.max && o.to !== v &&
          !(prev && (prev.key === o.key || ((UNDO[prev.kind] || []).includes(kind) && prev.n === o.n))));
        if (list.length) options.push({ kind, weight, list });
      }
      if (!options.length) { failed = true; break; }

      // choose a kind by weight, then a random move of that kind
      let r = Math.random() * options.reduce((sum, o) => sum + o.weight, 0), chosen = options[0];
      for (const o of options) { r -= o.weight; if (r <= 0) { chosen = o; break; } }
      const step = { ...pick(chosen.list), kind: chosen.kind };
      steps.push(step);
      counts[chosen.kind] = (counts[chosen.kind] || 0) + 1;
      v = step.to;
    }
    if (failed || v > c.endMax) continue;   // the final answer must stay small
    if (strict) {
      if (Object.keys(counts).length < c.minKinds) continue;
      if (Object.entries(c.need).some(([k, n]) => (counts[k] || 0) < n)) continue;
    }
    return { start, steps, answer: v };
  }
}

/* ================= 3. PAGE ELEMENTS & SAVED DATA ================= */
const $ = id => document.getElementById(id) || console.error("Missing element #" + id);
const el = {
  grid: $("grid"), board: $("board"), answerTile: $("answerTile"), input: $("answerInput"),
  submitBtn: $("submitBtn"), startBtn: $("startBtn"), timerBtn: $("timerBtn"), timerText: $("timerText"),
  timerHint: $("timerHint"), status: $("roundStatus"), newBtn: $("newBtn"), resetBtn: $("resetBtn"),
  difficultyGroup: $("difficultyGroup"), timeSlider: $("timeSlider"), timeValue: $("timeValue")
};
// Jigsaw colours follow the difficulty: greens, yellows/oranges, reds
const PALETTES = {
  easy:   ["#bbf7d0", "#86efac", "#d9f99d", "#a7f3d0", "#bef264", "#6ee7b7"],
  medium: ["#fef08a", "#fdba74", "#fde047", "#fed7aa", "#fcd34d", "#fb923c"],
  hard:   ["#fecaca", "#fca5a5", "#fda4af", "#f87171", "#fecdd3", "#fb7185"]
};
const RING = p => (p > 50 ? "#16a34a" : p > 25 ? "#f59e0b" : "#dc2626");  // timer ring: green -> amber -> red

const KEY = "tylersArithmeticChallenge.v2";   // saved: difficulty and time limit
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && LEVELS[d.level]) return { level: d.level, time: Math.min(45, Math.max(5, Math.round((Number(d.time) || 30) / 5) * 5)) };
  } catch (e) {}
  return { level: "easy", time: 30 };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

let data = load();
let state = "ready";            // "ready" -> "running" -> "done"
let challenge, startedAt = 0, timerId = null;

/* ================= 4. DRAWING THE BOARD ================= */
function renderBoard() {
  el.grid.querySelectorAll(".tile:not(.answer)").forEach(t => t.remove());
  const items = [
    { badge: "Start", html: String(challenge.start), cls: "first", run: "" },
    ...challenge.steps.map((s, i) => ({ badge: i + 1, html: s.html, cls: s.long ? "long" : "", run: "= " + s.to }))
  ];
  items.forEach((it, i) => {
    const t = document.createElement("div");
    t.className = "tile " + it.cls;
    t.style.setProperty("--i", i);
    t.style.setProperty("--z", 20 - i);
    if (i) t.style.setProperty("--fill", PALETTES[data.level][(i - 1) % 6]);
    t.innerHTML = `<span class="badge">${it.badge}</span><div class="label">${it.html}</div><span class="run">${it.run}</span>`;
    el.grid.insertBefore(t, el.answerTile);
  });
  el.answerTile.style.setProperty("--i", 10);
  el.answerTile.style.setProperty("--z", 10);
  layoutJigsaw();
}

// Decides which tiles get tabs (r, b) and notches (l, t) so neighbours interlock.
// The grid has 11 pieces: 10 numbered tiles (index 0-9) + the answer tile (index 10).
function layoutJigsaw() {
  const cols = getComputedStyle(el.grid).gridTemplateColumns.split(" ").length;
  [...el.grid.children].forEach((t, i) => {
    const col = i % cols;
    t.classList.toggle("l", col > 0);                 // a piece to my left -> cut a notch
    t.classList.toggle("r", col < cols - 1 && i < 10); // a piece to my right -> grow a tab
    t.classList.toggle("t", i >= cols && i <= 9);     // a numbered piece above me -> notch
    t.classList.toggle("b", i + cols <= 9);           // a numbered piece below me -> tab
  });
}

/* ================= 5. GAME FLOW ================= */
function setState(s) {
  state = s;
  el.board.classList.toggle("ready", s === "ready");
  el.board.classList.toggle("done", s === "done");
  el.input.disabled = el.submitBtn.disabled = s !== "running";
}

function setRing(percent, colour) {
  el.timerBtn.style.setProperty("--p", percent);
  el.timerBtn.style.setProperty("--c", colour);
}

function resetTimerUI() {
  clearInterval(timerId);
  el.timerText.textContent = data.time;
  el.timerHint.textContent = "seconds";
  el.timerBtn.classList.remove("low");
  setRing(100, RING(100));
}

function newChallenge() { challenge = buildChallenge(data.level); prepare(); }

// Gets a challenge ready to play (used by "New challenge", "Reset" and changing the time limit).
function prepare() {
  el.board.classList.remove("correct", "wrong");
  el.answerTile.classList.remove("correct", "wrong", "shake");
  el.input.value = "";
  el.status.textContent = "";
  el.status.className = "status";
  resetTimerUI();
  renderBoard();
  setState("ready");
  el.startBtn.focus({ preventScroll: true });
}

function startRound() {
  if (state !== "ready") return;
  setState("running");
  startedAt = performance.now();
  el.timerHint.textContent = "tap to submit";
  timerId = setInterval(tick, 100);
  tick();
  el.input.focus();
}

function tick() {
  const left = data.time - (performance.now() - startedAt) / 1000;
  if (left <= 0) { finish("timeout"); return; }
  const percent = (left / data.time) * 100;
  el.timerText.textContent = Math.ceil(left);
  setRing(percent, RING(percent));
  el.timerBtn.classList.toggle("low", left <= 5);
}

function submit() {
  if (state !== "running") return;
  const text = el.input.value.trim();
  if (!/^-?\d+$/.test(text)) {          // not a whole number: shake and let them try again
    el.answerTile.classList.remove("shake");
    void el.answerTile.offsetWidth;     // restarts the animation
    el.answerTile.classList.add("shake");
    return;
  }
  finish(Number(text) === challenge.answer ? "correct" : "wrong");
}

function finish(result) {             // result: "correct", "wrong" or "timeout"
  clearInterval(timerId);
  const ok = result === "correct";
  const elapsed = result === "timeout" ? data.time : Math.min(data.time, (performance.now() - startedAt) / 1000);
  const typed = el.input.value.trim();
  setState("done");
  if (document.activeElement) document.activeElement.blur();   // so Enter can start the next one

  el.timerBtn.classList.remove("low");
  el.timerText.textContent = elapsed.toFixed(1);
  el.timerHint.textContent = "seconds taken";
  setRing(100, ok ? "#22c55e" : "#ef4444");
  el.board.classList.add(ok ? "correct" : "wrong");
  el.answerTile.classList.add(ok ? "correct" : "wrong");
  el.status.className = "status " + (ok ? "ok" : "bad");

  if (ok) {
    el.status.textContent = `Correct! ${elapsed.toFixed(1)} seconds. Press Enter for another.`;
  } else {
    el.input.value = challenge.answer;   // the right answer appears in red (see .answer.wrong in style.css)
    el.status.textContent = (result === "timeout" ? "Time's up! " : `Not quite, you said ${typed}. `)
      + `The answer was ${challenge.answer}. Press Enter for another.`;
  }
}

/* ================= 6. CONTROLS ================= */
function renderSettings() {
  el.difficultyGroup.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.level === data.level));
  el.timeSlider.value = data.time;
  el.timeValue.textContent = data.time + "s";
}

el.difficultyGroup.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  data.level = b.dataset.level; save(); renderSettings(); newChallenge();
});
el.timeSlider.addEventListener("input", () => { el.timeValue.textContent = el.timeSlider.value + "s"; });   // live label
el.timeSlider.addEventListener("change", () => { data.time = Number(el.timeSlider.value); save(); prepare(); }); // applies on release
el.startBtn.addEventListener("click", startRound);
el.timerBtn.addEventListener("click", submit);
el.submitBtn.addEventListener("click", submit);
el.newBtn.addEventListener("click", newChallenge);
el.resetBtn.addEventListener("click", prepare);                    // replay the same challenge
window.addEventListener("resize", layoutJigsaw);

// Enter: start -> submit -> next challenge. (Ignored when a button has focus, since Enter already clicks it.)
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
    e.preventDefault();
    if (state === "ready") startRound();
    else if (state === "running") submit();
    else newChallenge();
  }
});

renderSettings();
newChallenge();
