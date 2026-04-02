// ============================================================
// EPILEPSY AWARENESS MAZE GAME (p5.js)
// ============================================================

// ============================================================
// CONSTANTS
// ============================================================
const CELL_SIZE = 48;
const PLAYER_SIZE = 20;
const PLAYER_SPEED = 2.5;
const RUN_SPEED = 4.5;
const EPISODE_DURATION_MIN = 4;
const EPISODE_DURATION_MAX = 5;
const BASE_VISIBILITY_RADIUS = 400;
const MIN_VISIBILITY_RADIUS = 130;
const STRESS_PASSIVE_RATE = 0.03;
const STRESS_RUN_RATE = 0.12;
const STRESS_NARROW_RATE = 0.08;
const STRESS_SCARY_RATE = 0.1;
const STRESS_CALM_DRAIN = -0.25;
const STRESS_STILL_DRAIN = -0.05;
const MICRO_SPIKE_CHANCE = 0.003;
const MICRO_SPIKE_AMOUNT = 8;
const ZOOM_OUT_SCALE = 0.5;
const ZOOM_OUT_STRESS_RATE = 0.2;
const ZOOM_OUT_VISIBILITY_MULT = 2.0;
const WALL_THICKNESS = 6;
const MORTAR_WIDTH = 2;

// ============================================================
// LEVEL CONFIGURATIONS
// ============================================================
const LEVEL_CONFIGS = {
  random: {
    name: 'Random',
    cols: 25, rows: 25,
    time: 90,
    stressMult: 1.0,
    microSpikes: true,
    description: 'Randomly generated maze'
  },
  level1: {
    name: 'Level 1: The Tutorial',
    cols: 10, rows: 10,
    time: 120,
    stressMult: 0.4,
    microSpikes: false,
    description: 'Learn the basics'
  },
  level2: {
    name: 'Level 2: The Pressure Cooker',
    cols: 20, rows: 20,
    time: 100,
    stressMult: 1.0,
    microSpikes: true,
    description: 'Just-in-time tension'
  },
  level3: {
    name: 'Level 3: The Gauntlet',
    cols: 25, rows: 25,
    time: 130,
    stressMult: 1.2,
    microSpikes: true,
    description: 'Master reversed controls'
  }
};

// ============================================================
// GAME STATE
// ============================================================
let gameState = 'menu'; // menu, charSelect, levelSelect, instructions, playing, paused, episode, win, lose
let gameMode = 'random'; // random, level1, level2, level3
let levelSelectIndex = 0;
const levelOptions = ['level1', 'level2', 'level3', 'random'];
let selectedChar = 0;
const characters = [
  { name: 'Knight', color: '#8a9bb2', accent: '#5a6880',
    speedMult: 1.3, stressMult: 1.4, trait: 'Fast but anxious',
    spdDesc: 'Moves 30% faster', strDesc: 'Stress rises 40% faster' },
  { name: 'Mage', color: '#8b6b4a', accent: '#5c4530',
    speedMult: 0.8, stressMult: 0.65, trait: 'Slow but calm',
    spdDesc: 'Moves 20% slower', strDesc: 'Stress rises 35% slower' },
  { name: 'Wolf', color: '#b0b8c0', accent: '#7a8590',
    speedMult: 1.0, stressMult: 1.0, trait: 'Balanced',
    spdDesc: 'Normal speed', strDesc: 'Normal stress rate' },
];

// Current maze dimensions (set per level)
let MAZE_COLS = 25;
let MAZE_ROWS = 25;
let MAZE_WIDTH = MAZE_COLS * CELL_SIZE;
let MAZE_HEIGHT = MAZE_ROWS * CELL_SIZE;
let GAME_TIME = 90;

let player = { x: 0, y: 0 };
let camX = 0; // current camera offset – updated each frame in drawGameplay()
let camY = 0;
let stress = 0;
let timer = GAME_TIME;
let maze = [];
let calmZones = [];
let scaryZones = [];
let narrowZones = [];
let highStressZones = []; // Level 3: mandatory high-stress areas
let tutorialSigns = [];   // Level 1: tutorial sign popups
let endPos = { x: 0, y: 0 };
let episodeTimer = 0;
let episodeDuration = 0;
let controlsInverted = false;
let screenShake = { x: 0, y: 0 };
let microSpikeActive = 0;
let lastTime = 0;
let dt = 0;
let arrowAngle = 0;
let timeBoosts = [];
const TIME_BOOST_AMOUNT = 5;
let timeBoostFlash = 0;
let isZoomedOut = false;
let activeTutorialSign = null; // currently displayed tutorial sign
let tutorialSignTimer = 0;
let shownSigns = new Set(); // track which signs the player has already seen

// Player animation state
let playerAnimFrame = 0;
let playerAnimTimer = 0;
let playerFacing = 1;
const ANIM_SPEED = 10;

// Texture & decoration state
let mazeTexture;
let decorations = [];

// Menu background image
let menuBgImage;

// p5.js fog buffer
let fogBuffer;

// ============================================================
// AUDIO (procedural - Web Audio API, not p5 sound)
// ============================================================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', vol = 0.15) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* ignore audio errors */ }
}

function playEpisodeSound() {
  playTone(80, 1.5, 'sawtooth', 0.1);
  playTone(120, 1.5, 'square', 0.05);
}

function playMicroSpikeSound() {
  playTone(300, 0.15, 'square', 0.08);
}

function playWinSound() {
  playTone(523, 0.2, 'sine', 0.2);
  setTimeout(() => playTone(659, 0.2, 'sine', 0.2), 150);
  setTimeout(() => playTone(784, 0.4, 'sine', 0.2), 300);
}

function playLoseSound() {
  playTone(200, 0.5, 'sawtooth', 0.15);
  setTimeout(() => playTone(150, 0.8, 'sawtooth', 0.1), 400);
}

function playStepSound() {
  if (frameCount % 15 === 0) {
    playTone(100 + random(50), 0.05, 'triangle', 0.03);
  }
}

// ============================================================
// BFS SOLVER - find shortest path through maze
// ============================================================
function solveMaze(startR, startC, endR, endC) {
  const visited = Array.from({ length: MAZE_ROWS }, () => Array(MAZE_COLS).fill(false));
  const parent = Array.from({ length: MAZE_ROWS }, () => Array(MAZE_COLS).fill(null));
  const queue = [{ r: startR, c: startC }];
  visited[startR][startC] = true;

  while (queue.length > 0) {
    const { r, c } = queue.shift();
    if (r === endR && c === endC) break;

    const cell = maze[r][c];
    const neighbors = [];
    if (!cell.top && r > 0) neighbors.push({ r: r - 1, c });
    if (!cell.bottom && r < MAZE_ROWS - 1) neighbors.push({ r: r + 1, c });
    if (!cell.left && c > 0) neighbors.push({ r, c: c - 1 });
    if (!cell.right && c < MAZE_COLS - 1) neighbors.push({ r, c: c + 1 });

    for (const n of neighbors) {
      if (!visited[n.r][n.c]) {
        visited[n.r][n.c] = true;
        parent[n.r][n.c] = { r, c };
        queue.push(n);
      }
    }
  }

  // Reconstruct path
  const path = [];
  let cur = { r: endR, c: endC };
  while (cur) {
    path.unshift(cur);
    cur = parent[cur.r][cur.c];
  }
  return path;
}

// ============================================================
// MAZE GENERATION (Recursive Backtracker)
// ============================================================
function generateMaze() {
  maze = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    maze[r] = [];
    for (let c = 0; c < MAZE_COLS; c++) {
      maze[r][c] = { top: true, right: true, bottom: true, left: true, visited: false };
    }
  }

  const stack = [];
  let current = { r: 0, c: 0 };
  maze[0][0].visited = true;
  stack.push(current);

  while (stack.length > 0) {
    const { r, c } = current;
    const neighbors = [];
    if (r > 0 && !maze[r - 1][c].visited) neighbors.push({ r: r - 1, c, dir: 'top' });
    if (c < MAZE_COLS - 1 && !maze[r][c + 1].visited) neighbors.push({ r, c: c + 1, dir: 'right' });
    if (r < MAZE_ROWS - 1 && !maze[r + 1][c].visited) neighbors.push({ r: r + 1, c, dir: 'bottom' });
    if (c > 0 && !maze[r][c - 1].visited) neighbors.push({ r, c: c - 1, dir: 'left' });

    if (neighbors.length > 0) {
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      if (next.dir === 'top') { maze[r][c].top = false; maze[next.r][next.c].bottom = false; }
      if (next.dir === 'right') { maze[r][c].right = false; maze[next.r][next.c].left = false; }
      if (next.dir === 'bottom') { maze[r][c].bottom = false; maze[next.r][next.c].top = false; }
      if (next.dir === 'left') { maze[r][c].left = false; maze[next.r][next.c].right = false; }
      maze[next.r][next.c].visited = true;
      stack.push(current);
      current = next;
    } else {
      current = stack.pop();
    }
  }
}

// Remove a wall between two adjacent cells
function removeWall(r1, c1, r2, c2) {
  if (r2 === r1 - 1) { maze[r1][c1].top = false; maze[r2][c2].bottom = false; }
  if (r2 === r1 + 1) { maze[r1][c1].bottom = false; maze[r2][c2].top = false; }
  if (c2 === c1 - 1) { maze[r1][c1].left = false; maze[r2][c2].right = false; }
  if (c2 === c1 + 1) { maze[r1][c1].right = false; maze[r2][c2].left = false; }
}

