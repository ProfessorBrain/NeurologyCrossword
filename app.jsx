import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// ---------- RNG & helpers ----------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | t);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStringToInt(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function defaultDailySeed() {
  return hashStringToInt("phoenix" + phoenixYYYYMMDD());
}

const MIN_SIZE_LEVEL = 0;
const MAX_SIZE_LEVEL = 14;

function normalizeSizeLevel(value, fallback = 7) {
  const level = Number(value);
  if (!Number.isFinite(level)) return fallback;
  return Math.max(MIN_SIZE_LEVEL, Math.min(MAX_SIZE_LEVEL, Math.round(level)));
}

function readQuery() {
  const q = new URLSearchParams(window.location.search);
  const seedRaw = q.get("seed");
  const levelRaw = q.get("level");
  let seed = null;
  if (seedRaw && seedRaw.length) {
    seed = /^[0-9]+$/.test(seedRaw)
      ? Number(seedRaw) >>> 0
      : hashStringToInt(String(seedRaw));
  }
  let level = null;
  if (levelRaw !== null) {
    const n = Number(levelRaw);
    if (Number.isFinite(n)) level = normalizeSizeLevel(n);
  }
  return { seed, level };
}
function writeQuery(seed, level, replace = true) {
  const url = new URL(window.location.href);
  url.searchParams.set("seed", String(seed >>> 0));
  url.searchParams.set("level", String(normalizeSizeLevel(level)));
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}
function newRandomSeed() {
  try {
    if (window.crypto && window.crypto.getRandomValues) {
      const a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] >>> 0;
    }
  } catch (_) {}
  return (Math.random() * 0xffffffff) >>> 0;
}
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------- CSV (no fallback) ----------
function parseCSVTwoCols(text) {
  const lines = text.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  const out = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const fields = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch == '"') {
        if (inQ && line[i + 1] == '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    if (fields.length >= 2) {
      const ans = (fields[0] || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      const clue = fields.slice(1).join(",").trim();
      if (/^ANSWER$/i.test(ans) && /^CLUE$/i.test(clue)) continue;
      if (ans.length >= 3) out.push({ answer: ans, clue });
    }
  }
  return out;
}

function useClueBank() {
  const [bank, setBank] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("crosswordclues.csv")
      .then((r) => {
        if (!r.ok) throw new Error("CSV not found");
        return r.text();
      })
      .then((txt) => {
        if (cancelled) return;
        const parsed = parseCSVTwoCols(txt);
        if (parsed.length) {
          setBank(
            parsed.map((x) => ({
              answer: x.answer.replace(/[^A-Z]/g, "").toUpperCase(),
              clue: x.clue,
            })),
          );
        } else {
          setError("CSV parsed but no valid rows.");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e && e.message ? e.message : "Failed to load crosswordclues.csv",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { bank, loading, error };
}

// ---------- Date & helpers ----------

// Simple canvas confetti launcher
function startConfetti() {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  if (window.__confettiCtl && window.__confettiCtl.running) return; // already running
  const canvas = document.createElement("canvas");
  canvas.className = "confettiCanvas";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let W = (canvas.width = window.innerWidth);
  let H = (canvas.height = window.innerHeight);
  const onResize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };
  window.addEventListener("resize", onResize);
  const colors = [
    "#E74C3C",
    "#F1C40F",
    "#2ECC71",
    "#3498DB",
    "#9B59B6",
    "#E67E22",
  ];
  const N = 180;
  const parts = Array.from({ length: N }, (_, i) => ({
    x: Math.random() * W,
    y: -10 - Math.random() * H * 0.3, // start above top
    r: 2 + Math.random() * 4,
    vx: (Math.random() - 0.5) * 2,
    vy: 2 + Math.random() * 3,
    c: colors[i % colors.length],
    a: 0.9,
  }));
  let running = true;
  window.__confettiCtl = {
    running: true,
    stop() {
      running = false;
      this.running = false;
      try {
        document.body.removeChild(canvas);
      } catch {}
      window.removeEventListener("resize", onResize);
      window.__confettiCtl = null;
    },
  };
  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03; // gravity
      if (p.y > H + 10) {
        // recycle to top
        p.y = -10;
        p.vy = 2 + Math.random() * 3;
        p.x = Math.random() * W;
      }
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function stopConfetti() {
  if (window.__confettiCtl && window.__confettiCtl.stop) {
    window.__confettiCtl.stop();
  }
}
function phoenixYYYYMMDD(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Phoenix",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    var y = null,
      m = null,
      d = null;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.type === "year") y = p.value;
      else if (p.type === "month") m = p.value;
      else if (p.type === "day") d = p.value;
    }
    return y + "-" + m + "-" + d;
  } catch (e) {
    const y = date.getFullYear(),
      m = String(date.getMonth() + 1).padStart(2, "0"),
      d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
}
const DIRS = { ACROSS: "across", DOWN: "down" };
const SAVE_KEY = "neuroxcw.save.v2";

const SIZE_PRESETS = {
  small: { base: 15, maxLen: 8, maxClues: 10, minPlaced: 6 },
  medium: { base: 21, maxLen: 14, maxClues: 16, minPlaced: 10 },
  large: { base: 31, maxLen: 35, maxClues: 20, minPlaced: 12 },
};
// Map size level (0..14) or legacy 'small'|'medium'|'large' to preset values
function presetFor(levelOrOpt) {
  const LEGACY = SIZE_PRESETS;
  if (typeof levelOrOpt === "string") {
    return LEGACY[levelOrOpt] || LEGACY.medium;
  }
  const lvl = normalizeSizeLevel(levelOrOpt);
  const lerp = (a, b, t) => a + (b - a) * t;
  const t = lvl / MAX_SIZE_LEVEL;
  const base = Math.round(lerp(13, 35, t));
  const maxLen = Math.round(lerp(8, 35, t));
  const maxClues = Math.round(lerp(10, 20, t));
  const minPlaced = Math.round(lerp(6, 12, t));
  return { base, maxLen, maxClues, minPlaced };
}

function computeGridSize(words, sizeOrPreset) {
  const preset =
    typeof sizeOrPreset === "string"
      ? SIZE_PRESETS[sizeOrPreset] || SIZE_PRESETS.medium
      : sizeOrPreset || SIZE_PRESETS.medium;
  const MAX = 35,
    MIN = 13;
  const longest = Math.max(3, ...words.map((w) => w.answer.length));
  let size = Math.max(preset.base, longest + 2);
  size = Math.min(MAX, Math.max(MIN, size));
  return size;
}

// ---------- Grid helpers ----------
function cellInPlacement(p, r, c) {
  if (!p) return false;
  if (p.dir === DIRS.ACROSS)
    return r === p.row && c >= p.col && c < p.col + p.answer.length;
  if (p.dir === DIRS.DOWN)
    return c === p.col && r >= p.row && r < p.row + p.answer.length;
  return false;
}

function revealPlacement(p, grid, setUserGrid, setRevealed) {
  if (!p) return;
  // Fill user grid with the solution letters for this placement
  setUserGrid((prev) => {
    const copy = prev.map((row) => row.slice());
    if (p.dir === DIRS.ACROSS) {
      const r = p.row;
      for (let c = p.col; c < p.col + p.answer.length; c++) {
        copy[r][c] = grid[r][c];
      }
    } else {
      const c = p.col;
      for (let r = p.row; r < p.row + p.answer.length; r++) {
        copy[r][c] = grid[r][c];
      }
    }
    return copy;
  });
  // Mark cells as revealed (purple)
  setRevealed((prev) => {
    const nn = new Set(prev);
    if (p.dir === DIRS.ACROSS) {
      const r = p.row;
      for (let c = p.col; c < p.col + p.answer.length; c++) {
        nn.add(r + ":" + c);
      }
    } else {
      const c = p.col;
      for (let r = p.row; r < p.row + p.answer.length; r++) {
        nn.add(r + ":" + c);
      }
    }
    return nn;
  });
}
function isPlacementCorrect(p, user) {
  if (!p || !Array.isArray(user) || user.length === 0) return false;
  const H = user.length;
  const W = Array.isArray(user[0]) ? user[0].length : 0;
  const ans = p && p.answer ? String(p.answer).toUpperCase() : "";
  if (!ans) return false;
  if (p.dir === DIRS.ACROSS) {
    const r = p.row;
    if (r < 0 || r >= H) return false;
    for (let i = 0; i < ans.length; i++) {
      const c = p.col + i;
      if (c < 0 || c >= W) return false;
      const ch = user[r] && user[r][c] ? String(user[r][c]).toUpperCase() : "";
      if (ch !== ans[i]) return false;
    }
  } else {
    const c = p.col;
    if (c < 0 || c >= W) return false;
    for (let i = 0; i < ans.length; i++) {
      const r = p.row + i;
      if (r < 0 || r >= H) return false;
      const ch = user[r] && user[r][c] ? String(user[r][c]).toUpperCase() : "";
      if (ch !== ans[i]) return false;
    }
  }
  return true;
}
function makeEmptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}
function canPlace(word, row, col, dir, grid) {
  const size = grid.length,
    len = word.length;
  if (dir === DIRS.ACROSS) {
    if (col < 0 || col + len > size || row < 0 || row >= size) return false;
    if (col - 1 >= 0 && grid[row][col - 1] !== null) return false;
    if (col + len < size && grid[row][col + len] !== null) return false;
    for (let i = 0; i < len; i++) {
      const r = row,
        c = col + i,
        cell = grid[r][c];
      if (cell !== null && cell !== word[i]) return false;
      if (cell === null) {
        if (r - 1 >= 0 && grid[r - 1][c] !== null) return false;
        if (r + 1 < size && grid[r + 1][c] !== null) return false;
      }
    }
    return true;
  } else {
    if (row < 0 || row + len > size || col < 0 || col >= size) return false;
    if (row - 1 >= 0 && grid[row - 1][col] !== null) return false;
    if (row + len < size && grid[row + len][col] !== null) return false;
    for (let i = 0; i < len; i++) {
      const r = row + i,
        c = col,
        cell = grid[r][c];
      if (cell !== null && cell !== word[i]) return false;
      if (cell === null) {
        if (c - 1 >= 0 && grid[r][c - 1] !== null) return false;
        if (c + 1 < size && grid[r][c + 1] !== null) return false;
      }
    }
    return true;
  }
}
function placeWord(word, row, col, dir, grid) {
  for (let i = 0; i < word.length; i++) {
    const r = dir === DIRS.ACROSS ? row : row + i,
      c = dir === DIRS.ACROSS ? col + i : col;
    grid[r][c] = word[i];
  }
}

