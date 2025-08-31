import React, { useEffect, useMemo, useRef, useState } from "react";

// NeuroCross — Daily Neurology Crossword (Prototype)
// Single-file React app. No external libs.
// Deterministic daily puzzle: seeded by local date (America/Phoenix).
// All clues neurology-themed. No artificial cap on number of placed words.

// ---------- Utility: seeded RNG (Mulberry32) ----------
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToInt(str: string) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleInPlace<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------- Words & Clues (neurology-themed) ----------
// Keep answers A–Z only, no spaces/hyphens.
const BANK = (
  [
    ["APHASIA", "Language impairment from dominant hemisphere lesion"],
    ["BROCA", "Inferior frontal language area for speech production"],
    ["WERNICKE", "Posterior temporal language area for comprehension"],
    ["BABINSKI", "Upgoing plantar response"],
    ["ATAXIA", "Incoordination typically from cerebellar dysfunction"],
    ["CEREBELLUM", "Coordination and balance center"],
    ["THALAMUS", "Major relay for sensory pathways to cortex"],
    ["PARKINSON", "Bradykinesia, rigidity, rest tremor"],
    ["ALZHEIMER", "Most common cause of dementia"],
    ["MIGRAINE", "Headache with aura in some patients"],
    ["SEIZURE", "Paroxysmal abnormal synchronized neuronal activity"],
    ["EPILEPSY", "Tendency to have unprovoked seizures"],
    ["STATUS", "Seizure lasting >5 minutes or repeated without recovery"],
    ["STROKE", "Acute neurologic deficit from vascular cause"],
    ["ISCHEMIA", "Inadequate blood supply to tissue"],
    ["INFARCT", "Tissue death from ischemia"],
    ["BASILAR", "Trunk artery supplying brainstem and cerebellum"],
    ["PONS", "Brainstem segment between midbrain and medulla"],
    ["MEDULLA", "Houses nuclei for autonomic functions and cranial nerves"],
    ["OPTIC", "Nerve conveying visual information"],
    ["TRIGEMINAL", "Cranial nerve for facial sensation"],
    ["VAGUS", "Cranial nerve X with parasympathetic output"],
    ["MIDBRAIN", "Contains superior and inferior colliculi"],
    ["CAROTID", "Artery commonly involved in anterior circulation stroke"],
    ["VENTRICLE", "CSF-filled brain cavity"],
    ["MENINGES", "Dura, arachnoid, and pia"],
    ["MYELIN", "Insulating sheath around axons"],
    ["AXON", "Neuronal process conducting action potentials"],
    ["DENDRITE", "Branching neuronal input structure"],
    ["SYNAPSE", "Junction between neurons"],
  ]
).map(([a, c]) => ({ answer: a.replace(/[^A-Z]/g, "").toUpperCase(), clue: c }));

// Limit internal clue bank to ~30 for now (CSV import planned)
const BANK_LIMITED = BANK.slice(0, 30);