// ============================================================
// LEVEL SETUP FUNCTIONS
// ============================================================
function setupRandomLevel() {
  generateMaze();
  placePlayerAndRandomExit();

  // Calm zones (5-7)
  calmZones = [];
  const calmCount = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < calmCount; i++) {
    let cr, cc;
    do {
      cr = Math.floor(Math.random() * MAZE_ROWS);
      cc = Math.floor(Math.random() * MAZE_COLS);
    } while ((cr === 0 && cc === 0) || (cr === MAZE_ROWS - 1 && cc === MAZE_COLS - 1));
    calmZones.push({ r: cr, c: cc });
  }

  // Scary zones (6-10)
  scaryZones = [];
  const scaryCount = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < scaryCount; i++) {
    let sr, sc;
    do {
      sr = Math.floor(Math.random() * MAZE_ROWS);
      sc = Math.floor(Math.random() * MAZE_COLS);
    } while (
      (sr === 0 && sc === 0) ||
      calmZones.some(cz => cz.r === sr && cz.c === sc)
    );
    scaryZones.push({ r: sr, c: sc });
  }

  findNarrowZones();
  placeTimeBoosts(6 + Math.floor(Math.random() * 3));
  generateDecorations();

  highStressZones = [];
  tutorialSigns = [];
}

function setupLevel1() {
  // Tutorial: 10x10, mostly linear with clear signage
  generateMaze();

  // Open up extra paths to make it less confusing
  // Remove walls along a roughly straight path to make navigation easier
  const path = solveMaze(0, 0, MAZE_ROWS - 1, MAZE_COLS - 1);

  // Widen the solution path by removing adjacent walls where possible
  for (let i = 0; i < path.length; i++) {
    const { r, c } = path[i];
    // Try to open up cells adjacent to the path
    if (c + 1 < MAZE_COLS && i < path.length - 1) {
      const next = path[i + 1];
      if (next.c === c + 1 || next.c === c) {
        // Open parallel passage occasionally
        if (r + 1 < MAZE_ROWS && Math.random() < 0.3) {
          removeWall(r, c, r + 1, c);
        }
      }
    }
  }

  placePlayerAndExit();

  // Place calm zones generously - 4 spread evenly
  calmZones = [];
  const pathStep = Math.floor(path.length / 5);
  for (let i = 1; i <= 4; i++) {
    const idx = Math.min(i * pathStep, path.length - 2);
    calmZones.push({ r: path[idx].r, c: path[idx].c });
  }

  // Only 2 mild scary zones away from the main path
  scaryZones = [];
  for (let i = 0; i < 2; i++) {
    let sr, sc;
    do {
      sr = Math.floor(Math.random() * MAZE_ROWS);
      sc = Math.floor(Math.random() * MAZE_COLS);
    } while (
      (sr === 0 && sc === 0) ||
      (sr === MAZE_ROWS - 1 && sc === MAZE_COLS - 1) ||
      calmZones.some(cz => cz.r === sr && cz.c === sc) ||
      path.some(p => p.r === sr && p.c === sc)
    );
    scaryZones.push({ r: sr, c: sc });
  }

  findNarrowZones();
  placeTimeBoosts(4);
  generateDecorations();

  highStressZones = [];

  // Tutorial signs placed at key locations along the path
  tutorialSigns = [
    {
      r: path[Math.min(2, path.length - 1)].r,
      c: path[Math.min(2, path.length - 1)].c,
      title: 'OBJECTIVE',
      message: 'Reach the GREEN EXIT before time runs out!\nFollow the green arrow - it points the way.',
      color: [0, 255, 120]
    },
    {
      r: path[Math.min(pathStep, path.length - 1)].r,
      c: path[Math.min(pathStep, path.length - 1)].c,
      title: 'STRESS BAR',
      message: 'Watch the bar at the bottom - stress rises over time.\nStand still to calm down slightly.',
      color: [244, 67, 54]
    },
    {
      r: calmZones[0].r,
      c: calmZones[0].c,
      title: 'CALM ZONE',
      message: 'Yellow glowing areas REDUCE your stress.\nStay here to recover before moving on!',
      color: [255, 200, 100]
    },
    {
      r: path[Math.min(pathStep * 2, path.length - 1)].r,
      c: path[Math.min(pathStep * 2, path.length - 1)].c,
      title: 'RUNNING & ZOOM',
      message: 'Hold SHIFT to run faster (more stress!).\nPress Z to zoom out and see more (also stressful!).',
      color: [100, 180, 255]
    },
    {
      r: path[Math.min(pathStep * 3, path.length - 1)].r,
      c: path[Math.min(pathStep * 3, path.length - 1)].c,
      title: 'DANGER ZONES',
      message: 'Red glowing areas INCREASE stress faster.\nAvoid them or pass through quickly!',
      color: [200, 50, 50]
    }
  ];
}

function setupLevel2() {
  // Pressure Cooker: 20x20 with just-in-time calm zones
  generateMaze();
  placePlayerAndExit();

  const path = solveMaze(0, 0, MAZE_ROWS - 1, MAZE_COLS - 1);

  // Calculate stress accumulation along the path to place calm zones at breaking points
  // At normal walking speed with level stress mult, stress rises at ~STRESS_PASSIVE_RATE * 60 per second
  // Each cell takes roughly CELL_SIZE / PLAYER_SPEED frames = ~19 frames = ~0.32 seconds
  // So per cell: ~0.03 * 60 * 0.32 = ~0.576 stress per cell (base, before character mult)
  // We want calm zones when stress would reach ~85-95%

  calmZones = [];
  let simulatedStress = 0;
  const stressPerCell = STRESS_PASSIVE_RATE * 60 * (CELL_SIZE / PLAYER_SPEED / 60);
  const calmThreshold = 85; // place calm zone when stress would reach this

  for (let i = 0; i < path.length; i++) {
    simulatedStress += stressPerCell;

    // Account for narrow zones adding extra stress
    const cell = maze[path[i].r][path[i].c];
    const wallCount = (cell.top ? 1 : 0) + (cell.right ? 1 : 0) + (cell.bottom ? 1 : 0) + (cell.left ? 1 : 0);
    if (wallCount >= 3) {
      simulatedStress += STRESS_NARROW_RATE * 60 * (CELL_SIZE / PLAYER_SPEED / 60);
    }

    if (simulatedStress >= calmThreshold) {
      calmZones.push({ r: path[i].r, c: path[i].c });
      simulatedStress = 15; // calm zone would reduce stress significantly
    }
  }

  // Ensure at least 3 calm zones, max 6
  if (calmZones.length < 3) {
    const step = Math.floor(path.length / 4);
    for (let i = 1; i <= 3; i++) {
      const idx = Math.min(i * step, path.length - 2);
      const already = calmZones.some(cz => cz.r === path[idx].r && cz.c === path[idx].c);
      if (!already) calmZones.push({ r: path[idx].r, c: path[idx].c });
    }
  }
  if (calmZones.length > 6) calmZones = calmZones.slice(0, 6);

  // Scary zones (8-12) - placed off the main path to punish wrong turns
  scaryZones = [];
  const scaryCount = 8 + Math.floor(Math.random() * 5);
  const pathSet = new Set(path.map(p => `${p.r},${p.c}`));
  for (let i = 0; i < scaryCount; i++) {
    let sr, sc;
    let attempts = 0;
    do {
      sr = Math.floor(Math.random() * MAZE_ROWS);
      sc = Math.floor(Math.random() * MAZE_COLS);
      attempts++;
    } while (
      attempts < 100 &&
      ((sr === 0 && sc === 0) ||
      (sr === MAZE_ROWS - 1 && sc === MAZE_COLS - 1) ||
      calmZones.some(cz => cz.r === sr && cz.c === sc) ||
      pathSet.has(`${sr},${sc}`))
    );
    if (attempts < 100) scaryZones.push({ r: sr, c: sc });
  }

  findNarrowZones();
  placeTimeBoosts(5);
  generateDecorations();

  highStressZones = [];
  tutorialSigns = [];
}

function setupLevel3() {
  // The Gauntlet: 25x25 with mandatory high-stress corridors
  generateMaze();
  placePlayerAndExit();

  const path = solveMaze(0, 0, MAZE_ROWS - 1, MAZE_COLS - 1);

  // Place 3 mandatory high-stress corridors along the solution path
  // These are stretches of 4-6 cells where stress skyrockets
  highStressZones = [];
  const segmentLength = Math.floor(path.length / 4);

  for (let seg = 0; seg < 3; seg++) {
    const startIdx = segmentLength * (seg + 1) - 3;
    const corridorLength = 4 + Math.floor(Math.random() * 3); // 4-6 cells
    for (let j = 0; j < corridorLength; j++) {
      const idx = Math.min(startIdx + j, path.length - 2);
      highStressZones.push({ r: path[idx].r, c: path[idx].c });
    }
  }

  // Calm zones: place one right AFTER each high-stress corridor for recovery
  calmZones = [];
  for (let seg = 0; seg < 3; seg++) {
    const startIdx = segmentLength * (seg + 1) - 3;
    const corridorLength = 4 + Math.floor(Math.random() * 3);
    const recoveryIdx = Math.min(startIdx + corridorLength + 1, path.length - 2);
    calmZones.push({ r: path[recoveryIdx].r, c: path[recoveryIdx].c });
  }

  // Also place a calm zone right before each high-stress corridor so player can prepare
  for (let seg = 0; seg < 3; seg++) {
    const startIdx = segmentLength * (seg + 1) - 3;
    const prepIdx = Math.max(startIdx - 2, 1);
    calmZones.push({ r: path[prepIdx].r, c: path[prepIdx].c });
  }

  // A few extra calm zones scattered off-path
  for (let i = 0; i < 2; i++) {
    let cr, cc;
    do {
      cr = Math.floor(Math.random() * MAZE_ROWS);
      cc = Math.floor(Math.random() * MAZE_COLS);
    } while (
      (cr === 0 && cc === 0) ||
      (cr === MAZE_ROWS - 1 && cc === MAZE_COLS - 1) ||
      highStressZones.some(hz => hz.r === cr && hz.c === cc)
    );
    calmZones.push({ r: cr, c: cc });
  }

  // Scary zones scattered around (not on path or high-stress zones)
  scaryZones = [];
  const pathSet = new Set(path.map(p => `${p.r},${p.c}`));
  const hsSet = new Set(highStressZones.map(h => `${h.r},${h.c}`));
  for (let i = 0; i < 10; i++) {
    let sr, sc;
    let attempts = 0;
    do {
      sr = Math.floor(Math.random() * MAZE_ROWS);
      sc = Math.floor(Math.random() * MAZE_COLS);
      attempts++;
    } while (
      attempts < 100 &&
      ((sr === 0 && sc === 0) ||
      calmZones.some(cz => cz.r === sr && cz.c === sc) ||
      hsSet.has(`${sr},${sc}`))
    );
    if (attempts < 100) scaryZones.push({ r: sr, c: sc });
  }

  findNarrowZones();
  placeTimeBoosts(8);
  generateDecorations();
  tutorialSigns = [];
}