function generateCrosswordFromWords(words, seed, size) {
  const rng = mulberry32(seed);
  const grid = makeEmptyGrid(size);
  const placements = [];
  const copy = words.slice();
  shuffleInPlace(copy, rng);

  const first = copy.shift();
  if (!first) {
    return {
      grid: grid,
      placements: [],
      numbers: Array.from({ length: size }, () => Array(size).fill(null)),
      bounds: { minR: 0, maxR: size - 1, minC: 0, maxC: size - 1 },
    };
  }
  const mid = Math.floor(size / 2);
  const startCol = Math.max(
    0,
    Math.min(
      size - first.answer.length,
      mid - Math.floor(first.answer.length / 2),
    ),
  );
  placeWord(first.answer, mid, startCol, DIRS.ACROSS, grid);
  placements.push({
    answer: first.answer,
    clue: first.clue,
    row: mid,
    col: startCol,
    dir: DIRS.ACROSS,
  });

  function findLetterPositions(L) {
    const hits = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === L) hits.push([r, c]);
      }
    }
    return hits;
  }

  function canPlaceWithoutParallelOverlap(word, row, col, dir) {
    if (!canPlace(word, row, col, dir, grid)) return false;
    for (let i = 0; i < word.length; i++) {
      const r = dir === DIRS.ACROSS ? row : row + i;
      const c = dir === DIRS.ACROSS ? col + i : col;
      if (grid[r][c] === null) continue;
      if (placements.some((p) => p.dir === dir && cellInPlacement(p, r, c)))
        return false;
    }
    return true;
  }

  for (let wi = 0; wi < copy.length; wi++) {
    const w = copy[wi];
    const word = w.answer;
    let placed = false;
    const crossLetters = [];
    for (let i = 0; i < word.length; i++) {
      if (crossLetters.indexOf(word[i]) === -1) crossLetters.push(word[i]);
    }
    shuffleInPlace(crossLetters, rng);
    for (let ci = 0; ci < crossLetters.length && !placed; ci++) {
      const L = crossLetters[ci];
      const positions = findLetterPositions(L);
      if (!positions || !positions.length) continue;
      const idxs = [];
      for (let i = 0; i < word.length; i++) if (word[i] === L) idxs.push(i);
      shuffleInPlace(idxs, rng);
      for (let ii = 0; ii < idxs.length && !placed; ii++) {
        const i = idxs[ii];
        for (let pi = 0; pi < positions.length && !placed; pi++) {
          const rc = positions[pi];
          if (!Array.isArray(rc) || rc.length < 2) continue;
          const r = rc[0];
          const c = rc[1];
          if (typeof r !== "number" || typeof c !== "number") continue;
          const acCol = c - i;
          if (canPlaceWithoutParallelOverlap(word, r, acCol, DIRS.ACROSS)) {
            placeWord(word, r, acCol, DIRS.ACROSS, grid);
            placements.push({
              answer: w.answer,
              clue: w.clue,
              row: r,
              col: acCol,
              dir: DIRS.ACROSS,
            });
            placed = true;
            break;
          }
          const dnRow = r - i;
          if (canPlaceWithoutParallelOverlap(word, dnRow, c, DIRS.DOWN)) {
            placeWord(word, dnRow, c, DIRS.DOWN, grid);
            placements.push({
              answer: w.answer,
              clue: w.clue,
              row: dnRow,
              col: c,
              dir: DIRS.DOWN,
            });
            placed = true;
            break;
          }
        }
      }
    }
  }

  if (placements.length > 1) {
    const H = grid.length,
      W = grid[0].length;
    const counts = Array.from({ length: H }, () => Array(W).fill(0));
    for (let pIndex = 0; pIndex < placements.length; pIndex++) {
      const p = placements[pIndex];
      for (let i = 0; i < p.answer.length; i++) {
        const r = p.dir === DIRS.ACROSS ? p.row : p.row + i;
        const c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
        if (r >= 0 && r < H && c >= 0 && c < W) counts[r][c] += 1;
      }
    }
    const keep = [];
    for (let pIndex = 0; pIndex < placements.length; pIndex++) {
      const p = placements[pIndex];
      let shares = false;
      for (let i = 0; i < p.answer.length; i++) {
        const r = p.dir === DIRS.ACROSS ? p.row : p.row + i;
        const c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
        if (counts[r][c] > 1) {
          shares = true;
          break;
        }
      }
      if (shares) keep.push(p);
    }
    if (keep.length !== placements.length) {
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) grid[r][c] = null;
      for (let j = 0; j < keep.length; j++) {
        const p = keep[j];
        for (let i = 0; i < p.answer.length; i++) {
          const r = p.dir === DIRS.ACROSS ? p.row : p.row + i;
          const c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
          grid[r][c] = p.answer[i];
        }
      }
      placements.length = 0;
      for (let j = 0; j < keep.length; j++) placements.push(keep[j]);
    }
  }

  let num = 1;
  const numbers = Array.from({ length: size }, () => Array(size).fill(null));
  function isLetter(r, c) {
    return r >= 0 && r < size && c >= 0 && c < size && grid[r][c] !== null;
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isLetter(r, c)) continue;
      const startsAcross =
        !isLetter(r, c - 1) && isLetter(r, c) && isLetter(r, c + 1);
      const startsDown =
        !isLetter(r - 1, c) && isLetter(r, c) && isLetter(r + 1, c);
      if (startsAcross || startsDown) numbers[r][c] = num++;
    }
  }
  for (let pIndex = 0; pIndex < placements.length; pIndex++) {
    const p = placements[pIndex];
    p.number = numbers[p.row][p.col];
  }

  let minR = size,
    maxR = -1,
    minC = size,
    maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== null) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR === -1) {
    minR = 0;
    maxR = size - 1;
    minC = 0;
    maxC = size - 1;
  }

  return { grid, placements, numbers, bounds: { minR, maxR, minC, maxC } };
}