// ---------- Date helpers ----------
function phoenixYYYYMMDD(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Phoenix",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const d = parts.find((p) => p.type === "day")!.value;
    return `${y}-${m}-${d}`; // YYYY-MM-DD
  } catch {
    // Fallback: local date
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

// ---------- Crossword generation ----------
const DIRS = { ACROSS: "across", DOWN: "down" } as const;

type Dir = typeof DIRS[keyof typeof DIRS];

type Placement = {
  answer: string;
  clue: string;
  row: number;
  col: number;
  dir: Dir;
  number?: number;
};

function makeEmptyGrid(size: number) {
  return Array.from({ length: size }, () => Array<string | null>(size).fill(null));
}

function canPlace(word: string, row: number, col: number, dir: Dir, grid: (string | null)[][]) {
  const size = grid.length;
  const len = word.length;
  if (dir === DIRS.ACROSS) {
    if (col < 0 || col + len > size || row < 0 || row >= size) return false;
    // no letter immediately before or after
    if (col - 1 >= 0 && grid[row][col - 1] !== null) return false;
    if (col + len < size && grid[row][col + len] !== null) return false;
    for (let i = 0; i < len; i++) {
      const r = row, c = col + i;
      const cell = grid[r][c];
      if (cell !== null && cell !== word[i]) return false;
      if (cell === null) {
        // perpendicular adjacency check (above/below empty)
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
      const r = row + i, c = col;
      const cell = grid[r][c];
      if (cell !== null && cell !== word[i]) return false;
      if (cell === null) {
        if (c - 1 >= 0 && grid[r][c - 1] !== null) return false;
        if (c + 1 < size && grid[r][c + 1] !== null) return false;
      }
    }
    return true;
  }
}

function placeWord(word: string, row: number, col: number, dir: Dir, grid: (string | null)[][]) {
  for (let i = 0; i < word.length; i++) {
    const r = dir === DIRS.ACROSS ? row : row + i;
    const c = dir === DIRS.ACROSS ? col + i : col;
    grid[r][c] = word[i];
  }
}

// Try to place words; backtracking-lite with multiple passes
function generateCrosswordFromWords(words: { answer: string; clue: string }[], seed: number, size = 13) {
  const rng = mulberry32(seed);
  const grid = makeEmptyGrid(size);
  const placements: Placement[] = [];
  const copy = [...words];
  shuffleInPlace(copy, rng);

  // Place the first word across near the center
  const first = copy.shift();
  if (!first) return { grid, placements, numbers: [], bounds: { minR: 0, maxR: size - 1, minC: 0, maxC: size - 1 } };
  const mid = Math.floor(size / 2);
  const startCol = Math.max(0, Math.min(size - first.answer.length, mid - Math.floor(first.answer.length / 2)));
  placeWord(first.answer, mid, startCol, DIRS.ACROSS, grid);
  placements.push({ ...first, row: mid, col: startCol, dir: DIRS.ACROSS });

  // Helper: find all positions of letter L in grid
  function findLetterPositions(letter: string) {
    const hits: [number, number][] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === letter) hits.push([r, c]);
      }
    }
    return hits;
  }

  // Attempt to place the rest (must cross something already on the board)
  for (const w of copy) {
    const word = w.answer;
    let placed = false;

    const crossLetters = Array.from(new Set(word.split("")));
    shuffleInPlace(crossLetters, rng);
    for (const L of crossLetters) {
      if (placed) break;
      const positions = findLetterPositions(L);
      if (positions.length === 0) continue;
      // randomize indices within word where letter occurs
      const idxs: number[] = [];
      for (let i = 0; i < word.length; i++) if (word[i] === L) idxs.push(i);
      shuffleInPlace(idxs, rng);
      for (const i of idxs) {
        if (placed) break;
        for (const [r, c] of positions) {
          // Try ACROSS with crossing at (r,c)
          const acCol = c - i;
          if (canPlace(word, r, acCol, DIRS.ACROSS, grid)) {
            placeWord(word, r, acCol, DIRS.ACROSS, grid);
            placements.push({ ...w, row: r, col: acCol, dir: DIRS.ACROSS });
            placed = true;
            break;
          }
          // Try DOWN with crossing at (r,c)
          const dnRow = r - i;
          if (canPlace(word, dnRow, c, DIRS.DOWN, grid)) {
            placeWord(word, dnRow, c, DIRS.DOWN, grid);
            placements.push({ ...w, row: dnRow, col: c, dir: DIRS.DOWN });
            placed = true;
            break;
          }
        }
      }
    }

    // If no legal crossing exists, skip this word (prevents floating components)
    if (!placed) { /* skipped to maintain connectivity */ }
  }

  // After placement, prune any accidentally isolated word (safety net)
  pruneIsolatedWords(grid, placements);

  // Compute numbering for Across/Down starts
  let num = 1;
  const numbers = Array.from({ length: size }, () => Array<number | null>(size).fill(null));
  function isLetter(r: number, c: number) {
    return r >= 0 && r < size && c >= 0 && c < size && grid[r][c] !== null;
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isLetter(r, c)) continue;
      const startsAcross = !isLetter(r, c - 1) && isLetter(r, c + 0) && isLetter(r, c + 1);
      const startsDown = !isLetter(r - 1, c) && isLetter(r, c + 0) && isLetter(r + 1, c);
      if (startsAcross || startsDown) numbers[r][c] = num++;
    }
  }

  // Attach clue numbers to placements
  function startNumberForPlacement(p: Placement) {
    const { row, col } = p;
    return numbers[row][col]!;
  }
  placements.forEach((p) => (p.number = startNumberForPlacement(p)));

  // Trim to the minimal bounding box to render
  let minR = size, maxR = -1, minC = size, maxC = -1;
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
    // shouldn't happen, but fall back
    minR = 0; maxR = size - 1; minC = 0; maxC = size - 1;
  }

  return { grid, placements, numbers, bounds: { minR, maxR, minC, maxC } };
}