// ============================================================
// SHARED LEVEL HELPERS
// ============================================================
function placePlayerAndExit() {
  player.x = CELL_SIZE / 2;
  player.y = CELL_SIZE / 2;
  endPos.x = (MAZE_COLS - 1) * CELL_SIZE + CELL_SIZE / 2;
  endPos.y = (MAZE_ROWS - 1) * CELL_SIZE + CELL_SIZE / 2;
}

// Random mode only: pick an exit far from start, guaranteed reachable
function placePlayerAndRandomExit() {
  player.x = CELL_SIZE / 2;
  player.y = CELL_SIZE / 2;

  const minDist = Math.floor((MAZE_COLS + MAZE_ROWS) / 2); // minimum Manhattan distance
  let exitR, exitC;
  let attempts = 0;

  do {
    exitR = Math.floor(Math.random() * MAZE_ROWS);
    exitC = Math.floor(Math.random() * MAZE_COLS);
    attempts++;
  } while (
    attempts < 200 &&
    (exitR === 0 && exitC === 0) ||
    (Math.abs(exitR) + Math.abs(exitC) < minDist)
  );

  // Fallback to corner if loop exhausted
  if (attempts >= 200) { exitR = MAZE_ROWS - 1; exitC = MAZE_COLS - 1; }

  endPos.x = exitC * CELL_SIZE + CELL_SIZE / 2;
  endPos.y = exitR * CELL_SIZE + CELL_SIZE / 2;
}

function findNarrowZones() {
  narrowZones = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = maze[r][c];
      const wallCount = (cell.top ? 1 : 0) + (cell.right ? 1 : 0) + (cell.bottom ? 1 : 0) + (cell.left ? 1 : 0);
      if (wallCount >= 3) {
        narrowZones.push({ r, c });
      }
    }
  }
}

function placeTimeBoosts(count) {
  timeBoosts = [];
  for (let i = 0; i < count; i++) {
    let br, bc;
    do {
      br = Math.floor(Math.random() * MAZE_ROWS);
      bc = Math.floor(Math.random() * MAZE_COLS);
    } while (
      (br === 0 && bc === 0) ||
      (br === MAZE_ROWS - 1 && bc === MAZE_COLS - 1) ||
      calmZones.some(cz => cz.r === br && cz.c === bc) ||
      timeBoosts.some(tb => tb.r === br && tb.c === bc)
    );
    timeBoosts.push({ r: br, c: bc, collected: false });
  }
}

function generateDecorations() {
  decorations = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = maze[r][c];
      const wallCount = (cell.top ? 1 : 0) + (cell.right ? 1 : 0) + (cell.bottom ? 1 : 0) + (cell.left ? 1 : 0);
      if (wallCount >= 3 && Math.random() < 0.4) {
        decorations.push({ r, c, type: 'cobweb' });
      }
      if (Math.random() < 0.08) {
        decorations.push({ r, c, type: 'moss' });
      }
    }
  }
}

// ============================================================
// PROCEDURAL MAZE TEXTURE RENDERER
// ============================================================
function renderMazeTexture() {
  if (mazeTexture) mazeTexture.remove();
  mazeTexture = createGraphics(MAZE_WIDTH, MAZE_HEIGHT);
  mazeTexture.noSmooth();

  const g = mazeTexture;

  // --- Step A: Draw stone brick floor for each cell ---
  g.noStroke();
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cx = c * CELL_SIZE;
      const cy = r * CELL_SIZE;
      drawFloorTile(g, cx, cy, r * MAZE_COLS + c);
    }
  }

  // --- Step B: Draw wall segments ---
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = maze[r][c];
      const wx = c * CELL_SIZE;
      const wy = r * CELL_SIZE;
      const wt = WALL_THICKNESS;

      if (cell.top) drawWallSegment(g, wx, wy - wt / 2, CELL_SIZE, wt, true, r * MAZE_COLS + c + 1000);
      if (cell.bottom) drawWallSegment(g, wx, wy + CELL_SIZE - wt / 2, CELL_SIZE, wt, true, r * MAZE_COLS + c + 2000);
      if (cell.left) drawWallSegment(g, wx - wt / 2, wy, wt, CELL_SIZE, false, r * MAZE_COLS + c + 3000);
      if (cell.right) drawWallSegment(g, wx + CELL_SIZE - wt / 2, wy, wt, CELL_SIZE, false, r * MAZE_COLS + c + 4000);
    }
  }

  // --- Step C: Draw static decorations ---
  for (const dec of decorations) {
    const dx = dec.c * CELL_SIZE;
    const dy = dec.r * CELL_SIZE;

    if (dec.type === 'cobweb') {
      drawCobweb(g, dx, dy, maze[dec.r][dec.c]);
    } else if (dec.type === 'moss') {
      drawMoss(g, dx, dy, dec.r * MAZE_COLS + dec.c);
    }
  }
}

// --- Seeded random for consistent texture per cell ---
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  s = (s * 16807) % 2147483647;
  return (s - 1) / 2147483646;
}

// --- Draw a single stone brick floor tile ---
function drawFloorTile(g, x, y, seed) {
  const brickW = Math.floor((CELL_SIZE - MORTAR_WIDTH * 2) / 3);
  const brickH = Math.floor((CELL_SIZE - MORTAR_WIDTH * 2) / 3);

  g.noStroke();
  g.fill(22, 20, 18);
  g.rect(x, y, CELL_SIZE, CELL_SIZE);

  for (let br = 0; br < 3; br++) {
    const rowOffset = (br % 2 === 1) ? brickW / 2 : 0;
    for (let bc = 0; bc < 3; bc++) {
      const bx = x + MORTAR_WIDTH + bc * (brickW + MORTAR_WIDTH) + rowOffset;
      const by = y + MORTAR_WIDTH + br * (brickH + MORTAR_WIDTH);

      const noiseSeed = seed * 9 + br * 3 + bc;
      const variation = seededRandom(noiseSeed) * 16 - 8;
      const baseGray = 42 + variation;
      const greenTint = seededRandom(noiseSeed + 100) < 0.08;

      if (greenTint) {
        g.fill(baseGray - 5, baseGray + 8, baseGray - 3);
      } else {
        g.fill(baseGray, baseGray - 2, baseGray - 4);
      }

      const clippedW = Math.min(brickW, x + CELL_SIZE - bx);
      const clippedH = Math.min(brickH, y + CELL_SIZE - by);
      if (clippedW > 0 && clippedH > 0 && bx >= x) {
        g.rect(bx, by, clippedW, clippedH);

        g.fill(255, 255, 255, 12);
        g.rect(bx, by, clippedW, 1);
        g.rect(bx, by, 1, clippedH);

        g.fill(0, 0, 0, 20);
        g.rect(bx, by + clippedH - 1, clippedW, 1);
        g.rect(bx + clippedW - 1, by, 1, clippedH);
      }
    }
  }

  if (seededRandom(seed + 500) < 0.03) {
    g.stroke(15, 12, 10, 80);
    g.strokeWeight(1);
    const crackX = x + CELL_SIZE * 0.3 + seededRandom(seed + 501) * CELL_SIZE * 0.4;
    const crackY = y + 4;
    g.line(crackX, crackY, crackX + 6, crackY + CELL_SIZE * 0.6);
    g.line(crackX + 6, crackY + CELL_SIZE * 0.6, crackX + 2, crackY + CELL_SIZE - 4);
    g.noStroke();
  }
}

// --- Draw a textured wall segment ---
function drawWallSegment(g, x, y, w, h, isHorizontal, seed) {
  g.noStroke();

  if (isHorizontal) {
    const blockCount = Math.ceil(w / 12);
    for (let i = 0; i < blockCount; i++) {
      const bx = x + i * 12;
      const bw = Math.min(12, x + w - bx);
      const variation = seededRandom(seed + i * 7) * 18 - 9;
      const base = 75 + variation;

      g.fill(base, base - 3, base - 5);
      g.rect(bx, y, bw, h);

      g.fill(255, 255, 255, 18);
      g.rect(bx, y, bw, 1);

      g.fill(0, 0, 0, 35);
      g.rect(bx, y + h - 1, bw, 1);

      if (i > 0) {
        g.fill(30, 25, 20, 150);
        g.rect(bx, y, 1, h);
      }
    }
  } else {
    const blockCount = Math.ceil(h / 12);
    for (let i = 0; i < blockCount; i++) {
      const by = y + i * 12;
      const bh = Math.min(12, y + h - by);
      const variation = seededRandom(seed + i * 11) * 18 - 9;
      const base = 75 + variation;

      g.fill(base, base - 3, base - 5);
      g.rect(x, by, w, bh);

      g.fill(255, 255, 255, 18);
      g.rect(x, by, 1, bh);

      g.fill(0, 0, 0, 35);
      g.rect(x + w - 1, by, 1, bh);

      if (i > 0) {
        g.fill(30, 25, 20, 150);
        g.rect(x, by, w, 1);
      }
    }
  }
}