function pickDailyWords(bank, rng, sizeOrPreset) {
  const preset =
    typeof sizeOrPreset === "string"
      ? SIZE_PRESETS[sizeOrPreset] || SIZE_PRESETS.medium
      : sizeOrPreset || SIZE_PRESETS.medium;
  const pool = bank
    .slice()
    .filter((x) => x.answer.length >= 3 && x.answer.length <= preset.maxLen);
  shuffleInPlace(pool, rng);
  const chosen = [];
  const seen = new Set();
  for (let i = 0; i < pool.length; i++) {
    if (chosen.length >= preset.maxClues) break;
    const item = pool[i];
    if (seen.has(item.answer)) continue;
    chosen.push(item);
    seen.add(item.answer);
  }
  return chosen;
}

function fireConfetti(count) {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  count = typeof count === "number" && isFinite(count) ? count : 8;
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "none";
  container.style.zIndex = "1000";
  document.body.appendChild(container);
  const EMOJIS = ["🎉", "✨", "⭐"];
  const N = Math.max(1, Math.min(40, Math.floor(count)));
  for (let i = 0; i < N; i++) {
    const span = document.createElement("span");
    span.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    span.style.position = "absolute";
    span.style.left = Math.random() * 100 + "vw";
    span.style.top = "-10px";
    span.style.fontSize = 12 + Math.random() * 12 + "px";
    span.style.opacity = "0.9";
    span.style.transition = "transform 1s ease-out, opacity 1s ease-out";
    container.appendChild(span);
    requestAnimationFrame(function () {
      span.style.transform =
        "translateY(" +
        (70 + Math.random() * 80) +
        "vh) rotate(" +
        (Math.random() - 0.5) * 180 +
        "deg)";
      span.style.opacity = "0";
    });
  }
  setTimeout(function () {
    container.remove();
  }, 1100);
}