function pickDailyWords(rng: () => number) {
  const pool = [...BANK_LIMITED];
  // Slightly favor medium-length answers for easier placement
  pool.sort((a, b) => Math.abs(a.answer.length - 7) - Math.abs(b.answer.length - 7));
  shuffleInPlace(pool, rng);
  const chosen: { answer: string; clue: string }[] = [];
  const seen = new Set<string>();
  for (const item of pool) {
    if (item.answer.length < 3 || item.answer.length > 13) continue;
    if (seen.has(item.answer)) continue;
    chosen.push(item);
    seen.add(item.answer);
  }
  return chosen;
}

function dateToSeed(dstr: string) { return hashStringToInt(dstr); }

// ---------- UI helpers ----------
function useKeyDown(handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => handler(e);
    window.addEventListener("keydown", f as any);
    return () => window.removeEventListener("keydown", f as any);
  }, [handler]);
}

function cellKey(r: number, c: number) { return `${r}:${c}`; }

function range(a: number, b: number) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

function scorePlacements(grid: (string | null)[][], placements: Placement[]) {
  // Count intersections: cells shared by >1 placement
  const H = grid.length, W = grid[0].length;
  const counts = Array.from({ length: H }, () => Array(W).fill(0));
  for (const p of placements) {
    for (let i = 0; i < p.answer.length; i++) {
      const r = p.dir === DIRS.ACROSS ? p.row : p.row + i;
      const c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
      counts[r][c] += 1;
    }
  }
  let x = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (counts[r][c] > 1) x++;
  return x;
}

// Safety net: remove any words that don't intersect another word when there are 2+ words
function pruneIsolatedWords(grid: (string | null)[][], placements: Placement[]) {
  if (placements.length <= 1) return;
  const H = grid.length, W = grid[0].length;
  const counts = Array.from({ length: H }, () => Array(W).fill(0));
  for (const p of placements) {
    for (let i = 0; i < p.answer.length; i++) {
      const r = p.dir === DIRS.ACROSS ? p.row : p.row + i;
      const c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
      counts[r][c] += 1;
    }
  }
  // Filter placements that have at least one crossed cell
  const keep = placements.filter(p => {
    for (let i = 0; i < p.answer.length; i++) {
      const r = p.dir === DIRS.ACROSS ? p.row : p.row + i;
      const c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
      if (counts[r][c] > 1) return true;
    }
    return false;
  });
  if (keep.length === placements.length) return; // nothing to prune
  // Rebuild grid from kept placements
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) grid[r][c] = null;
  for (const p of keep) {
    for (let i = 0; i < p.answer.length; i++) {
      const r = p.dir === DIRS.ACROSS ? p.row : p.row + i;
      const c = p.dir === DIRS.ACROSS ? p.col + i : p.col;
      grid[r][c] = p.answer[i];
    }
  }
  // mutate original array
  placements.length = 0;
  for (const p of keep) placements.push(p);
}

function isSolved(user: (string | null)[][], sol: (string | null)[][]) {
  for (let r = 0; r < sol.length; r++) {
    for (let c = 0; c < sol[r].length; c++) {
      const s = sol[r][c];
      if (s === null) continue;
      if ((user[r]?.[c] || "") !== s) return false;
    }
  }
  return true;
}

function fireConfetti(count: number = 12) {
  // Subtle emoji confetti
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);
  const EMOJIS = ["🎉", "✨", "⭐"]; // fewer, calmer
  const N = Math.max(1, Math.min(40, Math.floor(count)));
  for (let i = 0; i < N; i++) {
    const span = document.createElement("span");
    span.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    span.style.position = "absolute";
    span.style.left = Math.random() * 100 + "vw";
    span.style.top = -10 + "px";
    span.style.fontSize = (12 + Math.random() * 12) + "px"; // smaller
    span.style.opacity = "0.9";
    span.style.transition = "transform 1s ease-out, opacity 1s ease-out";
    container.appendChild(span);
    requestAnimationFrame(() => {
      span.style.transform = `translateY(${70 + Math.random() * 80}vh) rotate(${(Math.random() - 0.5) * 180}deg)`;
      span.style.opacity = "0";
    });
  }
  setTimeout(() => container.remove(), 1100);
}