// --- Draw cobweb decoration ---
function drawCobweb(g, x, y, cell) {
  let cornerX = x;
  let cornerY = y;
  if (!cell.top && cell.bottom) cornerY = y + CELL_SIZE;
  if (!cell.left && cell.right) cornerX = x + CELL_SIZE;
  if (cell.right && cell.bottom) { cornerX = x + CELL_SIZE; cornerY = y + CELL_SIZE; }
  else if (cell.left && cell.bottom) { cornerX = x; cornerY = y + CELL_SIZE; }
  else if (cell.right && cell.top) { cornerX = x + CELL_SIZE; cornerY = y; }

  g.stroke(180, 180, 180, 40);
  g.strokeWeight(1);
  g.noFill();

  const webSize = 14;
  const dirX = cornerX > x + CELL_SIZE / 2 ? -1 : 1;
  const dirY = cornerY > y + CELL_SIZE / 2 ? -1 : 1;

  for (let i = 0; i < 4; i++) {
    const spread = (i + 1) * 3.5;
    g.line(cornerX, cornerY, cornerX + dirX * webSize, cornerY + dirY * spread);
    g.line(cornerX, cornerY, cornerX + dirX * spread, cornerY + dirY * webSize);
  }
  g.stroke(180, 180, 180, 25);
  for (let ring = 1; ring <= 2; ring++) {
    const offset = ring * 5;
    g.arc(cornerX + dirX * offset, cornerY + dirY * offset, offset * 2, offset * 2,
      dirX > 0 ? (dirY > 0 ? 0 : PI + HALF_PI) : (dirY > 0 ? HALF_PI : PI),
      dirX > 0 ? (dirY > 0 ? HALF_PI : TWO_PI) : (dirY > 0 ? PI : PI + HALF_PI)
    );
  }
  g.noStroke();
}

// --- Draw moss decoration ---
function drawMoss(g, x, y, seed) {
  g.noStroke();
  for (let i = 0; i < 8; i++) {
    const mx = x + seededRandom(seed + i * 3) * CELL_SIZE;
    const my = y + CELL_SIZE * 0.6 + seededRandom(seed + i * 3 + 1) * CELL_SIZE * 0.35;
    const ms = 2 + seededRandom(seed + i * 3 + 2) * 3;
    g.fill(40, 65, 30, 60 + seededRandom(seed + i * 5) * 40);
    g.rect(mx, my, ms, ms);
  }
}

// ============================================================
// COLLISION DETECTION
// ============================================================
function getPlayerCell() {
  return {
    r: Math.floor(player.y / CELL_SIZE),
    c: Math.floor(player.x / CELL_SIZE)
  };
}

function canMove(nx, ny) {
  const halfSize = PLAYER_SIZE / 2;
  const corners = [
    { x: nx - halfSize, y: ny - halfSize },
    { x: nx + halfSize, y: ny - halfSize },
    { x: nx - halfSize, y: ny + halfSize },
    { x: nx + halfSize, y: ny + halfSize },
  ];

  for (const corner of corners) {
    if (corner.x < 0 || corner.y < 0 || corner.x >= MAZE_WIDTH || corner.y >= MAZE_HEIGHT) {
      return false;
    }
  }

  const margin = 2;
  const cellR = Math.floor(ny / CELL_SIZE);
  const cellC = Math.floor(nx / CELL_SIZE);
  if (cellR < 0 || cellR >= MAZE_ROWS || cellC < 0 || cellC >= MAZE_COLS) return false;

  const cell = maze[cellR][cellC];
  const cellX = cellC * CELL_SIZE;
  const cellY = cellR * CELL_SIZE;

  if (cell.top && ny - halfSize < cellY + margin) return false;
  if (cell.bottom && ny + halfSize > cellY + CELL_SIZE - margin) return false;
  if (cell.left && nx - halfSize < cellX + margin) return false;
  if (cell.right && nx + halfSize > cellX + CELL_SIZE - margin) return false;

  return true;
}

// ============================================================
// p5.js PRELOAD
// ============================================================
function preload() {
  menuBgImage = loadImage('menu-bg.png');
}

// ============================================================
// p5.js SETUP
// ============================================================
function setup() {
  createCanvas(windowWidth, windowHeight);
  fogBuffer = createGraphics(windowWidth, windowHeight);
  textFont('Courier New');
  lastTime = millis();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  fogBuffer.resizeCanvas(windowWidth, windowHeight);
}

// ============================================================
// p5.js INPUT
// ============================================================
function keyPressed() {
  if (key === 'Enter') {
    if (gameState === 'menu') {
      gameState = 'charSelect';
    } else if (gameState === 'charSelect') {
      gameState = 'levelSelect';
    } else if (gameState === 'levelSelect') {
      gameMode = levelOptions[levelSelectIndex];
      gameState = 'instructions';
    } else if (gameState === 'instructions') {
      startGame();
    } else if (gameState === 'win' || gameState === 'lose') {
      gameState = 'menu';
    }
  }

  if (key === 'p' || key === 'P') {
    if (gameState === 'playing' || gameState === 'episode') {
      gameState = 'paused';
    } else if (gameState === 'paused') {
      gameState = 'playing';
    }
  }

  if (key === 'r' || key === 'R') {
    if (gameState === 'playing' || gameState === 'paused' || gameState === 'episode' || gameState === 'win' || gameState === 'lose') {
      startGame();
    }
  }

  if (gameState === 'charSelect') {
    if (keyCode === LEFT_ARROW || key === 'a' || key === 'A') {
      selectedChar = (selectedChar - 1 + characters.length) % characters.length;
    }
    if (keyCode === RIGHT_ARROW || key === 'd' || key === 'D') {
      selectedChar = (selectedChar + 1) % characters.length;
    }
  }

  if (gameState === 'levelSelect') {
    if (keyCode === UP_ARROW || key === 'w' || key === 'W') {
      levelSelectIndex = (levelSelectIndex - 1 + levelOptions.length) % levelOptions.length;
    }
    if (keyCode === DOWN_ARROW || key === 's' || key === 'S') {
      levelSelectIndex = (levelSelectIndex + 1) % levelOptions.length;
    }
  }

  // Escape key - return to previous screen
  if (keyCode === ESCAPE) {
    if (gameState === 'charSelect') {
      gameState = 'menu';
    } else if (gameState === 'levelSelect') {
      gameState = 'charSelect';
    } else if (gameState === 'instructions') {
      gameState = 'levelSelect';
    } else if (gameState === 'playing' || gameState === 'episode' || gameState === 'paused') {
      gameState = 'menu';
    }
  }

  return false;
}

// ============================================================
// GAME START
// ============================================================
function startGame() {
  const config = LEVEL_CONFIGS[gameMode];
  MAZE_COLS = config.cols;
  MAZE_ROWS = config.rows;
  MAZE_WIDTH = MAZE_COLS * CELL_SIZE;
  MAZE_HEIGHT = MAZE_ROWS * CELL_SIZE;
  GAME_TIME = config.time;

  // Setup level-specific maze and zones
  if (gameMode === 'level1') {
    setupLevel1();
  } else if (gameMode === 'level2') {
    setupLevel2();
  } else if (gameMode === 'level3') {
    setupLevel3();
  } else {
    setupRandomLevel();
  }

  renderMazeTexture();
  stress = 0;
  timer = GAME_TIME;
  episodeTimer = 0;
  controlsInverted = false;
  microSpikeActive = 0;
  screenShake = { x: 0, y: 0 };
  activeTutorialSign = null;
  tutorialSignTimer = 0;
  shownSigns = new Set();
  gameState = 'playing';
  lastTime = millis();
}