function App() {
  const { bank, loading, error } = useClueBank();
  const initialQuery = useMemo(() => readQuery(), []);
  const [sizeLevel, setSizeLevel] = useState(() =>
    initialQuery.level !== null ? initialQuery.level : 5,
  );
  const [seed, setSeed] = useState(() =>
    initialQuery.seed !== null ? initialQuery.seed >>> 0 : defaultDailySeed(),
  );
  useEffect(() => {
    try {
      writeQuery(seed, sizeLevel, true);
    } catch (_) {}
  }, [seed, sizeLevel]);
  const words = useMemo(
    () =>
      bank.length
        ? pickDailyWords(bank, mulberry32(seed), presetFor(sizeLevel))
        : [],
    [bank, seed, sizeLevel],
  );
  const size = useMemo(
    () =>
      computeGridSize(
        words.length ? words : [{ answer: "PLACEHOLDER", clue: "" }],
        presetFor(sizeLevel),
      ),
    [words, sizeLevel],
  );

  const emptySize = Math.max(13, Math.min(35, size || 15));
  const emptyResult = useMemo(
    () => ({
      grid: makeEmptyGrid(emptySize),
      placements: [],
      numbers: Array.from({ length: emptySize }, () =>
        Array(emptySize).fill(null),
      ),
      bounds: { minR: 0, maxR: emptySize - 1, minC: 0, maxC: emptySize - 1 },
    }),
    [emptySize],
  );

  // Symmetry helper: 180° rotational symmetry mismatches (block vs letter)
  function symmetryMismatches(g) {
    try {
      const grid = g && g.grid ? g.grid : g;
      if (!grid || !grid.length) return 0;
      const n = grid.length,
        m = grid[0].length;
      let mismatches = 0;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < m; c++) {
          const mr = n - 1 - r,
            mc = m - 1 - c;
          if (r > mr || (r === mr && c > mc)) continue; // count pairs once
          const a = grid[r][c] !== null;
          const b = grid[mr][mc] !== null;
          if (a !== b) mismatches++;
        }
      }
      return mismatches;
    } catch (_) {
      return 0;
    }
  }

  const result = useMemo(() => {
    try {
      if (!words.length) return emptyResult;
      let best = null;
      const MAX_SALTS = 200,
        MIN_WORDS = presetFor(sizeLevel).minPlaced;
      for (let salt = 0; salt < MAX_SALTS; salt++) {
        const g = generateCrosswordFromWords(words, seed + salt, size);
        const placed = g.placements.length;
        const H = g.grid.length,
          W = g.grid[0].length;
        const counts = Array.from({ length: H }, () => Array(W).fill(0));
        for (let pIndex = 0; pIndex < g.placements.length; pIndex++) {
          const p = g.placements[pIndex];
          for (let i = 0; i < p.answer.length; i++) {
            const r = p.dir === DIRS.ACROSS ? p.row : p.row + i,
              c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
            if (r >= 0 && r < H && c >= 0 && c < W) counts[r][c] += 1;
          }
        }
        let crosses = 0;
        for (let r = 0; r < H; r++)
          for (let c = 0; c < W; c++) if (counts[r][c] > 1) crosses++;
        const sym = symmetryMismatches(g);
        const score = placed * 10 + crosses - sym * 8;
        if (!best || score > best.score) best = { ...g, score };
        if (placed >= MIN_WORDS) return g;
      }
      // Fallback: if score low, retry at a slightly smaller base and prefer better layout
      const threshold = presetFor(sizeLevel).minPlaced * 10;
      if (best && best.score < threshold && size > 13) {
        const smaller = Math.max(13, size - 2);
        let bestSmall = null;
        for (let s2 = 0; s2 < 120; s2++) {
          const g2 = generateCrosswordFromWords(words, seed + s2, smaller);
          const placed2 = g2.placements.length;
          const H2 = g2.grid.length,
            W2 = g2.grid[0].length;
          const counts2 = Array.from({ length: H2 }, () => Array(W2).fill(0));
          for (let pIndex = 0; pIndex < g2.placements.length; pIndex++) {
            const p2 = g2.placements[pIndex];
            for (let i2 = 0; i2 < p2.answer.length; i2++) {
              const rr = p2.dir === DIRS.ACROSS ? p2.row : p2.row + i2,
                cc = p2.dir === DIRS.ACROSS ? p2.col + i2 : p2.col;
              if (rr >= 0 && rr < H2 && cc >= 0 && cc < W2)
                counts2[rr][cc] += 1;
            }
          }
          let crosses2 = 0;
          for (let r = 0; r < H2; r++)
            for (let c = 0; c < W2; c++) if (counts2[r][c] > 1) crosses2++;
          const sym2 = symmetryMismatches(g2);
          const score2 = placed2 * 10 + crosses2 - sym2 * 8;
          if (!bestSmall || score2 > bestSmall.score)
            bestSmall = { ...g2, score: score2 };
          if (placed2 >= MIN_WORDS && sym2 === 0) {
            bestSmall = { ...g2, score: score2 };
            break;
          }
        }
        if (bestSmall && bestSmall.score > best.score) return bestSmall;
      }
      return best || generateCrosswordFromWords(words, seed, size);
    } catch (e) {
      console.error("result memo failed", e);
      return emptyResult;
    }
  }, [words, seed, size, emptyResult]);

  const grid = result.grid,
    placements = result.placements,
    numbers = result.numbers,
    bounds = result.bounds;

  const [userGrid, setUserGrid] = useState(
    grid.map((row) => row.map((x) => (x ? "" : null))),
  );
  useEffect(
    () => setUserGrid(grid.map((row) => row.map((x) => (x ? "" : null)))),
    [grid],
  );
  const [active, setActive] = useState(null);
  const [dir, setDir] = useState(DIRS.ACROSS);
  const [locked, setLocked] = useState(new Set());
  const [revealMode, setRevealMode] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [everIncorrect, setEverIncorrect] = useState(new Set());
  const [timerOn, setTimerOn] = useState(false);
  const [timerStart, setTimerStart] = useState(null); // ms epoch when (re)started
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalMs, setFinalMs] = useState(null);
  // accumulated elapsed
  const [nowTick, setNowTick] = useState(Date.now()); // heartbeat for live counter

  const hiddenInputRef = useRef(null);
  const lastTapRef = useRef({ t: 0, r: -1, c: -1 });
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isUA = /iPhone|iPad|iPod|Android/i.test(ua);
    const mq = window.matchMedia
      ? window.matchMedia("(max-width: 900px)")
      : null;
    const calc = () => {
      try {
        const touch = (navigator.maxTouchPoints || 0) > 0;
        const small = (window.innerWidth || 9999) <= 900;
        return !!(isUA || (mq && mq.matches) || (touch && small));
      } catch (_) {
        return !!isUA;
      }
    };
    const apply = () => {
      const m = calc();
      setIsMobile(m);
      try {
        document.documentElement.classList.toggle("is-mobile", m);
        document.body.classList.toggle("is-mobile", m);
      } catch (_) {}
    };
    apply();
    const on = () => apply();
    try {
      if (mq) {
        if (mq.addEventListener) mq.addEventListener("change", on);
        else if (mq.addListener) mq.addListener(on);
      }
    } catch (_) {}
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      try {
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener("change", on);
          else if (mq.removeListener) mq.removeListener(on);
        }
      } catch (_) {}
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);

  // Mobile overflow fallback: if anything still overflows horizontally, scale the app down slightly.
  const applyFitScale = React.useCallback(() => {
    try {
      const wrap = document.getElementById("appwrap");
      if (!wrap) return;

      // Reset first
      wrap.classList.remove("fit-scale");
      document.documentElement.style.setProperty("--app-scale", "1");
      if (!isMobile) return;

      // Measure after reset
      const vw = Math.max(
        240,
        document.documentElement && document.documentElement.clientWidth
          ? document.documentElement.clientWidth
          : window.innerWidth || 360,
      );
      const contentW = Math.max(
        wrap.scrollWidth || 0,
        Math.ceil(wrap.getBoundingClientRect().width || 0),
      );

      if (contentW > vw + 1) {
        let s = vw / contentW;
        // Typical overflows only need a small shrink; avoid making the UI unreadably tiny.
        s = Math.max(0.78, Math.min(1, s));
        document.documentElement.style.setProperty("--app-scale", String(s));
        wrap.classList.add("fit-scale");
      }
    } catch (_) {}
  }, [isMobile]);

  const scheduleFitScale = React.useCallback(() => {
    try {
      requestAnimationFrame(() => applyFitScale());
      setTimeout(() => applyFitScale(), 30);
      setTimeout(() => applyFitScale(), 140);
    } catch (_) {}
  }, [applyFitScale]);

  useEffect(() => {
    scheduleFitScale();
  }, [isMobile, scheduleFitScale]);

  useEffect(() => {
    if (!showCongrats) {
      stopConfetti();
      return;
    }
    startConfetti();
    return stopConfetti;
  }, [showCongrats]);

  const [showOptions, setShowOptions] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const [sizeInput, setSizeInput] = useState(sizeLevel);
  const [revealed, setRevealed] = useState(new Set());
  const [pendingResume, setPendingResume] = useState(null);
  const [resumeChecked, setResumeChecked] = useState(false);

  useEffect(() => {
    setActive(null);
    setDir(DIRS.ACROSS);
    setLocked(new Set());
    setRevealed(new Set());
    setEverIncorrect(new Set());
    setShowCongrats(false);
    setFinalMs(null);
    // Reset timer on new grid
    setElapsedMs(0);
    if (timerOn) setTimerStart(Date.now());
    else setTimerStart(null);
  }, [grid]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (
          obj &&
          typeof obj === "object" &&
          Number.isFinite(Number(obj.seed))
        ) {
          const savedSeed = Number(obj.seed) >>> 0;
          const savedLevel = Number.isFinite(Number(obj.sizeLevel))
            ? Math.max(0, Math.min(14, Math.round(Number(obj.sizeLevel))))
            : 5;
          const hasExplicitQuery =
            initialQuery.seed !== null || initialQuery.level !== null;
          const matchesRequestedPuzzle =
            savedSeed === seed >>> 0 && savedLevel === sizeLevel;
          if (!hasExplicitQuery || matchesRequestedPuzzle) {
            if (!hasExplicitQuery) {
              setSeed(savedSeed);
              setSizeLevel(savedLevel);
            }
            setPendingResume(obj);
            setShowCongrats(false);
          }
        }
      }
    } catch (_) {
    } finally {
      setResumeChecked(true);
    }
  }, []);

  const wrapRef = useRef(null);
  const [cellPx, setCellPx] = useState(24);
  const cols = Math.max(1, bounds.maxC - bounds.minC + 1),
    rows = Math.max(1, bounds.maxR - bounds.minR + 1);
  const [availableHeight, setAvailableHeight] = useState(400);
  useEffect(() => {
    const recalc = () => {
      if (!wrapRef.current) return;
      const el = wrapRef.current;
      const w = el.clientWidth || 320;
      let padL = 0,
        padR = 0,
        padT = 0,
        padB = 0;
      try {
        const cs = window.getComputedStyle(el);
        padL = parseFloat(cs.paddingLeft) || 0;
        padR = parseFloat(cs.paddingRight) || 0;
        padT = parseFloat(cs.paddingTop) || 0;
        padB = parseFloat(cs.paddingBottom) || 0;
      } catch (_) {}
      const innerW = Math.max(120, Math.floor(w - padL - padR));
      const rect = wrapRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const footerBuffer = 80;
      const availH = Math.max(140, Math.floor(vh - rect.top - footerBuffer));
      setAvailableHeight(availH);
      const innerH = Math.max(120, Math.floor(availH - padT - padB));
      const px = Math.max(
        10,
        Math.min(
          Math.floor((innerW - 2) / cols),
          Math.floor((innerH - 2) / rows),
        ),
      );
      setCellPx(px);
      try {
        if (isMobile) {
          requestAnimationFrame(() => applyFitScale());
        }
      } catch (_) {}
    };
    recalc();
    var ro = null;
    try {
      ro = new ResizeObserver(() => recalc());
      if (wrapRef.current) ro.observe(wrapRef.current);
    } catch (e) {}
    window.addEventListener("resize", recalc);
    return () => {
      try {
        if (ro) {
          ro.disconnect();
        }
      } catch (e) {}
      window.removeEventListener("resize", recalc);
    };
  }, [cols, rows, isMobile, applyFitScale]);

  function within(r, c) {
    return (
      r >= bounds.minR &&
      r <= bounds.maxR &&
      c >= bounds.minC &&
      c <= bounds.maxC
    );
  }
  function isLetterCell(r, c) {
    return within(r, c) && grid[r][c] !== null;
  }
  function cellKey(r, c) {
    return r + ":" + c;
  }
  function getWordSpan(r, c, d) {
    if (!isLetterCell(r, c)) return null;
    let r0 = r,
      c0 = c;
    if (d === DIRS.ACROSS) {
      while (c0 - 1 >= 0 && grid[r][c0 - 1] !== null) c0--;
    } else {
      while (r0 - 1 >= 0 && grid[r0 - 1][c] !== null) r0--;
    }
    const cells = [];
    if (d === DIRS.ACROSS) {
      let k = 0;
      while (c0 + k < grid.length && grid[r][c0 + k] !== null) {
        cells.push([r, c0 + k]);
        k++;
      }
    } else {
      let k = 0;
      while (r0 + k < grid.length && grid[r0 + k][c] !== null) {
        cells.push([r0 + k, c]);
        k++;
      }
    }
    var number = null;
    if (
      numbers &&
      numbers[r0] &&
      typeof numbers[r0][c0] !== "undefined" &&
      numbers[r0][c0] !== null
    ) {
      number = numbers[r0][c0];
    }
    return { startR: r0, startC: c0, cells, number };
  }
  function moveNext(r, c, d, backwards) {
    backwards = !!backwards;
    const span = getWordSpan(r, c, d);
    if (!span || !span.cells || !span.cells.length) return null;
    var idx = -1;
    for (var i = 0; i < span.cells.length; i++) {
      if (span.cells[i][0] === r && span.cells[i][1] === c) {
        idx = i;
        break;
      }
    }
    var nxt = idx + (backwards ? -1 : 1);
    if (nxt < 0) nxt = 0;
    if (nxt >= span.cells.length) nxt = span.cells.length - 1;
    const tuple = span.cells[nxt];
    if (!tuple || tuple.length < 2) return null;
    return { r: tuple[0], c: tuple[1] };
  }
  function pickSmartDir(r, c, preferred, g) {
    const lenAcross = (function () {
      let c0 = c;
      while (c0 - 1 >= 0 && g[r][c0 - 1] !== null) c0--;
      let n = 0;
      while (c0 + n < g.length && g[r][c0 + n] !== null) n++;
      return n;
    })();
    const lenDown = (function () {
      let r0 = r;
      while (r0 - 1 >= 0 && g[r0 - 1][c] !== null) r0--;
      let n = 0;
      while (r0 + n < g.length && g[r0 + n][c] !== null) n++;
      return n;
    })();
    const hasAcross = lenAcross >= 2,
      hasDown = lenDown >= 2;
    if (hasAcross && !hasDown) return DIRS.ACROSS;
    if (!hasAcross && hasDown) return DIRS.DOWN;
    if (hasAcross && hasDown) {
      if (lenDown > lenAcross) return DIRS.DOWN;
      if (lenAcross > lenDown) return DIRS.ACROSS;
      return preferred;
    }
    return preferred;
  }

  function applyCellLetter(r, c, ch) {
    const nextGrid = userGrid.map((row) => row.slice());
    nextGrid[r][c] = ch;
    const spans = [
      getWordSpan(r, c, DIRS.ACROSS),
      getWordSpan(r, c, DIRS.DOWN),
    ].filter(Boolean);
    const nextLocked = new Set(locked);
    let newlyCompleted = 0;
    for (const span of spans) {
      if (!span || span.cells.length < 2) continue;
      const correct = span.cells.every(
        ([rr, cc]) => grid[rr][cc] && nextGrid[rr][cc] === grid[rr][cc],
      );
      const alreadyLocked = span.cells.every(([rr, cc]) =>
        locked.has(cellKey(rr, cc)),
      );
      if (correct && !alreadyLocked) {
        newlyCompleted++;
        span.cells.forEach(([rr, cc]) => nextLocked.add(cellKey(rr, cc)));
      }
    }
    setUserGrid(nextGrid);
    if (nextLocked.size !== locked.size) setLocked(nextLocked);
    if (newlyCompleted > 0) fireConfetti(8);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (showOptions) setShowOptions(false);
        if (revealMode) setRevealMode(false);
        return;
      }
      const target = e.target;
      if (
        target &&
        (target.matches?.("input, textarea, select, button") ||
          target.isContentEditable)
      )
        return;
      if (!active) return;
      if (e.key === "Tab") {
        e.preventDefault();
        setDir((d) => (d === DIRS.ACROSS ? DIRS.DOWN : DIRS.ACROSS));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        const r = active.r,
          c = active.c,
          id = cellKey(r, c);
        if (!isLetterCell(r, c) || locked.has(id) || revealed.has(id)) return;
        const nextGrid = userGrid.map((row) => row.slice());
        nextGrid[r][c] = "";
        setUserGrid(nextGrid);
        const prev = moveNext(r, c, dir, true);
        if (prev) setActive(prev);
        return;
      }
      if (/^[a-z]$/i.test(e.key)) {
        e.preventDefault();
        const ch = e.key.toUpperCase(),
          r = active.r,
          c = active.c,
          id = cellKey(r, c);
        if (!isLetterCell(r, c) || locked.has(id) || revealed.has(id)) return;
        if (grid[r][c] && ch !== grid[r][c]) {
          setEverIncorrect((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }
        applyCellLetter(r, c, ch);
        const next = moveNext(r, c, dir, false);
        if (next) setActive(next);
        return;
      }
      const delta = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (delta[e.key]) {
        e.preventDefault();
        const dxy = delta[e.key];
        const nr = active.r + dxy[0],
          nc = active.c + dxy[1];
        if (within(nr, nc) && isLetterCell(nr, nc)) setActive({ r: nr, c: nc });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, dir, grid, locked, revealMode, revealed, showOptions, userGrid]);

  useEffect(() => {
    if (!pendingResume || loading || !bank.length || !placements.length) return;
    try {
      const saved = pendingResume;
      if (!saved || !Array.isArray(saved.userGrid)) {
        setPendingResume(null);
        return;
      }
      const gh = grid?.length || 0,
        gw = grid && grid[0] ? grid[0].length : 0;
      const sh = saved.userGrid.length,
        sw = (saved.userGrid[0] || []).length;
      if (gh === sh && gw === sw) {
        setUserGrid(saved.userGrid);
        setLocked(new Set(saved.locked || []));
        setRevealed(new Set(saved.revealed || []));
        setEverIncorrect(new Set(saved.everIncorrect || []));
        setPendingResume(null);
        if (typeof saved.timerOn === "boolean") setTimerOn(saved.timerOn);
        if (typeof saved.elapsedMs === "number" && saved.elapsedMs >= 0)
          setElapsedMs(saved.elapsedMs);
        setTimerStart(saved.timerOn ? Date.now() : null);
      } else setPendingResume(null);
    } catch (_) {}
  }, [grid, placements, loading, bank, pendingResume]);

  useEffect(() => {
    if (!resumeChecked || pendingResume) return;
    const saveProgress = () => {
      try {
        const payload = {
          seed,
          sizeLevel,
          userGrid,
          locked: Array.from(locked || []),
          revealed: Array.from(revealed || []),
          everIncorrect: Array.from(everIncorrect || []),
          timerOn,
          elapsedMs:
            timerOn && timerStart
              ? elapsedMs + (Date.now() - timerStart)
              : elapsedMs,
          ts: Date.now(),
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      } catch (_) {}
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") saveProgress();
    };
    saveProgress();
    window.addEventListener("pagehide", saveProgress);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveProgress);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [
    seed,
    sizeLevel,
    userGrid,
    locked,
    revealed,
    everIncorrect,
    timerOn,
    timerStart,
    elapsedMs,
    resumeChecked,
    pendingResume,
  ]);
  const selectedPlacement = useMemo(() => {
    if (!active) return null;
    const hit = placements.find(
      (p) => p.dir === dir && cellInPlacement(p, active.r, active.c),
    );
    return hit || null;
  }, [placements, active, dir]);
  const across = useMemo(
    () =>
      placements
        .filter((p) => p.dir === DIRS.ACROSS)
        .slice()
        .sort((a, b) => a.number - b.number),
    [placements],
  );
  const down = useMemo(
    () =>
      placements
        .filter((p) => p.dir === DIRS.DOWN)
        .slice()
        .sort((a, b) => a.number - b.number),
    [placements],
  );

  // Compute the set of words that were missed (revealed or ever incorrect) at any point
  function getMissedPlacements() {
    const missCells = new Set();
    revealed.forEach((k) => missCells.add(k));
    everIncorrect.forEach((k) => missCells.add(k));
    const out = [];
    const seen = new Set();
    for (const p of placements) {
      let hit = false;
      for (let i = 0; i < p.answer.length; i++) {
        const r = p.dir === DIRS.ACROSS ? p.row + 0 : p.row + i;
        const c = p.dir === DIRS.ACROSS ? p.col + i : p.col + 0;
        if (missCells.has(r + ":" + c)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        const key = p.answer + "|" + p.clue;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ answer: p.answer, clue: p.clue });
        }
      }
    }
    return out;
  }
  const missedCount = React.useMemo(
    () => getMissedPlacements().length,
    [revealed, everIncorrect, placements],
  );

  useEffect(() => {
    if (isMobile && hiddenInputRef && hiddenInputRef.current) {
      try {
        hiddenInputRef.current.focus({ preventScroll: true });
      } catch (_) {}
    }
  }, [isMobile, active, dir, grid]);

  function formatMs(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  // Timer ticking
  useEffect(() => {
    if (!timerOn) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerOn]);

  function setTimerEnabled(enabled) {
    if (enabled) {
      if (!timerOn) setTimerStart(Date.now());
      setTimerOn(true);
    } else {
      if (timerOn && timerStart)
        setElapsedMs((ms) => ms + (Date.now() - timerStart));
      setTimerStart(null);
      setTimerOn(false);
    }
    setNowTick(Date.now());
  }

  useEffect(() => {
    if (!showCongrats) return;
    try {
      const ms = elapsedMs + (timerStart ? Date.now() - timerStart : 0);
      setFinalMs(ms);
    } catch (_) {}
  }, [showCongrats]);
  // Trigger congrats when puzzle fully solved
  useEffect(() => {
    const allPlacements = (across || []).concat(down || []);
    if (
      allPlacements.length &&
      allPlacements.every((p) => isPlacementCorrect(p, userGrid))
    ) {
      if (!showCongrats) {
        setShowCongrats(true);
        /* confetti starts via showCongrats effect */
      }
    }
  }, [userGrid, across, down]);
  function renderCells() {
    const items = [];
    const R = bounds.maxR - bounds.minR + 1;
    const C = bounds.maxC - bounds.minC + 1;
    for (let ri = 0; ri < R; ri++) {
      const r = bounds.minR + ri;
      for (let ci = 0; ci < C; ci++) {
        const c = bounds.minC + ci;
        const letter = grid[r][c];
        const isCell = letter !== null;
        const id = cellKey(r, c);
        const isLocked = locked.has(id);
        const isActive = active && active.r === r && active.c === c;
        const isRevealed = revealed.has(id);
        const isInWord =
          selectedPlacement && cellInPlacement(selectedPlacement, r, c);
        const showLetter =
          userGrid[r] && typeof userGrid[r][c] !== "undefined"
            ? userGrid[r][c]
            : "";
        var num = null;
        if (
          numbers &&
          numbers[r] &&
          typeof numbers[r][c] !== "undefined" &&
          numbers[r][c] !== null
        ) {
          num = numbers[r][c];
        }
        items.push(
          <div
            key={id}
            className={
              "cell " +
              (isCell ? "open" : "block") +
              (isActive ? " active" : "") +
              (isLocked ? " locked" : "") +
              (isRevealed ? " revealed" : "") +
              (isInWord ? " inword" : "")
            }
            onClick={() => handleCellClick(r, c, isCell, id)}
          >
            {isCell && num ? <div className="num">{num}</div> : null}
            {isCell ? (
              <span
                style={{
                  color: isRevealed
                    ? "#4c1d95"
                    : isLocked
                      ? "#7c5c00"
                      : "#111111",
                  fontSize: Math.max(10, Math.floor(cellPx * 0.62)),
                  lineHeight: 1,
                  display: "inline-block",
                }}
              >
                {showLetter}
              </span>
            ) : null}
          </div>,
        );
      }
    }
    return items;
  }

  const handleCellClick = (r, c, isCell, id) => {
    // Mobile double‑tap: flip direction if tapping same cell twice quickly
    if (isMobile && !revealMode) {
      const now = Date.now();
      const last = lastTapRef.current || { t: 0, r: -1, c: -1 };
      if (now - last.t < 300 && last.r === r && last.c === c) {
        setDir((d) => (d === DIRS.ACROSS ? DIRS.DOWN : DIRS.ACROSS));
        lastTapRef.current = { t: 0, r: -1, c: -1 };
        // Keep selection; bail out so we don't also run place/reveal
        return;
      }
      lastTapRef.current = { t: now, r, c };
    }

    if (!isCell) return;
    if (revealMode) {
      const letter = grid[r][c];
      if (!letter) {
        setRevealMode(false);
        return;
      }
      applyCellLetter(r, c, letter);
      setRevealed((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setRevealMode(false);
      setActive({ r, c });
      setDir(pickSmartDir(r, c, DIRS.ACROSS, grid));
      return;
    }
    setActive({ r, c });
    setDir(pickSmartDir(r, c, DIRS.ACROSS, grid));
  };

  const handlePlacementSelect = (placement) => {
    if (revealMode) {
      revealPlacement(placement, grid, setUserGrid, setRevealed);
      setRevealMode(false);
    } else {
      setDir(placement.dir);
      setActive({ r: placement.row, c: placement.col });
    }
  };

  const handlePlacementKeyDown = (event, placement) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlePlacementSelect(placement);
    }
  };

  const showStatus = loading || error || !bank.length;
  return (
    <div id="appwrap">
      <header>
        <h1 className="title">Neurology Crossword Puzzler</h1>
      </header>
      <input
        ref={hiddenInputRef}
        className="hidden-ime-input"
        aria-label="Crossword letter input"
        inputMode="latin"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onInput={(e) => {
          const el = e.currentTarget;
          const v = el.value || "";
          // ignore typing during reveal mode
          if (revealMode) {
            el.value = "";
            return;
          }
          if (!v) {
            try {
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Backspace" }),
              );
            } catch (_) {}
          } else {
            const ch = v
              .slice(-1)
              .toUpperCase()
              .replace(/[^A-Z]/g, "");
            if (ch) {
              try {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: ch }));
              } catch (_) {}
            }
          }
          el.value = "";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setDir((d) => (d === DIRS.ACROSS ? DIRS.DOWN : DIRS.ACROSS));
          }
        }}
      />

      {showOptions && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowOptions(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Options"
          >
            <h3>Options</h3>
            <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}>
              version 0.4
            </div>
            <div className="row" style={{ alignItems: "center", gap: "12px" }}>
              <label htmlFor="sizeSlider">
                <strong>Swag:</strong>
              </label>
              <div
                style={{ display: "flex", flexDirection: "column", flex: 1 }}
              >
                <input
                  id="sizeSlider"
                  type="range"
                  min={MIN_SIZE_LEVEL}
                  max={MAX_SIZE_LEVEL}
                  step={1}
                  value={sizeInput}
                  aria-valuetext={`Swag ${sizeInput} of ${MAX_SIZE_LEVEL}`}
                  onInput={(e) =>
                    setSizeInput(normalizeSizeLevel(e.currentTarget.value))
                  }
                  className="slider"
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                    marginTop: "2px",
                  }}
                >
                  <span aria-hidden="true">{MIN_SIZE_LEVEL}</span>
                  <output
                    htmlFor="sizeSlider"
                    aria-live="polite"
                    style={{
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {sizeInput}
                  </output>
                  <span aria-hidden="true">{MAX_SIZE_LEVEL}</span>
                </div>
              </div>
            </div>

            <div
              className="row"
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <label
                htmlFor="seedInput"
                style={{
                  fontWeight: 700,
                  minWidth: "56px",
                  marginRight: "8px",
                }}
              >
                Seed
              </label>
              <input
                id="seedInput"
                className="input"
                type="text"
                value={seedInput}
                placeholder={String(seed)}
                onChange={(e) => setSeedInput(e.target.value)}
              />
            </div>
            <div className="row" style={{ alignItems: "center", gap: "12px" }}>
              <span>Timer</span>
              <div className="seg" role="group" aria-label="Timer">
                <button
                  type="button"
                  aria-pressed={!timerOn}
                  onClick={() => setTimerEnabled(false)}
                >
                  Off
                </button>
                <button
                  type="button"
                  aria-pressed={timerOn}
                  onClick={() => setTimerEnabled(true)}
                >
                  On
                </button>
              </div>
              {timerOn && (
                <div
                  style={{ marginLeft: 12, fontVariantNumeric: "tabular-nums" }}
                >
                  Time:{" "}
                  {formatMs(
                    elapsedMs + (timerStart ? nowTick - timerStart : 0),
                  )}
                </div>
              )}
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setShowOptions(false)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={() => {
                  const s = (seedInput || "").trim();
                  let newS = null;
                  if (s.length) {
                    if (/^\d+$/.test(s)) {
                      newS = parseInt(s, 10) >>> 0;
                    } else {
                      newS = hashStringToInt(s);
                    }
                  }
                  setShowOptions(false);
                  setSizeLevel(normalizeSizeLevel(sizeInput));
                  if (newS !== null) setSeed(newS);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showStatus ? (
        <div className="card cluecard" style={{ marginTop: "12px" }}>
          {loading && (
            <div>
              <strong>Loading</strong> crosswordclues.csv…
            </div>
          )}
          {!loading && error && <div className="error">{String(error)}</div>}
          {!loading && !error && !bank.length && (
            <div className="error">No data found in crosswordclues.csv</div>
          )}
          <p style={{ marginTop: "8px" }}>
            Place a 2-column <code>crosswordclues.csv</code> (Answer, Clue) next
            to this HTML and refresh. If you opened this file with{" "}
            <code>file://</code>, run a local server (e.g.,{" "}
            <code>python -m http.server</code>).
          </p>
        </div>
      ) : (
        <div className={"two" + (revealMode ? " reveal-cursor" : "")}>
          <div>
            <div className="card sticky-grid">
              <div className="gridwrap" ref={wrapRef}>
                <div
                  className="cells"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, bounds.maxC - bounds.minC + 1)}, ${cellPx}px)`,
                    gridTemplateRows: `repeat(${Math.max(1, bounds.maxR - bounds.minR + 1)}, ${cellPx}px)`,
                    width: `${cellPx * Math.max(1, bounds.maxC - bounds.minC + 1)}px`,
                    height: `${cellPx * Math.max(1, bounds.maxR - bounds.minR + 1)}px`,
                  }}
                >
                  {renderCells()}
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="card cluecard">
              <h2>Across</h2>
              <ul
                className="cluelist"
                style={{
                  maxHeight: availableHeight + "px",
                  overflow: "auto",
                  paddingRight: "6px",
                }}
              >
                {across.length ? (
                  across.map((p) => {
                    const isSel =
                      selectedPlacement &&
                      p.number === selectedPlacement.number &&
                      p.dir === selectedPlacement.dir;
                    return (
                      <li
                        key={"A-" + p.number + "-" + p.answer}
                        className={
                          "clue" +
                          (isSel ? " selected" : "") +
                          (isPlacementCorrect(p, userGrid) ? " done" : "")
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => handlePlacementKeyDown(event, p)}
                        onClick={() => handlePlacementSelect(p)}
                      >
                        <span className="clue-num">{p.number}</span>
                        <span className="clue-text">{p.clue}</span>
                      </li>
                    );
                  })
                ) : (
                  <li>(none)</li>
                )}
              </ul>
            </div>
            <div className="card cluecard" style={{ marginTop: "16px" }}>
              <h2>Down</h2>
              <ul
                className="cluelist"
                style={{
                  maxHeight: availableHeight + "px",
                  overflow: "auto",
                  paddingRight: "6px",
                }}
              >
                {down.length ? (
                  down.map((p) => {
                    const isSel =
                      selectedPlacement &&
                      p.number === selectedPlacement.number &&
                      p.dir === selectedPlacement.dir;
                    return (
                      <li
                        key={"D-" + p.number + "-" + p.answer}
                        className={
                          "clue" +
                          (isSel ? " selected" : "") +
                          (isPlacementCorrect(p, userGrid) ? " done" : "")
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => handlePlacementKeyDown(event, p)}
                        onClick={() => handlePlacementSelect(p)}
                      >
                        <span className="clue-num">{p.number}</span>
                        <span className="clue-text">{p.clue}</span>
                      </li>
                    );
                  })
                ) : (
                  <li>(none)</li>
                )}
              </ul>
            </div>

            <div className="btnrow">
              <button
                id="revealBtn"
                className={"btn reveal" + (revealMode ? " active" : "")}
                onClick={() => {
                  setRevealMode(true);
                }}
                aria-pressed={revealMode}
              >
                Reveal
              </button>
              <button
                id="todayBtn"
                className="btn"
                onClick={() => {
                  setRevealMode(false);
                  setActive(null);
                  setDir(DIRS.ACROSS);
                  setSeed(defaultDailySeed());
                }}
              >
                Today
              </button>
              <button
                id="randBtn"
                className="btn"
                onClick={() => {
                  setRevealMode(false);
                  setActive(null);
                  setDir(DIRS.ACROSS);
                  setSeed(newRandomSeed());
                }}
              >
                Random
              </button>
              <button
                id="optBtn"
                className="btn"
                onClick={() => {
                  setSeedInput(String(seed));
                  setSizeInput(sizeLevel);
                  setShowOptions(true);
                }}
              >
                Options
              </button>

              {showCongrats && (
                <div className="overlay" style={{ zIndex: 12000 }}>
                  <div
                    className="modal"
                    role="dialog"
                    aria-modal="true"
                    style={{ textAlign: "center", width: "min(90vw, 520px)" }}
                  >
                    <h3>Congratulations!</h3>
                    <p>You solved the puzzle. 🎉</p>

                    <p style={{ marginTop: 4, fontSize: 14, opacity: 0.8 }}>
                      {timerOn
                        ? "Your time: " +
                          formatMs(
                            finalMs !== null
                              ? finalMs
                              : elapsedMs +
                                  (timerStart ? nowTick - timerStart : 0),
                          )
                        : ""}
                    </p>

                    {missedCount > 0 && (
                      <div className="card" style={{ marginTop: 8 }}>
                        <h4 style={{ margin: "0 0 6px 0" }}>
                          You needed help on
                        </h4>
                        <div
                          className="missedScroll"
                          style={{
                            fontSize: 14,
                            lineHeight: 1.4,
                            maxHeight: "40vh",
                            overflowY: "auto",
                            paddingRight: "6px",
                            textAlign: "center",
                          }}
                        >
                          {getMissedPlacements().map((m, idx) => (
                            <div
                              key={idx}
                              style={{
                                margin: "10px 0 16px 0",
                                textAlign: "center",
                              }}
                            >
                              <div style={{ fontSize: 14, opacity: 0.85 }}>
                                {m.clue}
                              </div>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 700,
                                  letterSpacing: "0.5px",
                                  marginTop: 2,
                                }}
                              >
                                {m.answer}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className="actions"
                      style={{ justifyContent: "flex-end" }}
                    >
                      <button
                        className="btn"
                        onClick={() => setShowCongrats(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="credit">created by micah etter, md</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Root() {
  return <App />;
}
const root = createRoot(document.getElementById("root"));
root.render(<Root />);