// ---------- Components ----------
function ClueList({ title, list, onJump, maxH }: { title: string; list: Placement[]; onJump: (p: Placement) => void; maxH?: number }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#ffffff", border: "2px solid #000000" }}>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <ul className="flex flex-col gap-2 overflow-auto pr-1" style={{ maxHeight: maxH ? `${maxH}px` : undefined }}>
        {list.length === 0 ? (
          <li className="opacity-70">(none)</li>
        ) : (
          list.map((p) => (
            <li key={`${title}-${p.number}-${p.answer}`}>
              <button className="text-left hover:underline w-full" onClick={() => onJump(p)} title={p.answer}>
                <b className="mr-2">{p.number}.</b> {p.clue}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ---------- Main Component ----------
export default function App() {
  const [dateStr] = useState(phoenixYYYYMMDD());
  const seed = useMemo(() => dateToSeed(dateStr), [dateStr]);
  const rng = useMemo(() => mulberry32(seed), [seed]);
  const words = useMemo(() => pickDailyWords(rng), [rng]);

  // Threshold preferences
  const MIN_WORDS = 8; // retry until we reach at least 8 words
  const MAX_SALTS = 80; // try a sequence of salts deterministically for the given date

  // Try multiple times to get a reasonably intersecting grid
  const { grid, placements, numbers, bounds } = useMemo(() => {
    let best: any = null;
    for (let salt = 0; salt < MAX_SALTS; salt++) {
      const g = generateCrosswordFromWords(words, seed + salt, 13);
      const placedCount = g.placements.length;
      const crosses = scorePlacements(g.grid, g.placements);
      const score = placedCount * 10 + crosses;
      if (!best || score > best.score) best = { ...g, score, salt };
      if (placedCount >= MIN_WORDS) return g; // deterministic: first that meets threshold
    }
    return best || generateCrosswordFromWords(words, seed, 13);
  }, [words, seed]);

  // Player grid state
  const [userGrid, setUserGrid] = useState<(string | null)[][]>(() => cloneGrid(grid));
  useEffect(() => setUserGrid(cloneGrid(grid)), [grid]);

  // Self-tests (console)
  useEffect(() => { if (typeof window !== "undefined") runSelfTests(); }, []);

  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [dir, setDir] = useState<Dir>(DIRS.ACROSS);
  const [showErrors] = useState(false);
  const [complete, setComplete] = useState(false);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  useEffect(() => setLocked(new Set()), [grid]);

  // Pixel-perfect sizing so the whole grid is visible without scrolling
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const [cellPx, setCellPx] = useState(32);
  const cols = Math.max(1, bounds.maxC - bounds.minC + 1);
  const rows = Math.max(1, bounds.maxR - bounds.minR + 1);
  const [availableHeight, setAvailableHeight] = useState(400);
  useEffect(() => {
    const recalc = () => {
      if (!gridWrapRef.current) return;
      const w = gridWrapRef.current.clientWidth || 320;
      const rect = gridWrapRef.current.getBoundingClientRect();
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const footerBuffer = 80; // reserve some space for footer/margins
      const availH = Math.max(140, Math.floor(vh - rect.top - footerBuffer));
      setAvailableHeight(availH);
      const px = Math.max(18, Math.min(Math.floor(w / cols), Math.floor(availH / rows)));
      setCellPx(px);
    };
    recalc();
    const ro = new ResizeObserver(() => recalc());
    if (gridWrapRef.current) ro.observe(gridWrapRef.current);
    window.addEventListener('resize', recalc);
    return () => { ro.disconnect(); window.removeEventListener('resize', recalc); };
  }, [cols, rows]);

  useEffect(() => { setComplete(isSolved(userGrid, grid)); }, [userGrid, grid]);

  function cloneGrid(g: (string | null)[][]) { return g.map(row => row.map(x => (x ? "" : null))); }
  function within(r: number, c: number) { return r >= bounds.minR && r <= bounds.maxR && c >= bounds.minC && c <= bounds.maxC; }
  function isLetterCell(r: number, c: number) { return within(r, c) && grid[r][c] !== null; }

  // Find word extent and number for a cell/direction
  function getWordSpan(r: number, c: number, d: Dir) {
    if (!isLetterCell(r, c)) return null;
    let r0 = r, c0 = c;
    if (d === DIRS.ACROSS) { while (c0 - 1 >= 0 && grid[r][c0 - 1] !== null) c0--; }
    else { while (r0 - 1 >= 0 && grid[r0 - 1][c] !== null) r0--; }
    let len = 0; const cells: [number, number][] = [];
    if (d === DIRS.ACROSS) { while (c0 + len < grid.length && grid[r][c0 + len] !== null) { cells.push([r, c0 + len]); len++; } }
    else { while (r0 + len < grid.length && grid[r0 + len][c] !== null) { cells.push([r0 + len, c]); len++; } }
    const number = numbers?.[r0]?.[c0] ?? null;
    return { startR: r0, startC: c0, len, cells, number };
  }

  function moveNext(r: number, c: number, d: Dir, backwards = false) {
    const span = getWordSpan(r, c, d);
    if (!span) return null;
    const idx = span.cells.findIndex(([rr, cc]) => rr === r && cc === c);
    let nxt = idx + (backwards ? -1 : 1);
    if (nxt < 0) nxt = 0; // clamp
    if (nxt >= span.cells.length) nxt = span.cells.length - 1;
    return { r: span.cells[nxt][0], c: span.cells[nxt][1] };
  }

  function pickSmartDir(r: number, c: number, preferred: Dir, g: (string | null)[][]): Dir {
    // Measure contiguous span lengths in both directions from the clicked cell
    const lenAcross = (() => {
      let c0 = c; while (c0 - 1 >= 0 && g[r][c0 - 1] !== null) c0--;
      let n = 0; while (c0 + n < g.length && g[r][c0 + n] !== null) n++;
      return n;
    })();
    const lenDown = (() => {
      let r0 = r; while (r0 - 1 >= 0 && g[r0 - 1][c] !== null) r0--;
      let n = 0; while (r0 + n < g.length && g[r0 + n][c] !== null) n++;
      return n;
    })();

    const hasAcross = lenAcross >= 2; // true horizontal word
    const hasDown = lenDown >= 2;     // true vertical word

    if (hasAcross && !hasDown) return DIRS.ACROSS;
    if (!hasAcross && hasDown) return DIRS.DOWN;
    if (hasAcross && hasDown) {
      if (lenDown > lenAcross) return DIRS.DOWN;   // prefer the longer run
      if (lenAcross > lenDown) return DIRS.ACROSS; // otherwise across
      return preferred; // tie-breaker: maintain current preference
    }
    // If neither looks like a full word (isolated single), keep preference
    return preferred;
  }

  useKeyDown((e) => {
    if (!active) return;
    if (e.key === "Tab") { e.preventDefault(); setDir((d) => d === DIRS.ACROSS ? DIRS.DOWN : DIRS.ACROSS); return; }
    if (e.key === "Backspace") {
      e.preventDefault();
      const { r, c } = active;
      if (!isLetterCell(r, c)) return;
      if (locked.has(cellKey(r, c))) return; // prevent editing locked cells
      setUserGrid((ug) => {
        const g = ug.map((row) => row.slice());
        g[r][c] = "";
        return g;
      });
      const prev = moveNext(r, c, dir, true);
      if (prev) setActive(prev);
      return;
    }
    if (/^[a-z]$/i.test(e.key)) {
      e.preventDefault();
      const ch = (e.key as string).toUpperCase();
      const { r, c } = active;
      if (!isLetterCell(r, c)) return;
      if (locked.has(cellKey(r, c))) return; // prevent editing locked cells
      let newlyCompleted = 0;
      setUserGrid((ug) => {
        const g = ug.map((row) => row.slice());
        g[r][c] = ch;
        // check and lock completed words (across & down)
        const spans = [getWordSpan(r, c, DIRS.ACROSS), getWordSpan(r, c, DIRS.DOWN)].filter(Boolean) as any[];
        const newLocked = new Set(locked);
        for (const span of spans) {
          // Only treat as a word if length >= 2
          if (span.cells.length < 2) continue;
          let ok = true;
          for (const [rr, cc] of span.cells) {
            if (!grid[rr][cc] || g[rr][cc] !== grid[rr][cc]) { ok = false; break; }
          }
          const already = span.cells.every(([rr, cc]: [number, number]) => locked.has(cellKey(rr, cc)));
          if (ok && !already) {
            newlyCompleted++;
            for (const [rr, cc] of span.cells) newLocked.add(cellKey(rr, cc));
          }
        }
        if (newLocked.size !== locked.size) setLocked(new Set(newLocked));
        return g;
      });
      if (newlyCompleted > 0) {
        fireConfetti(12);
      }
      const nxt = moveNext(r, c, dir, false);
      if (nxt) setActive(nxt);
      return;
    }
    // Arrow navigation
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if ((e.key as string) in delta) {
      e.preventDefault();
      const [dr, dc] = delta[e.key as string];
      const nr = active.r + dr, nc = active.c + dc;
      if (within(nr, nc) && isLetterCell(nr, nc)) setActive({ r: nr, c: nc });
    }
  });

  // Error map (kept for optional future UI)
  const errorSet = useMemo(() => {
    if (!showErrors) return new Set<string>();
    const errs = new Set<string>();
    for (let r = bounds.minR; r <= bounds.maxR; r++) {
      for (let c = bounds.minC; c <= bounds.maxC; c++) {
        if (grid[r][c] && userGrid[r][c] && userGrid[r][c] !== grid[r][c]) errs.add(cellKey(r, c));
      }
    }
    return errs;
  }, [showErrors, userGrid, grid, bounds]);

  const across = useMemo(() => placements.filter(p => p.dir === DIRS.ACROSS).map(p => ({ ...p })).sort((a, b) => (a.number! - b.number!)), [placements]);
  const down = useMemo(() => placements.filter(p => p.dir === DIRS.DOWN).map(p => ({ ...p })).sort((a, b) => (a.number! - b.number!)), [placements]);

  return (
    <div className="w-full min-h-screen flex flex-col items-center gap-4 p-4" style={{ background: "#ffffff", color: "#111111" }}>
      <div className="w-full max-w-6xl flex flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">NeuroCross</h1>
        </header>

        <div className="flex flex-col lg:grid lg:grid-cols-[minmax(260px,1fr)_minmax(260px,340px)] gap-6">
          {/* Grid */}
          <div className="flex flex-col gap-3">
            <div className="rounded-xl shadow-lg overflow-hidden inline-block" style={{ background: "#ffffff", border: "2px solid #000000" }}>
              <div className="p-2" ref={gridWrapRef}>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`, gridTemplateRows: `repeat(${rows}, ${cellPx}px)`, width: `${cellPx * cols}px`, height: `${cellPx * rows}px`, gap: 0 }}>
                  {range(bounds.minR, bounds.maxR).flatMap(r => (
                    range(bounds.minC, bounds.maxC).map(c => {
                      const letter = grid[r][c];
                      const isCell = letter !== null;
                      const isActive = !!active && active.r === r && active.c === c;
                      const showLetter = userGrid[r][c] || "";
                      const num = numbers?.[r]?.[c] ?? null;
                      const id = cellKey(r, c);
                      const isLocked = locked.has(id);
                      const wrong = errorSet.has(id);
                      return (
                        <div
                          key={id}
                          onClick={() => isCell && (setActive({ r, c }), setDir(pickSmartDir(r, c, dir, grid)))}
                          className={"cell select-none relative " + (isCell ? "open cursor-text" : "blocked")}
                          style={{
                            background: !isCell ? "#000000" : (isLocked ? (isActive ? "#fcd34d" : "#fde68a") : (isActive ? "#e6f9ed" : "#ffffff")),
                            border: "1px solid #000",
                            boxSizing: "border-box",
                            outline: (isActive && isCell) ? "2px solid #000" : "none",
                            outlineOffset: (isActive && isCell) ? "-2px" : undefined
                          }}
                        >
                          {isCell && num ? (
                            <div className="absolute" style={{ top: 2, left: 4, fontSize: 10, opacity: 0.7 }}>{num}</div>
                          ) : null}
                          {isCell ? (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                              <span style={{ color: isLocked ? "#7c5c00" : (wrong ? "#dc2626" : "#111111") }}>{showLetter}</span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Clues */}
          <div className="flex flex-col gap-4">
            <ClueList title="Across" list={across as any} onJump={(p) => { setActive({ r: p.row, c: p.col }); setDir(p.dir as Dir); }} maxH={availableHeight} />
            <ClueList title="Down" list={down as any} onJump={(p) => { setActive({ r: p.row, c: p.col }); setDir(p.dir as Dir); }} maxH={availableHeight} />
          </div>
        </div>

        <div className="pt-2 text-xs opacity-70 text-right">Created by Micah Etter, MD</div>
      </div>
    </div>
  );
}

// -------- Self-tests (console only) --------
function runSelfTests() {
  try {
    const testSeed = 424242;
    const rng = mulberry32(testSeed);
    const words = pickDailyWords(rng);
    const g = generateCrosswordFromWords(words, testSeed, 13);

    // Basic structure
    console.assert(g && Array.isArray(g.grid), "Grid should be an array");
    console.assert(g.bounds && Number.isInteger(g.bounds.minC) && Number.isInteger(g.bounds.maxC), "Bounds should be defined");
    console.assert(g.bounds.maxC - g.bounds.minC + 1 >= 1, "Column count must be >= 1");

    // isSolved sanity
    const emptyUser = g.grid.map((row: (string | null)[]) => row.map((ch) => (ch ? "" : null)));
    const solvedUser = g.grid.map((row: (string | null)[]) => row.map((ch) => (ch ? ch : null)));
    console.assert(isSolved(emptyUser as any, g.grid) === false, "Empty grid should not be solved");
    console.assert(isSolved(solvedUser as any, g.grid) === true, "Solved grid should be detected as solved");

    // Numbering & placement integrity
    const allHaveNumbers = g.placements.every((p: any) => Number.isInteger(p.number));
    console.assert(allHaveNumbers, "Every placement should have a clue number");
    const numbersSorted = [...g.placements.filter((p: any) => p.dir === 'across')]
      .sort((a: any, b: any) => a.number - b.number)
      .every((p: any, i: number, a: any[]) => i === 0 || a[i - 1].number <= p.number);
    console.assert(numbersSorted, "Across numbers should be non-decreasing");

    // Determinism test
    const g2 = generateCrosswordFromWords(words, testSeed, 13);
    console.assert(JSON.stringify(g.bounds) === JSON.stringify(g2.bounds), "Generation should be deterministic for a fixed seed");

    // Intersections: every word intersects at least one other when there are >1 words
    if (g.placements.length > 1) {
      const H = g.grid.length, W = g.grid[0].length;
      const counts = Array.from({ length: H }, () => Array(W).fill(0));
      for (const p of g.placements) {
        for (let i = 0; i < p.answer.length; i++) {
          const r = p.dir === 'across' ? p.row : p.row + i;
          const c = p.dir === 'across' ? p.col + i : p.col;
          counts[r][c] += 1;
        }
      }
      const allIntersect = g.placements.every((p: any) => {
        for (let i = 0; i < p.answer.length; i++) {
          const r = p.dir === 'across' ? p.row : p.row + i;
          const c = p.dir === 'across' ? p.col + i : p.col;
          if (counts[r][c] > 1) return true;
        }
        return false;
      });
      console.assert(allIntersect, "All placements should intersect at least one other word");
    }

    // Placed count should be within expected bounds
    console.assert(g.placements.length >= 1 && g.placements.length <= BANK_LIMITED.length, "Placed count within expected bounds");

    // NEW: Consistency — placements must match the letters in the grid
    const covered = new Set<string>();
    for (const p of g.placements) {
      for (let i = 0; i < p.answer.length; i++) {
        const r = p.dir === 'across' ? p.row : p.row + i;
        const c = p.dir === 'across' ? p.col + i : p.col;
        console.assert(g.grid[r][c] !== null, "Placement covers non-letter cell");
        console.assert(g.grid[r][c] === p.answer[i], "Grid letter mismatch in placement");
        covered.add(`${r}:${c}`);
      }
    }
    // Every letter cell is covered by at least one placement
    for (let r = 0; r < g.grid.length; r++) {
      for (let c = 0; c < g.grid[r].length; c++) {
        if (g.grid[r][c] !== null) {
          console.assert(covered.has(`${r}:${c}`), "Letter cell not covered by any placement");
        }
      }
    }

    console.log("NeuroCross self-tests passed ✔");
  } catch (e) {
    console.error("NeuroCross self-tests FAILED", e);
  }
}