// ============================================================
// UPDATE
// ============================================================
function updateGame() {
  const now = millis();
  dt = (now - lastTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  lastTime = now;

  if (gameState === 'playing' || gameState === 'episode') {
    updatePlaying();
  }
}

function updatePlaying() {
  const config = LEVEL_CONFIGS[gameMode];

  // Timer
  timer -= dt;
  if (timer <= 0) {
    timer = 0;
    gameState = 'lose';
    playLoseSound();
    return;
  }

  // Movement
  let dx = 0, dy = 0;
  let up = keyIsDown(UP_ARROW) || keyIsDown(87);
  let down = keyIsDown(DOWN_ARROW) || keyIsDown(83);
  let left = keyIsDown(LEFT_ARROW) || keyIsDown(65);
  let right = keyIsDown(RIGHT_ARROW) || keyIsDown(68);

  if (controlsInverted) {
    [up, down] = [down, up];
    [left, right] = [right, left];
  }

  if (up) dy -= 1;
  if (down) dy += 1;
  if (left) dx -= 1;
  if (right) dx += 1;

  if (dx !== 0 && dy !== 0) {
    dx *= 0.707;
    dy *= 0.707;
  }

  const isRunning = keyIsDown(SHIFT);
  isZoomedOut = keyIsDown(90);
  const ch = characters[selectedChar];
  let spd = (isRunning ? RUN_SPEED : PLAYER_SPEED) * ch.speedMult;
  const isMoving = dx !== 0 || dy !== 0;

  if (gameState === 'episode') {
    spd *= 0.5;
    if (frameCount % 4 < 2) {
      dx = 0;
      dy = 0;
    }
  }

  let nx = player.x + dx * spd;
  let ny = player.y + dy * spd;

  if (canMove(nx, player.y)) player.x = nx;
  if (canMove(player.x, ny)) player.y = ny;

  if (isMoving) playStepSound();

  // Update player animation
  if (isMoving) {
    playerAnimTimer++;
    if (playerAnimTimer >= ANIM_SPEED) {
      playerAnimTimer = 0;
      playerAnimFrame = (playerAnimFrame + 1) % 3;
    }
    if (dx > 0) playerFacing = 1;
    else if (dx < 0) playerFacing = -1;
  } else {
    playerAnimFrame = 0;
    playerAnimTimer = 0;
  }

  // Zone detection
  const { r, c } = getPlayerCell();
  const inCalmZone = calmZones.some(cz => cz.r === r && cz.c === c);
  const inScaryZone = scaryZones.some(sz => sz.r === r && sz.c === c);
  const inNarrowZone = narrowZones.some(nz => nz.r === r && nz.c === c);
  const inHighStressZone = highStressZones.some(hz => hz.r === r && hz.c === c);

  // Tutorial sign detection (Level 1)
  if (tutorialSigns.length > 0) {
    const nearSign = tutorialSigns.find(ts => ts.r === r && ts.c === c);
    if (nearSign && !shownSigns.has(`${nearSign.r},${nearSign.c}`)) {
      activeTutorialSign = nearSign;
      tutorialSignTimer = 180; // 3 seconds at 60fps
      shownSigns.add(`${nearSign.r},${nearSign.c}`);
    }
  }
  if (tutorialSignTimer > 0) {
    tutorialSignTimer--;
    if (tutorialSignTimer <= 0) {
      activeTutorialSign = null;
    }
  }

  // Stress calculation
  if (gameState !== 'episode') {
    const stressMult = ch.stressMult * config.stressMult;
    stress += STRESS_PASSIVE_RATE * dt * 60 * stressMult;
    if (isMoving && isRunning) stress += STRESS_RUN_RATE * dt * 60 * stressMult;
    if (inNarrowZone) stress += STRESS_NARROW_RATE * dt * 60 * stressMult;
    if (inScaryZone) stress += STRESS_SCARY_RATE * dt * 60 * stressMult;
    if (isZoomedOut) stress += ZOOM_OUT_STRESS_RATE * dt * 60 * stressMult;
    if (inCalmZone) stress += STRESS_CALM_DRAIN * dt * 60;
    if (!isMoving) stress += STRESS_STILL_DRAIN * dt * 60;

    // High-stress zones (Level 3) - rapidly increase stress
    if (inHighStressZone) {
      stress += 0.5 * dt * 60 * stressMult; // very fast stress buildup
    }

    // Micro spikes (disabled for tutorial)
    if (config.microSpikes && Math.random() < MICRO_SPIKE_CHANCE) {
      stress += MICRO_SPIKE_AMOUNT * stressMult;
      microSpikeActive = 15;
      playMicroSpikeSound();
    }

    stress = constrain(stress, 0, 100);

    if (stress >= 100) {
      gameState = 'episode';
      controlsInverted = true;
      episodeDuration = 5;
      episodeTimer = episodeDuration;
      playEpisodeSound();
    }
  } else {
    episodeTimer -= dt;
    screenShake.x = (Math.random() - 0.5) * 12;
    screenShake.y = (Math.random() - 0.5) * 12;

    if (episodeTimer <= 0) {
      gameState = 'playing';
      controlsInverted = false;
      stress = 60;
      screenShake = { x: 0, y: 0 };
    }
  }

  if (microSpikeActive > 0) microSpikeActive--;
  if (timeBoostFlash > 0) timeBoostFlash--;

  // Time boost collection
  const { r: pr, c: pc } = getPlayerCell();
  for (const tb of timeBoosts) {
    if (!tb.collected && tb.r === pr && tb.c === pc) {
      tb.collected = true;
      timer += TIME_BOOST_AMOUNT;
      timeBoostFlash = 60;
      playTone(660, 0.15, 'sine', 0.2);
      playTone(880, 0.15, 'sine', 0.15);
    }
  }

  // Win condition
  const distToEnd = dist(player.x, player.y, endPos.x, endPos.y);
  if (distToEnd < CELL_SIZE / 2) {
    gameState = 'win';
    playWinSound();
  }
}

// ============================================================
// p5.js DRAW (main loop)
// ============================================================
function draw() {
  updateGame();

  if (gameState === 'menu') {
    drawMenu();
  } else if (gameState === 'charSelect') {
    drawCharSelect();
  } else if (gameState === 'levelSelect') {
    drawLevelSelect();
  } else if (gameState === 'instructions') {
    drawInstructions();
  } else if (gameState === 'playing' || gameState === 'episode') {
    drawGameplay();
  } else if (gameState === 'paused') {
    drawGameplay();
    drawPauseOverlay();
  } else if (gameState === 'win') {
    drawWinScreen();
  } else if (gameState === 'lose') {
    drawLoseScreen();
  }
}

// ============================================================
// MENU SCREEN
// ============================================================
function drawMenu() {
  background(10);

  if (menuBgImage) {
    push();
    imageMode(CENTER);
    const imgRatio = menuBgImage.width / menuBgImage.height;
    const canvasRatio = width / height;
    let drawW, drawH;
    if (canvasRatio > imgRatio) {
      drawW = width;
      drawH = width / imgRatio;
    } else {
      drawH = height;
      drawW = height * imgRatio;
    }
    tint(255, 180);
    image(menuBgImage, width / 2, height / 2, drawW, drawH);
    noTint();
    pop();

    noStroke();
    fill(0, 0, 0, 120);
    rect(0, 0, width, height);
  }

  const cx = width / 2;
  const cy = height / 2;

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(64);
  fill(255);
  text('LOST CONTROL', cx, cy - 120);

  textStyle(NORMAL);
  textSize(22);
  fill(180);
  text('An Epilepsy Awareness Experience', cx, cy - 65);

  if (Math.random() < 0.05) {
    fill(255);
    text('An Epilepsy Awareness Experience', cx, cy - 65);
  }

  textSize(20);
  fill(200);
  text("You are on a journey but terrified of what's to come.", cx, cy + 10);
  text('Navigate the maze before time runs out.', cx, cy + 40);
  text('But beware... you might lose control.', cx, cy + 70);

  const blink = sin(frameCount * 0.08) > 0;
  if (blink) {
    textStyle(BOLD);
    textSize(28);
    fill(255);
    text('[ PRESS ENTER TO START ]', cx, cy + 140);
  }

  textStyle(NORMAL);
  textSize(16);
  fill(150);
  text('WASD / Arrow Keys = Move  |  Shift = Run  |  P = Pause  |  R = Restart', cx, height - 30);
}

// ============================================================
// CHARACTER SELECT SCREEN
// ============================================================
function drawCharSelect() {
  background(10);

  const cx = width / 2;
  const cy = height / 2;

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(44);
  fill(224);
  text('CHOOSE YOUR CHARACTER', cx, cy - 130);

  textStyle(NORMAL);
  textSize(18);
  fill(136);
  text('Use LEFT / RIGHT arrow keys to select, ENTER to confirm', cx, cy - 85);

  textSize(14);
  fill(100);
  text('Press ESC to return to menu', cx, cy - 62);

  const spacing = 180;
  const startX = cx - spacing;
  for (let i = 0; i < characters.length; i++) {
    const x = startX + i * spacing;
    const y = cy + 15;
    const ch = characters[i];
    const selected = i === selectedChar;

    if (selected) {
      noFill();
      stroke(255);
      strokeWeight(3);
      rect(x - 70, y - 65, 140, 205);

      noStroke();
      fill(255);
      textStyle(BOLD);
      textSize(24);
      text('>', x + 80, y + 5);
      text('<', x - 80, y + 5);
    }

    push();
    translate(x, y - 15);
    scale(1.8);
    const previewFrame = floor(frameCount / 20) % 3;
    if (i === 0) drawKnight(previewFrame);
    else if (i === 1) drawMage(previewFrame);
    else if (i === 2) drawWolf(previewFrame);
    pop();

    textAlign(CENTER, CENTER);
    textStyle(selected ? BOLD : NORMAL);
    textSize(20);
    fill(selected ? 255 : 136);
    text(ch.name, x, y + 52);

    textStyle(NORMAL);
    textSize(13);
    fill(selected ? 200 : 120);
    text(ch.trait, x, y + 72);

    textSize(11);
    fill(selected ? 170 : 100);
    text(ch.spdDesc, x, y + 90);
    text(ch.strDesc, x, y + 105);
  }
}

// ============================================================
// LEVEL SELECT SCREEN
// ============================================================
function drawLevelSelect() {
  background(10);

  const cx = width / 2;
  const cy = height / 2;

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(44);
  fill(224);
  text('SELECT LEVEL', cx, cy - 200);

  textStyle(NORMAL);
  textSize(18);
  fill(136);
  text('Use UP / DOWN to select, ENTER to confirm', cx, cy - 160);

  textSize(14);
  fill(100);
  text('Press ESC to go back', cx, cy - 138);

  const optionHeight = 70;
  const startY = cy - 60;

  for (let i = 0; i < levelOptions.length; i++) {
    const key = levelOptions[i];
    const config = LEVEL_CONFIGS[key];
    const y = startY + i * optionHeight;
    const selected = i === levelSelectIndex;

    // Selection box
    if (selected) {
      noFill();
      stroke(255);
      strokeWeight(2);
      rect(cx - 220, y - 25, 440, 55, 4);
      noStroke();
    }

    // Level name
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(22);

    // Color code each level
    if (key === 'level1') {
      fill(selected ? color(0, 255, 120) : color(0, 180, 80));
    } else if (key === 'level2') {
      fill(selected ? color(255, 200, 0) : color(180, 140, 0));
    } else if (key === 'level3') {
      fill(selected ? color(255, 60, 60) : color(180, 40, 40));
    } else {
      fill(selected ? color(100, 180, 255) : color(60, 120, 180));
    }
    text(config.name, cx, y - 5);

    // Description
    textStyle(NORMAL);
    textSize(14);
    fill(selected ? 200 : 120);
    text(`${config.description}  |  ${config.cols}x${config.rows} maze  |  ${config.time}s`, cx, y + 15);
  }

  // Level details for selected
  const selKey = levelOptions[levelSelectIndex];
  const selConfig = LEVEL_CONFIGS[selKey];

  const detailY = startY + levelOptions.length * optionHeight + 30;
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);
  textSize(16);
  fill(170);

  if (selKey === 'level1') {
    text('A gentle introduction. Learn the controls, zones, and mechanics.', cx, detailY);
    text('Stress is very forgiving. Take your time and explore!', cx, detailY + 22);
  } else if (selKey === 'level2') {
    text('Stress builds fast. Calm zones are placed at the breaking point.', cx, detailY);
    text('Manage your speed and path carefully to survive.', cx, detailY + 22);
  } else if (selKey === 'level3') {
    text('Mandatory HIGH-STRESS corridors force your controls to invert.', cx, detailY);
    text('You MUST navigate with reversed controls to progress. Good luck.', cx, detailY + 22);
  } else {
    text('The classic experience. A random maze with random zone placement.', cx, detailY);
    text('Every run is different. How fast can you escape?', cx, detailY + 22);
  }
}

// ============================================================
// INSTRUCTIONS SCREEN
// ============================================================
function drawInstructions() {
  background(10);

  const cx = width / 2;
  const cy = height / 2;
  const leftX = cx - 220;

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(40);
  fill(224);
  text('HOW TO PLAY', cx, cy - 250);

  // Show current level
  const config = LEVEL_CONFIGS[gameMode];
  textSize(18);
  if (gameMode === 'level1') fill(0, 255, 120);
  else if (gameMode === 'level2') fill(255, 200, 0);
  else if (gameMode === 'level3') fill(255, 60, 60);
  else fill(100, 180, 255);
  text(config.name, cx, cy - 220);

  stroke(60);
  strokeWeight(1);
  line(cx - 200, cy - 205, cx + 200, cy - 205);
  noStroke();

  // --- Objective ---
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(20);
  fill(0, 255, 120);
  text('OBJECTIVE', leftX, cy - 175);

  textStyle(NORMAL);
  textSize(16);
  fill(190);
  text('Reach the green exit at the end of the maze', leftX, cy - 150);
  text(`before the ${config.time}-second timer runs out.`, leftX, cy - 128);

  // --- Movement ---
  textStyle(BOLD);
  textSize(20);
  fill(100, 180, 255);
  text('MOVEMENT', leftX, cy - 90);

  textStyle(NORMAL);
  textSize(16);
  fill(190);
  text('Arrow Keys / WASD to move', leftX, cy - 65);
  text('Hold Shift to run (increases stress)', leftX, cy - 43);
  text('A green arrow near you points toward the exit', leftX, cy - 21);
  text('Press Z to zoom out (increases stress faster)', leftX, cy + 1);

  // --- Zones ---
  textStyle(BOLD);
  textSize(20);
  fill(255, 200, 100);
  text('ZONES', leftX, cy + 39);

  textStyle(NORMAL);
  textSize(16);
  fill(255, 200, 100);
  circle(leftX + 8, cy + 64, 14);
  fill(190);
  text('Yellow glow = Calm Zone (reduces stress)', leftX + 22, cy + 64);

  fill(200, 50, 50);
  circle(leftX + 8, cy + 89, 14);
  fill(190);
  text('Red glow = Danger Zone (increases stress)', leftX + 22, cy + 89);

  fill(0, 200, 255);
  circle(leftX + 8, cy + 114, 14);
  fill(190);
  text('Blue orb = Time Boost (+5 seconds)', leftX + 22, cy + 114);

  // High-stress zone info for Level 3
  if (gameMode === 'level3') {
    fill(200, 0, 200);
    circle(leftX + 8, cy + 139, 14);
    fill(190);
    text('Purple pulse = HIGH-STRESS (controls WILL invert)', leftX + 22, cy + 139);
  }

  // --- Stress & Episodes ---
  textStyle(BOLD);
  textSize(20);
  fill(244, 67, 54);
  const stressY = gameMode === 'level3' ? cy + 172 : cy + 152;
  text('STRESS & EPISODES', leftX, stressY);

  textStyle(NORMAL);
  textSize(16);
  fill(190);
  text('Stress rises over time, faster when running', leftX, stressY + 25);
  text('or in danger zones. At 100% stress, an episode', leftX, stressY + 47);
  text('triggers: controls invert and vision shrinks.', leftX, stressY + 69);

  // --- Start prompt ---
  textAlign(CENTER, CENTER);
  const blink = sin(frameCount * 0.08) > 0;
  if (blink) {
    textStyle(BOLD);
    textSize(24);
    fill(255);
    text('[ PRESS ENTER TO BEGIN ]', cx, height - 40);
  }
}

// ============================================================
// PIXEL ART CHARACTER DRAWING
// ============================================================
function drawKnight(frame) {
  const p = 2;
  noStroke();

  fill(160, 170, 185);
  rect(-3 * p, -12 * p, 6 * p, 2 * p);
  rect(-4 * p, -10 * p, 8 * p, 3 * p);
  fill(30, 30, 40);
  rect(-2 * p, -9 * p, 4 * p, p);
  rect(-0.5 * p, -9 * p, p, 2 * p);
  fill(200, 210, 225, 120);
  rect(-3 * p, -12 * p, 2 * p, p);

  fill(100, 110, 130);
  rect(-4 * p, -7 * p, 8 * p, 5 * p);
  fill(140, 150, 170);
  rect(-3 * p, -7 * p, 2 * p, p);
  fill(80, 70, 50);
  rect(-4 * p, -2 * p, 8 * p, p);
  fill(200, 180, 60);
  rect(-p, -2 * p, 2 * p, p);

  fill(90, 100, 120);
  rect(-6 * p, -7 * p, 2 * p, 5 * p);
  fill(200, 180, 60);
  rect(-5.5 * p, -5.5 * p, p, 2 * p);
  rect(-6 * p, -5 * p, 2 * p, p);

  fill(110, 80, 50);
  rect(4 * p, -8 * p, p, 5 * p);
  fill(255, 160, 40, 200);
  rect(3.5 * p, -10 * p, 2 * p, 2 * p);
  fill(255, 220, 80, 180);
  rect(4 * p, -11 * p, p, p);

  fill(70, 75, 90);
  if (frame === 0) {
    rect(-3 * p, -p, 3 * p, 4 * p);
    rect(1 * p, -p, 3 * p, 3 * p);
  } else if (frame === 1) {
    rect(-3 * p, -p, 3 * p, 4 * p);
    rect(0, -p, 3 * p, 4 * p);
  } else {
    rect(-3 * p, -p, 3 * p, 3 * p);
    rect(1 * p, -p, 3 * p, 4 * p);
  }

  fill(50, 45, 35);
  if (frame === 0) {
    rect(-3 * p, 3 * p, 3 * p, p);
    rect(1 * p, 2 * p, 3 * p, p);
  } else if (frame === 1) {
    rect(-3 * p, 3 * p, 3 * p, p);
    rect(0, 3 * p, 3 * p, p);
  } else {
    rect(-3 * p, 2 * p, 3 * p, p);
    rect(1 * p, 3 * p, 3 * p, p);
  }
}

function drawMage(frame) {
  const p = 2;
  noStroke();

  fill(120, 90, 60);
  rect(-p, -14 * p, 2 * p, 2 * p);
  rect(-2 * p, -12 * p, 4 * p, 2 * p);
  rect(-3 * p, -10 * p, 6 * p, 3 * p);

  fill(30, 25, 20);
  rect(-2 * p, -9 * p, 4 * p, 2 * p);
  fill(180, 200, 150);
  rect(-1.5 * p, -8.5 * p, p, p);
  rect(0.5 * p, -8.5 * p, p, p);

  fill(139, 107, 74);
  rect(-4 * p, -7 * p, 8 * p, 6 * p);
  fill(100, 75, 50);
  rect(-p, -7 * p, p, 6 * p);
  rect(2 * p, -6 * p, p, 5 * p);

  fill(120, 90, 60);
  rect(-5 * p, -p, 10 * p, 3 * p);

  fill(180, 160, 120);
  rect(-3 * p, -3 * p, 6 * p, p);

  fill(90, 65, 40);
  rect(4 * p, -12 * p, p, 14 * p);
  fill(100, 180, 220, 200);
  rect(3.5 * p, -14 * p, 2 * p, 2 * p);
  fill(180, 220, 255, 150);
  rect(4 * p, -13.5 * p, p, p);

  fill(100, 75, 50);
  if (frame === 0) {
    rect(-5 * p, 2 * p, 4 * p, 2 * p);
    rect(0, 2 * p, 4 * p, p);
  } else if (frame === 1) {
    rect(-5 * p, 2 * p, 10 * p, 2 * p);
  } else {
    rect(-4 * p, 2 * p, 4 * p, p);
    rect(1 * p, 2 * p, 4 * p, 2 * p);
  }

  fill(70, 55, 35);
  if (frame === 0) {
    rect(-4 * p, 4 * p, 2 * p, p);
  } else if (frame === 1) {
    rect(-3 * p, 4 * p, 2 * p, p);
    rect(1 * p, 4 * p, 2 * p, p);
  } else {
    rect(2 * p, 4 * p, 2 * p, p);
  }
}

function drawWolf(frame) {
  const p = 2;
  noStroke();

  fill(176, 184, 192);
  rect(-5 * p, -4 * p, 10 * p, 5 * p);
  fill(220, 225, 230);
  rect(-4 * p, -p, 8 * p, 2 * p);

  fill(160, 170, 180);
  rect(5 * p, -5 * p, 4 * p, 4 * p);
  fill(176, 184, 192);
  rect(9 * p, -4 * p, 2 * p, 2 * p);
  fill(30, 30, 30);
  rect(10 * p, -4 * p, p, p);
  fill(200, 180, 50);
  rect(7 * p, -5 * p, p, p);
  fill(20, 20, 20);
  rect(7.5 * p, -5 * p, 0.5 * p, p);

  fill(140, 150, 160);
  rect(6 * p, -7 * p, p, 2 * p);
  rect(8 * p, -7 * p, p, 2 * p);
  fill(180, 140, 140);
  rect(6 * p, -6.5 * p, p, p);
  rect(8 * p, -6.5 * p, p, p);

  fill(150, 158, 168);
  rect(-7 * p, -5 * p, 2 * p, p);
  rect(-8 * p, -6 * p, 2 * p, p);
  fill(220, 225, 230);
  rect(-8 * p, -7 * p, p, p);

  fill(140, 148, 158);
  if (frame === 0) {
    rect(3 * p, p, 2 * p, 4 * p);
    rect(5 * p, p, 2 * p, 3 * p);
    rect(-4 * p, p, 2 * p, 3 * p);
    rect(-2 * p, p, 2 * p, 4 * p);
  } else if (frame === 1) {
    rect(3 * p, p, 2 * p, 3 * p);
    rect(5 * p, p, 2 * p, 3 * p);
    rect(-4 * p, p, 2 * p, 3 * p);
    rect(-2 * p, p, 2 * p, 3 * p);
  } else {
    rect(3 * p, p, 2 * p, 3 * p);
    rect(5 * p, p, 2 * p, 4 * p);
    rect(-4 * p, p, 2 * p, 4 * p);
    rect(-2 * p, p, 2 * p, 3 * p);
  }

  fill(100, 108, 118);
  if (frame === 0) {
    rect(3 * p, 5 * p, 2 * p, p);
    rect(-2 * p, 5 * p, 2 * p, p);
  } else if (frame === 1) {
    rect(3 * p, 4 * p, 2 * p, p);
    rect(5 * p, 4 * p, 2 * p, p);
    rect(-4 * p, 4 * p, 2 * p, p);
    rect(-2 * p, 4 * p, 2 * p, p);
  } else {
    rect(5 * p, 5 * p, 2 * p, p);
    rect(-4 * p, 5 * p, 2 * p, p);
  }
}

function drawPlayer() {
  push();
  translate(player.x, player.y);
  scale(playerFacing, 1);

  if (selectedChar === 0) drawKnight(playerAnimFrame);
  else if (selectedChar === 1) drawMage(playerAnimFrame);
  else if (selectedChar === 2) drawWolf(playerAnimFrame);

  pop();
}

// ============================================================
// GAMEPLAY DRAWING
// ============================================================
function drawGameplay() {
  background(0);

  push();

  // Follow player, clamping only when maze is larger than the screen.
  // When the maze fits inside the screen, center it instead.
  let camX = MAZE_WIDTH > width
    ? constrain(player.x - width / 2, 0, MAZE_WIDTH - width)
    : -(width - MAZE_WIDTH) / 2;
  let camY = MAZE_HEIGHT > height
    ? constrain(player.y - height / 2, 0, MAZE_HEIGHT - height)
    : -(height - MAZE_HEIGHT) / 2;

  if (gameState === 'episode') {
    camX += screenShake.x;
    camY += screenShake.y;
  }

  if (microSpikeActive > 0) {
    camX += (Math.random() - 0.5) * 6;
    camY += (Math.random() - 0.5) * 6;
  }

  if (isZoomedOut) {
    translate(width / 2, height / 2);
    scale(ZOOM_OUT_SCALE);
    translate(-width / 2, -height / 2);
  }

  translate(-camX, -camY);

  // --- Pre-rendered maze texture ---
  const darken = stress / 100;
  if (mazeTexture) {
    if (gameState === 'episode') {
      tint(200, 150, 150);
    } else {
      tint(255 - darken * 60);
    }
    image(mazeTexture, 0, 0);
    noTint();
  }

  // --- Calm zones ---
  for (const cz of calmZones) {
    const zx = cz.c * CELL_SIZE;
    const zy = cz.r * CELL_SIZE;

    noStroke();
    for (let rad = CELL_SIZE; rad > 0; rad -= 4) {
      const a = map(rad, CELL_SIZE, 0, 0, 40);
      fill(255, 200, 100, a);
      circle(zx + CELL_SIZE / 2, zy + CELL_SIZE / 2, rad * 2);
    }

    fill(255, 180, 60, 20);
    rect(zx + 2, zy + 2, CELL_SIZE - 4, CELL_SIZE - 4);
  }

  // --- Scary zones ---
  for (const sz of scaryZones) {
    const zx = sz.c * CELL_SIZE;
    const zy = sz.r * CELL_SIZE;
    const a = (0.1 + sin(frameCount * 0.05) * 0.05) * 255;
    noStroke();
    fill(80, 0, 0, a);
    rect(zx, zy, CELL_SIZE, CELL_SIZE);
  }

  // --- High-stress zones (Level 3) ---
  for (const hz of highStressZones) {
    const zx = hz.c * CELL_SIZE;
    const zy = hz.r * CELL_SIZE;
    const pulse = sin(frameCount * 0.08) * 0.3 + 0.7;
    noStroke();

    // Purple/magenta pulsing overlay
    fill(120, 0, 160, 60 * pulse);
    rect(zx, zy, CELL_SIZE, CELL_SIZE);

    // Crackling energy border effect
    stroke(180, 0, 255, 100 * pulse);
    strokeWeight(2);
    noFill();
    rect(zx + 2, zy + 2, CELL_SIZE - 4, CELL_SIZE - 4);

    // Warning symbol at center
    noStroke();
    fill(255, 0, 200, 80 * pulse);
    const cx = zx + CELL_SIZE / 2;
    const cy = zy + CELL_SIZE / 2;
    // Lightning bolt shape
    const s = 6;
    triangle(cx - s, cy - s * 2, cx + s * 0.5, cy - s * 0.3, cx - s * 0.3, cy);
    triangle(cx + s, cy + s * 2, cx - s * 0.5, cy + s * 0.3, cx + s * 0.3, cy);
  }

  // --- Tutorial signs (Level 1) ---
  for (const ts of tutorialSigns) {
    if (shownSigns.has(`${ts.r},${ts.c}`)) continue; // already seen
    const zx = ts.c * CELL_SIZE + CELL_SIZE / 2;
    const zy = ts.r * CELL_SIZE + CELL_SIZE / 2;
    const bob = sin(frameCount * 0.06) * 3;

    // Floating "?" marker
    noStroke();
    fill(ts.color[0], ts.color[1], ts.color[2], 150);
    circle(zx, zy + bob - 8, 20);
    fill(255, 255, 255, 220);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(14);
    text('?', zx, zy + bob - 9);
  }

  // --- Time boost pickups ---
  for (const tb of timeBoosts) {
    if (tb.collected) continue;
    const bx = tb.c * CELL_SIZE + CELL_SIZE / 2;
    const by = tb.r * CELL_SIZE + CELL_SIZE / 2;
    const pulse = sin(frameCount * 0.1) * 0.15 + 0.85;
    const glowSize = 18 * pulse;

    noStroke();
    fill(0, 180, 255, 30);
    circle(bx, by, glowSize * 2.5);
    fill(0, 180, 255, 50);
    circle(bx, by, glowSize * 1.6);

    fill(0, 200, 255, 200);
    circle(bx, by, glowSize);

    fill(255, 255, 255, 160);
    circle(bx, by - 2, glowSize * 0.4);

    fill(255, 255, 255, 180);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(10);
    text('+5', bx, by + 1);
  }

  // --- End zone ---
  const endGlow = 0.3 + sin(frameCount * 0.06) * 0.15;
  const egx = endPos.x - CELL_SIZE / 2;
  const egy = endPos.y - CELL_SIZE / 2;
  noStroke();
  fill(0, 200, 100, endGlow * 255);
  rect(egx + 4, egy + 4, CELL_SIZE - 8, CELL_SIZE - 8);
  noFill();
  stroke(0, 255, 120, (endGlow + 0.1) * 255);
  strokeWeight(2);
  rect(egx + 2, egy + 2, CELL_SIZE - 4, CELL_SIZE - 4);

  // --- Player ---
  drawPlayer();

  // --- Direction arrow ---
  drawDirectionArrow();

  pop();

  // --- Fog of war ---
  drawFog();

  // --- HUD ---
  drawHUD();

  // --- Tutorial sign popup ---
  if (activeTutorialSign && tutorialSignTimer > 0) {
    drawTutorialPopup(activeTutorialSign);
  }

  // --- Episode overlay ---
  if (gameState === 'episode') {
    drawEpisodeOverlay();
  }

  // --- Micro spike flash ---
  if (microSpikeActive > 0) {
    noStroke();
    fill(255, 255, 255, (0.05 * microSpikeActive / 15) * 255);
    rect(0, 0, width, height);
  }
}

// ============================================================
// TUTORIAL SIGN POPUP
// ============================================================
function drawTutorialPopup(sign) {
  const fadeIn = Math.min(1, (180 - tutorialSignTimer) / 15); // fade in over 15 frames
  const fadeOut = Math.min(1, tutorialSignTimer / 30); // fade out over 30 frames
  const alpha = Math.min(fadeIn, fadeOut);

  const boxW = 420;
  const boxH = 100;
  const boxX = (width - boxW) / 2;
  const boxY = 80;

  // Background
  noStroke();
  fill(0, 0, 0, 200 * alpha);
  rect(boxX, boxY, boxW, boxH, 8);

  // Border with sign color
  noFill();
  stroke(sign.color[0], sign.color[1], sign.color[2], 200 * alpha);
  strokeWeight(2);
  rect(boxX, boxY, boxW, boxH, 8);

  // Title
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(18);
  fill(sign.color[0], sign.color[1], sign.color[2], 255 * alpha);
  text(sign.title, width / 2, boxY + 22);

  // Message lines
  textStyle(NORMAL);
  textSize(14);
  fill(220, 220, 220, 255 * alpha);
  const lines = sign.message.split('\n');
  for (let i = 0; i < lines.length; i++) {
    text(lines[i], width / 2, boxY + 50 + i * 20);
  }
}

// ============================================================
// DIRECTION ARROW TO EXIT
// ============================================================
function drawDirectionArrow() {
  const targetAngle = atan2(endPos.y - player.y, endPos.x - player.x);

  let diff = targetAngle - arrowAngle;
  while (diff > PI) diff -= TWO_PI;
  while (diff < -PI) diff += TWO_PI;
  arrowAngle += diff * 0.1;

  const orbitRadius = PLAYER_SIZE + 12;
  const ax = player.x + cos(arrowAngle) * orbitRadius;
  const ay = player.y + sin(arrowAngle) * orbitRadius;

  const bob = sin(frameCount * 0.08) * 1.5;

  push();
  translate(ax + cos(arrowAngle + HALF_PI) * bob, ay + sin(arrowAngle + HALF_PI) * bob);
  rotate(arrowAngle);

  const size = 8;
  noStroke();
  fill(0, 255, 120, 180);
  triangle(
    size, 0,
    -size, -size * 0.6,
    -size, size * 0.6
  );

  fill(255, 255, 255, 100);
  triangle(
    size * 0.5, 0,
    -size * 0.3, -size * 0.25,
    -size * 0.3, size * 0.25
  );
  pop();
}

// ============================================================
// FOG OF WAR
// ============================================================
function drawFog() {
  if (fogBuffer.width !== width || fogBuffer.height !== height) {
    fogBuffer.resizeCanvas(width, height);
  }

  const stressRatio = stress / 100;
  let visRadius = BASE_VISIBILITY_RADIUS - stressRatio * (BASE_VISIBILITY_RADIUS - MIN_VISIBILITY_RADIUS);

  if (gameState === 'episode') {
    visRadius = MIN_VISIBILITY_RADIUS * 0.8;
    visRadius += sin(frameCount * 0.2) * 10;
  }

  if (isZoomedOut) visRadius *= ZOOM_OUT_VISIBILITY_MULT;

  const fCtx = fogBuffer.drawingContext;
  fogBuffer.clear();

  fCtx.fillStyle = '#000';
  fCtx.fillRect(0, 0, fogBuffer.width, fogBuffer.height);

  fCtx.globalCompositeOperation = 'destination-out';

  const gradient = fCtx.createRadialGradient(
    fogBuffer.width / 2, fogBuffer.height / 2, visRadius * 0.4,
    fogBuffer.width / 2, fogBuffer.height / 2, visRadius
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.9)');
  gradient.addColorStop(0.85, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  fCtx.fillStyle = gradient;
  fCtx.fillRect(0, 0, fogBuffer.width, fogBuffer.height);

  fCtx.globalCompositeOperation = 'source-over';

  image(fogBuffer, 0, 0);
}

// ============================================================
// HUD
// ============================================================
function drawHUD() {
  const padding = 20;
  const barWidth = 340;
  const barHeight = 24;

  // --- Stress meter ---
  const barX = (width - barWidth) / 2;
  const barY = height - padding - barHeight - 14;

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(16);
  fill(170);
  noStroke();
  text('STRESS', width / 2, barY - 14);

  fill(40, 40, 40, 200);
  rect(barX, barY, barWidth, barHeight);

  const stressRatio = stress / 100;
  if (stressRatio < 0.4) fill(76, 175, 80);
  else if (stressRatio < 0.7) fill(255, 152, 0);
  else fill(244, 67, 54);

  if (stressRatio > 0.8) {
    const pulse = sin(frameCount * 0.15) * 0.3 + 0.7;
    drawingContext.globalAlpha = pulse;
  }
  rect(barX, barY, barWidth * stressRatio, barHeight);
  drawingContext.globalAlpha = 1;

  noFill();
  stroke(102);
  strokeWeight(2);
  rect(barX, barY, barWidth, barHeight);

  noStroke();
  textStyle(BOLD);
  textSize(14);
  fill(255);
  text(`${Math.floor(stress)}%`, width / 2, barY + barHeight / 2);

  // --- Timer ---
  const minutes = Math.floor(timer / 60);
  const seconds = Math.floor(timer % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  textAlign(CENTER, CENTER);
  if (timer < 15) {
    fill(sin(frameCount * 0.2) > 0 ? color(244, 67, 54) : color(255, 102, 89));
    textStyle(BOLD);
    textSize(42);
  } else if (timer < 30) {
    fill(255, 152, 0);
    textStyle(BOLD);
    textSize(36);
  } else {
    fill(224);
    textStyle(BOLD);
    textSize(36);
  }
  text(timeStr, width / 2, padding + 25);

  // +5s flash
  if (timeBoostFlash > 0) {
    const flashAlpha = map(timeBoostFlash, 0, 60, 0, 255);
    const flashY = padding + 55 - map(timeBoostFlash, 60, 0, 0, 15);
    fill(0, 200, 255, flashAlpha);
    textStyle(BOLD);
    textSize(22);
    text('+5s', width / 2, flashY);
  }

  // --- Level name display ---
  const config = LEVEL_CONFIGS[gameMode];
  textAlign(RIGHT, CENTER);
  textStyle(NORMAL);
  textSize(14);
  fill(120);
  text(config.name, width - padding, padding + 12);

  // --- Zone indicators ---
  const { r, c } = getPlayerCell();
  const inCalmZone = calmZones.some(cz => cz.r === r && cz.c === c);
  const inHighStressZone = highStressZones.some(hz => hz.r === r && hz.c === c);

  textAlign(CENTER, CENTER);
  if (inCalmZone) {
    textStyle(NORMAL);
    textSize(18);
    fill(255, 200, 100, 200);
    text('~ Calm Zone ~', width / 2, padding + 60);
  }
  const inScaryZone = scaryZones.some(sz => sz.r === r && sz.c === c);
  if (inScaryZone) {
    textStyle(NORMAL);
    textSize(18);
    fill(200, 50, 50, 200);
    text('! Danger Zone !', width / 2, padding + 60);
  }
  if (inHighStressZone) {
    const pulse = sin(frameCount * 0.15) > 0;
    textStyle(BOLD);
    textSize(20);
    fill(200, 0, 255, pulse ? 255 : 180);
    text('!! HIGH STRESS AREA !!', width / 2, padding + 60);
    textStyle(NORMAL);
    textSize(14);
    fill(200, 150, 255, 200);
    text('Controls will invert - stay focused!', width / 2, padding + 82);
  }

  if (isZoomedOut) {
    textStyle(BOLD);
    textSize(18);
    fill(255, 170, 0, 200);
    text('ZOOMED OUT (Stress +)', width / 2, padding + 100);
  }

  // --- Episode warning ---
  if (gameState === 'episode') {
    if (sin(frameCount * 0.2) > 0) {
      textStyle(BOLD);
      textSize(26);
      fill(255, 23, 68);
      text('!! EPISODE !!', width / 2, height / 2 - 65);
    }
    textStyle(NORMAL);
    textSize(16);
    fill(204);
    text('Controls inverted - Stop moving or find a calm zone', width / 2, height / 2 - 35);
  }

  // --- Controls reminder ---
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(14);
  fill(255);
  text('P = Pause | R = Restart | Shift = Run | Z = Zoom Out | ESC = Menu', padding, padding + 12);
}

// ============================================================
// EPISODE OVERLAY
// ============================================================
function drawEpisodeOverlay() {
  const ctx = drawingContext;
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 50,
    width / 2, height / 2, width / 2
  );
  gradient.addColorStop(0, 'rgba(50, 0, 0, 0)');
  gradient.addColorStop(0.6, 'rgba(50, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(20, 0, 0, 0.7)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  noStroke();
  fill(0, 0, 0, 20);
  for (let y = 0; y < height; y += 4) {
    rect(0, y, width, 2);
  }
}

// ============================================================
// PAUSE OVERLAY
// ============================================================
function drawPauseOverlay() {
  noStroke();
  fill(0, 0, 0, 180);
  rect(0, 0, width, height);

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(58);
  fill(224);
  text('PAUSED', width / 2, height / 2 - 20);

  textStyle(NORMAL);
  textSize(20);
  fill(170);
  text('Press P to resume | R to restart', width / 2, height / 2 + 35);
}

// ============================================================
// WIN SCREEN
// ============================================================
function drawWinScreen() {
  background(10, 26, 10);

  const cx = width / 2;
  const cy = height / 2;

  noStroke();
  for (let i = 0; i < 40; i++) {
    const angle = (frameCount * 0.02 + i * 0.16) % (TWO_PI);
    const d = 80 + sin(frameCount * 0.03 + i) * 40;
    const px = cx + cos(angle) * d;
    const py = cy - 50 + sin(angle) * d * 0.6;
    const a = (0.3 + sin(frameCount * 0.05 + i) * 0.2) * 255;
    fill(0, 200, 100, a);
    circle(px, py, 4);
  }

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(62);
  fill(76, 175, 80);
  text('YOU MADE IT', cx, cy - 50);

  const timeLeft = Math.floor(timer);
  const config = LEVEL_CONFIGS[gameMode];
  textStyle(NORMAL);
  textSize(22);
  fill(170);
  text(`You reached the end with ${timeLeft} seconds to spare.`, cx, cy + 15);
  text('You kept control through the chaos.', cx, cy + 48);

  // Show level completed
  textSize(18);
  if (gameMode === 'level1') fill(0, 255, 120);
  else if (gameMode === 'level2') fill(255, 200, 0);
  else if (gameMode === 'level3') fill(255, 60, 60);
  else fill(100, 180, 255);
  text(config.name + ' Complete!', cx, cy + 85);

  textSize(18);
  fill(102);
  text('Press ENTER to return to menu | R to play again', cx, cy + 120);
}

// ============================================================
// LOSE SCREEN
// ============================================================
function drawLoseScreen() {
  background(26, 10, 10);

  const cx = width / 2;
  const cy = height / 2;

  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(62);
  fill(244, 67, 54);

  const glitch = Math.random() < 0.1;
  if (glitch) {
    text("TIME'S UP", cx + (Math.random() - 0.5) * 8, cy - 50 + (Math.random() - 0.5) * 4);
  } else {
    text("TIME'S UP", cx, cy - 50);
  }

  textStyle(NORMAL);
  textSize(22);
  fill(170);
  text("You couldn't make it through in time.", cx, cy + 15);
  text('The maze consumed you.', cx, cy + 48);

  // Show level
  const config = LEVEL_CONFIGS[gameMode];
  textSize(16);
  fill(120);
  text(config.name, cx, cy + 80);

  textSize(18);
  fill(102);
  text('Press ENTER to return to menu | R to try again', cx, cy + 110);
}
