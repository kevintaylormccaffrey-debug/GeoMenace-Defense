/**
 * GeoMenace Defense — game logic (single file).
 *
 * How the pieces fit together:
 * 1) Boot: applyMapLayout + resetGameState, show lore → start overlay → Begin starts the run.
 * 2) State: the `state` object is the live game snapshot (entities, wave flags, gold, etc.).
 * 3) Loop: requestAnimationFrame → gameLoop → update(dt) then draw() then updateHud().
 *    `dt` is scaled by speedMultiplier for fast-forward.
 * 4) Maps: tile paths are built in buildMapLayout*; pathGrid / pathLaneGrid / buildableGrid drive
 *    collision, lane coloring, and where towers may be placed.
 * 5) Entities: Enemy (moves along a pixel path), Tower (aims & fires or aura), Projectile /
 *    RailProjectile (damage), ExplosionEffect (rocket splash visuals).
 * 6) Waves: startWave sets waveConfig; update() spawns on a timer until count reached; when no
 *    enemies remain, wave ends, gold bonus applies, wave number increments.
 *
 * Good edit targets for balance: constants below TILE_SIZE, TOWER_TYPES, getWaveConfig,
 * KILL_GOLD / WAVE_*_BONUS, FINAL_WAVE, and Enemy/Tower behavior in their classes.
 */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- DOM & media handles (match ids/classes in index.html; rerollMapBtn may be absent) ---
const waveEl = document.getElementById("wave");
const goldEl = document.getElementById("gold");
const baseHpEl = document.getElementById("baseHp");
const remainingEl = document.getElementById("remaining");

const towerButtons = [...document.querySelectorAll(".tower-btn")];
const startWaveBtn = document.getElementById("startWaveBtn");
const rerollMapBtn = document.getElementById("rerollMapBtn");
const startOverlayEl = document.getElementById("startOverlay");
const loreOverlayEl = document.getElementById("loreOverlay");
const loreTransmissionEl = document.getElementById("loreTransmissionText");
const beginGameBtn = document.getElementById("beginGameBtn");
const mapCardsEl = document.getElementById("mapCards");
const towerTooltipEl = document.getElementById("towerTooltip");
const restartLevelBtn = document.getElementById("restartLevelBtn");
const sellModeBtn = document.getElementById("sellModeBtn");
const fastForwardBtn = document.getElementById("fastForwardBtn");
const returnToMenuBtn = document.getElementById("returnToMenuBtn");
const restartBtn = document.getElementById("restartBtn");
const menuMusicEl = document.getElementById("menuMusic");
const muteToggleBtn = document.getElementById("muteToggleBtn");
const audioSettingsBtn = document.getElementById("audioSettingsBtn");
const audioSettingsPanel = document.getElementById("audioSettingsPanel");
const sfxVolumeSlider = document.getElementById("sfxVolumeSlider");
const musicVolumeSlider = document.getElementById("musicVolumeSlider");
const sfxVolumeLabel = document.getElementById("sfxVolumeLabel");
const musicVolumeLabel = document.getElementById("musicVolumeLabel");
const holdFSellCheckbox = document.getElementById("holdFSellCheckbox");
const nextWavePanel = document.getElementById("nextWavePanel");
const nextWaveNumEl = document.getElementById("nextWaveNum");
const nextWaveEnemyCountEl = document.getElementById("nextWaveEnemyCount");
const nextWaveNewSection = document.getElementById("nextWaveNewSection");
const nextWavePreviewCanvas = document.getElementById("nextWavePreviewCanvas");
const nextWaveBlurbEl = document.getElementById("nextWaveBlurb");
const railShotSfx = new Audio("assets/rail-shot.mp3");
const basicTurretShotSfx = new Audio("assets/basic_turret.mp3");
const rocketTurretShotSfx = new Audio("assets/rocket_tower.mp3");
const iceTurretShotSfx = new Audio("assets/ice_turret.mp3");
const frostAuraSfx = new Audio("assets/frost_aura.mp3");

// --- Grid & visual constants (canvas is 900×520; COLS/ROWS derive from TILE_SIZE) ---
const TILE_SIZE = 52;
const COLS = Math.floor(canvas.width / TILE_SIZE);
const ROWS = Math.floor(canvas.height / TILE_SIZE);
/** Bottom-left next-wave HUD covers ~this many rows; paths must stay above this band. */
const NEXT_WAVE_OVERLAY_TILE_ROWS = 3;
const GRASS_BASE = "#5a8f46";
const GRASS_DARK = "#4a7a3a";
const GRASS_LIGHT = "#6fb050";
const BUILD_TILE_STROKE = "rgba(25, 70, 25, 0.38)";
const BUILD_TILE_PATTERN = "rgba(255, 255, 255, 0.06)";
const FINAL_WAVE = 10;
const KILL_GOLD = 10;
const GOLD_POPUP_DURATION_SEC = 0.95;
const GOLD_POPUP_RISE_PX_PER_SEC = 36;
const WAVE_BASE_BONUS_START = 20;
const WAVE_BASE_BONUS_STEP = 10;
const WAVE_FLAWLESS_BONUS = 10;
/** Full-screen red tint when an enemy leaks; fades using performance.now() in draw(). */
const BASE_DAMAGE_FLASH_MS = 320;
const BASE_DAMAGE_FLASH_MAX_ALPHA = 0.12;
const HOLD_F_SELL_STORAGE_KEY = "geomDefense_holdFSell";

function loadHoldFSell() {
  try {
    return localStorage.getItem(HOLD_F_SELL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveHoldFSell(value) {
  try {
    localStorage.setItem(HOLD_F_SELL_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

let holdFSell = loadHoldFSell();
const AUDIO_MAX_LEVEL = 10;
/** Multiplies slider output so default/max are quieter than the raw BASE_* levels alone. */
const AUDIO_MASTER_GAIN = 0.5;
const BASE_MUSIC_VOLUME = 0.5;
const BASE_SFX_VOLUME = {
  rail: 0.45,
  basic: 0.3,
  rocket: 0.36,
  ice: 0.32,
  frostAura: 0.24
};
const TOWER_MENU_ORDER = ["basic", "ice", "frost", "rocket", "rail"]; // matches keyboard 1–5

// --- Tower definitions: stats + UI strings; Tower instances copy these at build time ---
const TOWER_TYPES = {
  basic: {
    id: "basic",
    name: "Basic Turret",
    description:
      "Reliable single-target damage; shoots the enemy nearest the base (least distance left along the path).\nStats:\nCost: 100g,\nRange: 145,\nDamage: 20,\nShot Interval: 1s,\nProjectile speed 340,\nTarget Prio: Closest to base along path.\nMax 6 towers.",
    cost: 100,
    range: 145,
    damage: 17,
    fireRate: 1,
    color: "#2563eb",
    barrelColor: "#93c5fd",
    projectileColor: "#fde047",
    targetMode: "progress",
    projectileSpeed: 340,
    maxCount: 6
  },
  frost: {
    id: "frost",
    name: "Frost Aura Tower",
    description:
      "Continuous aura: Enemies inside the ring are slowed by 25%. Ice Turret snowflakes that hit an enemy inside any Frost Aura apply 35% slow instead of 25%.\nStats:\nCost: 150g,\nRange: 145,\nAura slow: 25% (always on in range),\nSynergy: Ice hits in aura → 35% slow,\nNo shots — aura only.\nMax 2 towers.",
    cost: 150,
    range: 145,
    color: "#0891b2",
    barrelColor: "#67e8f9",
    aura: true,
    slowAmount: 0.25,
    slowDuration: 0.22,
    maxCount: 2
  },
  ice: {
    id: "ice",
    name: "Ice Turret",
    description:
      "Snowflake shots; skips enemies recently hit by Ice (spreads chill). In a Frost Aura, hits apply 35% slow instead of 25%.\nStats:\nCost: 150g,\nRange: 130,\nDamage: 20,\nShot Interval: 2s,\nProjectile speed 320,\nOn hit: 25% slow for 1s (35% in Frost Aura),\nTarget Prio: Closest to base along path (skips recent Ice hit).\nMax 4 towers.",
    cost: 150,
    range: 130,
    damage: 20,
    fireRate: 1.5,
    color: "#06b6d4",
    barrelColor: "#a5f3fc",
    projectileColor: "#67e8f9",
    targetMode: "progress",
    projectileSpeed: 320,
    slowAmount: 0.25,
    slowDuration: 1,
    projectileStyle: "snowflake",
    maxCount: 4
  },
  rocket: {
    id: "rocket",
    name: "Rocket Turret",
    description:
      "Splash damage aimed at the highest-HP enemy in range.\nStats:\nCost: 300g,\nRange: 175,\nDamage: 25,\nShot Interval: 2s,\nProjectile speed 290,\nSplash: 3 tiles,\nTarget Prio: Highest HP.\nMax 2 towers.",
    cost: 300,
    range: 175,
    damage: 30,
    fireRate: 2,
    color: "#7c3aed",
    barrelColor: "#c4b5fd",
    projectileColor: "#f97316",
    targetMode: "highestHp",
    projectileSpeed: 290,
    splash: true,
    splashHalfSize: TILE_SIZE / 2,
    maxCount: 2,
    projectileStyle: "rocket"
  },
  rail: {
    id: "rail",
    name: "Rail Gun Turret",
    description:
      "Piercing beam through every enemy along a line; aims for the direction that hits the most targets.\nStats:\nCost: 400g,\nRange: 350,\nDamage: 45 per hit,\nShot Interval: 4s,\nBeam speed: 1000,\nBonus vs boss: 1.5×,\nBonus vs square enemies: 1.5×,\nTarget Prio: Most enemies on line.\nMax 1 tower.",
    cost: 400,
    range: 350,
    damage: 40,
    fireRate: 4,
    color: "#475569",
    barrelColor: "#fbbf24",
    targetMode: "progress",
    railSpeed: 1000,
    maxCount: 1
  }
};

// --- Map picker metadata (ids must match buildMapLayout branches) ---
const MAP_CATALOG = [
  {
    id: "snake",
    name: "Snake (Easy)",
    blurb: "S-shaped path from top to bottom."
  },
  {
    id: "fork",
    name: "Fork (Medium)",
    blurb: "Not a Spoon."
  },
  {
    id: "trident",
    name: "Trident (Hard)",
    blurb: "Three top spawns merge, then a straight run to the base."
  }
];

// --- Mutable runtime state: one object the whole game reads/writes (not a framework store) ---
const state = {
  wave: 1,
  gold: 250,
  baseHp: 20,
  enemies: [],
  towers: [],
  projectiles: [],
  effects: [],
  waveInProgress: false,
  spawning: false,
  hoveredTile: null,
  selectedTowerType: null,
  sellMode: false,
  mouseCanvasPos: null,
  enemiesSpawnedThisWave: 0,
  enemiesToSpawnThisWave: 0,
  enemiesReachedBaseThisWave: 0,
  spawnTimer: 0,
  waveConfig: null,
  gameWon: false,
  gameOverTracked: false,
  gameOverByBoss: false,
  speedMultiplier: 1,
  difficultyHpMultiplier: 1,
  /** "normal" | "easy" | "hard" — set when Begin is clicked */
  difficulty: "normal",
  gameStarted: false,
  baseDamageFlashUntil: 0,
  goldPopups: []
};

// --- Analytics (Google tag; no-op if gtag missing) ---
function trackEvent(name, params = {}) {
  if (typeof window.gtag !== "function") {
    return;
  }
  window.gtag("event", name, params);
}

railShotSfx.preload = "auto";
basicTurretShotSfx.preload = "auto";
rocketTurretShotSfx.preload = "auto";
iceTurretShotSfx.preload = "auto";
frostAuraSfx.preload = "auto";

// --- Audio: master mute + per-channel levels; applyAudioVolumes pushes into Audio elements ---
const audioSettings = {
  muted: false,
  sfxLevel: 5,
  musicLevel: 5
};

function clampAudioLevel(value) {
  return Math.max(0, Math.min(AUDIO_MAX_LEVEL, value));
}

function getSfxMasterVolume() {
  if (audioSettings.muted) {
    return 0;
  }
  return (audioSettings.sfxLevel / AUDIO_MAX_LEVEL) * AUDIO_MASTER_GAIN;
}

function getMusicMasterVolume() {
  if (audioSettings.muted) {
    return 0;
  }
  return (audioSettings.musicLevel / AUDIO_MAX_LEVEL) * AUDIO_MASTER_GAIN;
}

function applyAudioVolumes() {
  if (menuMusicEl) {
    menuMusicEl.volume = BASE_MUSIC_VOLUME * getMusicMasterVolume();
  }
  railShotSfx.volume = BASE_SFX_VOLUME.rail * getSfxMasterVolume();
  basicTurretShotSfx.volume = BASE_SFX_VOLUME.basic * getSfxMasterVolume();
  rocketTurretShotSfx.volume = BASE_SFX_VOLUME.rocket * getSfxMasterVolume();
  iceTurretShotSfx.volume = BASE_SFX_VOLUME.ice * getSfxMasterVolume();
  frostAuraSfx.volume = BASE_SFX_VOLUME.frostAura * getSfxMasterVolume();
}

function refreshAudioHudUi() {
  if (muteToggleBtn) {
    muteToggleBtn.textContent = audioSettings.muted ? "🔇" : "🔊";
    muteToggleBtn.setAttribute("aria-label", audioSettings.muted ? "Unmute all audio" : "Mute all audio");
  }
  if (sfxVolumeSlider) {
    sfxVolumeSlider.value = String(audioSettings.sfxLevel);
  }
  if (musicVolumeSlider) {
    musicVolumeSlider.value = String(audioSettings.musicLevel);
  }
  if (sfxVolumeLabel) {
    sfxVolumeLabel.textContent = `Game SFX: ${audioSettings.sfxLevel}`;
  }
  if (musicVolumeLabel) {
    musicVolumeLabel.textContent = `Music: ${audioSettings.musicLevel}`;
  }
}

function playRailShotSfx() {
  // Clone to allow rapid overlapping rail shots without cutting prior sound.
  const sfx = railShotSfx.cloneNode();
  sfx.volume = railShotSfx.volume;
  const attempt = sfx.play();
  if (attempt && typeof attempt.catch === "function") {
    attempt.catch(() => {
      // Ignore autoplay/user-gesture rejections for SFX.
    });
  }
}

function playBasicTurretShotSfx() {
  const sfx = basicTurretShotSfx.cloneNode();
  sfx.volume = basicTurretShotSfx.volume;
  const attempt = sfx.play();
  if (attempt && typeof attempt.catch === "function") {
    attempt.catch(() => {
      // Ignore autoplay/user-gesture rejections for SFX.
    });
  }
}

function playRocketTurretShotSfx() {
  const sfx = rocketTurretShotSfx.cloneNode();
  sfx.volume = rocketTurretShotSfx.volume;
  const attempt = sfx.play();
  if (attempt && typeof attempt.catch === "function") {
    attempt.catch(() => {
      // Ignore autoplay/user-gesture rejections for SFX.
    });
  }
}

function playIceTurretShotSfx() {
  const sfx = iceTurretShotSfx.cloneNode();
  sfx.volume = iceTurretShotSfx.volume;
  const attempt = sfx.play();
  if (attempt && typeof attempt.catch === "function") {
    attempt.catch(() => {
      // Ignore autoplay/user-gesture rejections for SFX.
    });
  }
}

function playFrostAuraSfx() {
  const sfx = frostAuraSfx.cloneNode();
  sfx.volume = frostAuraSfx.volume;
  const attempt = sfx.play();
  if (attempt && typeof attempt.catch === "function") {
    attempt.catch(() => {
      // Ignore autoplay/user-gesture rejections for SFX.
    });
  }
}

// --- Map runtime: set by applyMapLayout(mapName) whenever map changes ---
let selectedMap;
let pathGrid;
let pathLaneGrid;
let mapPathOptions;
let endPoint;
let buildableGrid;
let spawnMarkers;

// --- Optional full-bleed background for the snake map (decorative; drawGrid may skip path fill) ---
const snakeMapBg = new Image();
let snakeMapBgLoaded = false;
snakeMapBg.onload = () => {
  snakeMapBgLoaded = true;
};
snakeMapBg.onerror = () => {
  snakeMapBgLoaded = false;
};
snakeMapBg.src = "assets/snake-map-bg.png";

// --- Map geometry: tile lists → grids and pixel paths for enemies ---
function computeSpawnMarkers(paths) {
  const list = [];
  const seen = new Set();
  for (const path of paths) {
    if (path.length < 1) {
      continue;
    }
    const p0 = path[0];
    const key = `${p0.x},${p0.y}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const angle =
      path.length >= 2 ? Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x) : 0;
    list.push({ x: p0.x, y: p0.y, angle });
  }
  return list;
}

/** Rebuilds all map-derived data after picking a map (menu or mid-game reset). */
function applyMapLayout(mapName) {
  selectedMap = buildMapLayout(mapName);
  pathGrid = createPathGrid(selectedMap.pathTiles);
  pathLaneGrid = createPathLaneGrid(selectedMap.paths);
  mapPathOptions = selectedMap.paths.map((pathTiles) => toPixelPath(pathTiles));
  endPoint = toPixelPoint(selectedMap.endTile);
  buildableGrid = createBuildableGrid(pathGrid);
  spawnMarkers = computeSpawnMarkers(mapPathOptions);
}

/** Tile coordinates [x,y] for the "fork" map (two lanes merging). */
function pathForkMergePaths() {
  const top = [];
  for (let x = 0; x <= 8; x += 1) {
    top.push([x, 0]);
  }
  top.push([8, 1], [8, 2]);
  const bottomLaneY = ROWS - 1 - NEXT_WAVE_OVERLAY_TILE_ROWS;
  const bottom = [];
  for (let x = 0; x <= 8; x += 1) {
    bottom.push([x, bottomLaneY]);
  }
  for (let y = bottomLaneY - 1; y >= 2; y -= 1) {
    bottom.push([8, y]);
  }
  const tail = [];
  for (let x = 8; x <= COLS - 1; x += 1) {
    tail.push([x, 2]);
  }
  for (let y = 3; y <= ROWS - 1; y += 1) {
    tail.push([COLS - 1, y]);
  }
  const tailRest = tail[0][0] === top[top.length - 1][0] && tail[0][1] === top[top.length - 1][1] ? tail.slice(1) : tail;
  return {
    pathA: top.concat(tailRest),
    pathB: bottom.concat(tailRest)
  };
}

/** Tile coordinates for the "trident" map (three spawns → one trunk → base bottom-right). */
function pathTridentPaths() {
  const cx = 8;
  const yMerge = 4;
  const leftSp = 2;
  const rightSp = 14;
  const tail = [];
  for (let y = yMerge + 1; y <= ROWS - 1; y += 1) {
    tail.push([cx, y]);
  }
  for (let x = cx + 1; x <= COLS - 1; x += 1) {
    tail.push([x, ROWS - 1]);
  }
  const left = [];
  for (let y = 0; y <= yMerge; y += 1) {
    left.push([leftSp, y]);
  }
  for (let x = leftSp + 1; x <= cx; x += 1) {
    left.push([x, yMerge]);
  }
  const center = [];
  for (let y = 0; y <= yMerge; y += 1) {
    center.push([cx, y]);
  }
  const right = [];
  for (let y = 0; y <= yMerge; y += 1) {
    right.push([rightSp, y]);
  }
  for (let x = rightSp - 1; x >= cx; x -= 1) {
    right.push([x, yMerge]);
  }
  return {
    paths: [left.concat(tail), center.concat(tail), right.concat(tail)]
  };
}

function dedupeConsecutiveTiles(tiles) {
  if (!tiles.length) {
    return tiles;
  }
  const out = [tiles[0]];
  for (let i = 1; i < tiles.length; i += 1) {
    const prev = out[out.length - 1];
    const cur = tiles[i];
    if (prev[0] !== cur[0] || prev[1] !== cur[1]) {
      out.push(cur);
    }
  }
  return out;
}

/** Single winding path for the "snake" map; built from horizontal/vertical segments. */
function pathSnakeS() {
  const tiles = [];
  const add = (x, y) => {
    const last = tiles[tiles.length - 1];
    if (!last || last[0] !== x || last[1] !== y) {
      tiles.push([x, y]);
    }
  };
  const h = (y, x0, x1) => {
    const s = x0 <= x1 ? 1 : -1;
    for (let x = x0; s > 0 ? x <= x1 : x >= x1; x += s) {
      add(x, y);
    }
  };
  const v = (x, y0, y1) => {
    const s = y0 <= y1 ? 1 : -1;
    for (let y = y0; s > 0 ? y <= y1 : y >= y1; y += s) {
      add(x, y);
    }
  };
  h(0, 0, 14);
  v(14, 1, 2);
  h(2, 14, 4);
  v(4, 3, 5);
  h(5, 5, 12);
  v(12, 6, 7);
  h(7, 12, 6);
  v(6, 7, 9);
  h(9, 7, 15);
  return dedupeConsecutiveTiles(tiles);
}

/** Returns { paths, pathTiles, startTile, endTile, mapName } for a catalog id. */
function buildMapLayout(mapName) {
  let mapDef;
  if (mapName === "trident") {
    mapDef = pathTridentPaths();
  } else if (mapName === "snake") {
    mapDef = { paths: [pathSnakeS()] };
  } else {
    const fm = pathForkMergePaths();
    mapDef = { paths: [fm.pathA, fm.pathB] };
  }
  const allTiles = mapDef.paths.flat();
  const uniqueTiles = [];
  const seenTiles = new Set();
  for (const tile of allTiles) {
    const key = `${tile[0]},${tile[1]}`;
    if (!seenTiles.has(key)) {
      seenTiles.add(key);
      uniqueTiles.push(tile);
    }
  }

  const longestPath = mapDef.paths.reduce((best, path) => (path.length > best.length ? path : best), mapDef.paths[0]);
  return {
    mapName: ["fork", "trident", "snake"].includes(mapName) ? mapName : "fork",
    paths: mapDef.paths,
    pathTiles: uniqueTiles,
    startTile: longestPath[0],
    endTile: longestPath[longestPath.length - 1]
  };
}

/** 2D array: 1 = path tile, 0 = buildable grass. */
function createPathGrid(pathTiles) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (const [x, y] of pathTiles) {
    if (inBounds(x, y)) {
      grid[y][x] = 1;
    }
  }
  return grid;
}

// --- Path rendering: lane colors when 1, 2, or 3+ paths share a tile ---
const LANE_PALETTES = [
  { base: "#e8c896", deep: "#b8863d", edge: "rgba(100, 55, 18, 0.58)", highlight: "rgba(255, 248, 220, 0.22)" },
  { base: "#d4a574", deep: "#8b5a2a", edge: "rgba(85, 45, 12, 0.58)", highlight: "rgba(255, 235, 200, 0.18)" },
  { base: "#c9a0dc", deep: "#6b4589", edge: "rgba(45, 25, 70, 0.5)", highlight: "rgba(250, 240, 255, 0.14)" }
];

const PATH_MERGE = {
  base: "#c4a060",
  deep: "#7a5230",
  edge: "rgba(70, 40, 15, 0.68)",
  stripeA: "rgba(255, 255, 255, 0.14)",
  stripeB: "rgba(40, 25, 10, 0.12)"
};

/** Each cell lists which path indices pass through (for merge coloring). */
function createPathLaneGrid(pathsAsTiles) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let pathIndex = 0; pathIndex < pathsAsTiles.length; pathIndex += 1) {
    for (const tile of pathsAsTiles[pathIndex]) {
      const x = tile[0];
      const y = tile[1];
      if (!inBounds(x, y)) {
        continue;
      }
      const cell = grid[y][x];
      if (cell === null) {
        grid[y][x] = [pathIndex];
      } else if (!cell.includes(pathIndex)) {
        cell.push(pathIndex);
      }
    }
  }
  return grid;
}

function sortedLaneIds(cell) {
  if (!cell || !cell.length) {
    return [];
  }
  return [...new Set(cell)].sort((a, b) => a - b);
}

/** Lane-colored dirt path (used for previews / tooling; main drawGrid uses snake-style tiles). */
function drawPathTile(px, py, x, y) {
  let lanes = sortedLaneIds(pathLaneGrid[y][x]);
  if (lanes.length <= 0) {
    lanes = [0];
  }

  if (lanes.length === 1) {
    const pal = LANE_PALETTES[lanes[0] % LANE_PALETTES.length];
    const g = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
    g.addColorStop(0, pal.base);
    g.addColorStop(0.55, pal.base);
    g.addColorStop(1, pal.deep);
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = pal.highlight;
    ctx.fillRect(px + 3, py + 3, TILE_SIZE - 6, 5);
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    return;
  }

  if (lanes.length === 2) {
    const p0 = LANE_PALETTES[lanes[0] % LANE_PALETTES.length];
    const p1 = LANE_PALETTES[lanes[1] % LANE_PALETTES.length];
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.lineTo(px, py + TILE_SIZE);
    ctx.closePath();
    const g0 = ctx.createLinearGradient(px, py, px + TILE_SIZE, py + TILE_SIZE);
    g0.addColorStop(0, p0.base);
    g0.addColorStop(1, p0.deep);
    ctx.fillStyle = g0;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.lineTo(px + TILE_SIZE, py);
    ctx.closePath();
    const g1 = ctx.createLinearGradient(px + TILE_SIZE, py, px, py + TILE_SIZE);
    g1.addColorStop(0, p1.base);
    g1.addColorStop(1, p1.deep);
    ctx.fillStyle = g1;
    ctx.fill();
    ctx.strokeStyle = PATH_MERGE.edge;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.stroke();
    ctx.strokeStyle = p0.edge;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    return;
  }

  const mg = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
  mg.addColorStop(0, PATH_MERGE.base);
  mg.addColorStop(1, PATH_MERGE.deep);
  ctx.fillStyle = mg;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = PATH_MERGE.stripeA;
  ctx.fillRect(px + 4, py + 8, TILE_SIZE - 8, 3);
  ctx.fillStyle = PATH_MERGE.stripeB;
  ctx.fillRect(px + 4, py + 16, TILE_SIZE - 8, 3);
  ctx.strokeStyle = PATH_MERGE.edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
}

/** Brown edge lines between path and grass (non-snake maps). */
function drawPathGrassDividers(px, py, x, y) {
  const w = 2.5;
  ctx.lineCap = "square";
  const edge = (nx, ny, drawLine) => {
    if (inBounds(nx, ny) && pathGrid[ny][nx] === 1) {
      return;
    }
    drawLine();
  };
  ctx.strokeStyle = "rgba(55, 35, 10, 0.48)";
  ctx.lineWidth = w;
  edge(x, y - 1, () => {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE_SIZE, py);
    ctx.stroke();
  });
  edge(x, y + 1, () => {
    ctx.beginPath();
    ctx.moveTo(px, py + TILE_SIZE);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.stroke();
  });
  edge(x - 1, y, () => {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + TILE_SIZE);
    ctx.stroke();
  });
  edge(x + 1, y, () => {
    ctx.beginPath();
    ctx.moveTo(px + TILE_SIZE, py);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.stroke();
  });
}

/** Softer dividers used with the snake map’s stone path look. */
function drawSnakePathGrassDividers(px, py, x, y) {
  const w = 2;
  ctx.lineCap = "square";
  const edge = (nx, ny, drawLine) => {
    if (inBounds(nx, ny) && pathGrid[ny][nx] === 1) {
      return;
    }
    drawLine();
  };
  ctx.strokeStyle = "rgba(14, 52, 14, 0.55)";
  ctx.lineWidth = w;
  edge(x, y - 1, () => {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE_SIZE, py);
    ctx.stroke();
  });
  edge(x, y + 1, () => {
    ctx.beginPath();
    ctx.moveTo(px, py + TILE_SIZE);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.stroke();
  });
  edge(x - 1, y, () => {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + TILE_SIZE);
    ctx.stroke();
  });
  edge(x + 1, y, () => {
    ctx.beginPath();
    ctx.moveTo(px + TILE_SIZE, py);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.stroke();
  });
}

function drawSnakeStonePathTile(px, py, x, y) {
  const inset = 3;
  const g = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
  g.addColorStop(0, "#d4d2c8");
  g.addColorStop(0.45, "#b8b6ae");
  g.addColorStop(1, "#8e8c86");
  ctx.fillStyle = g;
  ctx.fillRect(px + inset, py + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(px + inset + 2, py + inset + 2, TILE_SIZE - inset * 2 - 10, 4);
  ctx.strokeStyle = "rgba(55, 52, 46, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, TILE_SIZE - inset * 2 - 1, TILE_SIZE - inset * 2 - 1);
  const seed = (x * 19 + y * 29) % 5;
  if (seed === 1) {
    ctx.fillStyle = "rgba(90, 88, 82, 0.25)";
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE * 0.35, py + TILE_SIZE * 0.55, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (seed === 3) {
    ctx.fillStyle = "rgba(70, 68, 62, 0.2)";
    ctx.fillRect(px + TILE_SIZE * 0.55, py + TILE_SIZE * 0.35, 5, 4);
  }
}

function drawSnakeGrassTile(px, py, x, y) {
  ctx.fillStyle = grassShade(x, y);
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = "rgba(10, 48, 10, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  const seed = (x * 31 + y * 17) % 13;
  if (seed === 0 || seed === 4) {
    ctx.fillStyle = "#1a5c32";
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE * 0.38, py + TILE_SIZE * 0.36, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d8f4a";
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE * 0.42, py + TILE_SIZE * 0.32, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (seed === 8) {
    ctx.fillStyle = "#5a6b5e";
    ctx.fillRect(px + 20, py + 20, 6, 5);
  } else if (seed === 6) {
    ctx.fillStyle = "#f0faf0";
    ctx.fillRect(px + 28, py + 26, 2, 2);
    ctx.fillRect(px + 32, py + 24, 2, 2);
  }
  const inset = 6;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.strokeRect(px + inset, py + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  ctx.setLineDash([]);
}

function drawSnakeMapLabels() {
  if (!selectedMap || selectedMap.mapName !== "snake" || !selectedMap.paths[0] || !selectedMap.paths[0].length) {
    return;
  }
  const start = toPixelPoint(selectedMap.paths[0][0]);
  const end = endPoint;
  const endLabelY = end.y - 26;
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0, 50, 0, 0.88)";
  ctx.fillRect(start.x - 26, start.y - 11, 52, 20);
  ctx.fillStyle = "#f8faf8";
  ctx.fillText("START", start.x, start.y);
  ctx.fillStyle = "rgba(0, 58, 0, 0.88)";
  ctx.fillRect(end.x - 22, endLabelY - 10, 44, 20);
  ctx.fillStyle = "#f8faf8";
  ctx.fillText("END", end.x, endLabelY);
}

// --- Tile space ↔ canvas pixel space (centers of tiles) ---
function toPixelPoint(tile) {
  return {
    x: tile[0] * TILE_SIZE + TILE_SIZE / 2,
    y: tile[1] * TILE_SIZE + TILE_SIZE / 2
  };
}

function toPixelPath(pathTiles) {
  return pathTiles.map((tile) => toPixelPoint(tile));
}

/** true where pathGrid is 0 — only those cells accept new towers. */
function createBuildableGrid(grid) {
  return grid.map((row) => row.map((cell) => cell === 0));
}

// --- Enemy: follows pathPoints in order; slow timers stack visually via slowMultiplier ---
class Enemy {
  constructor(config, pathPoints) {
    this.maxHp = config.hp;
    this.hp = config.hp;
    this.speed = config.speed;
    this.pathPoints = pathPoints;
    this.pathIndex = 0;
    this.x = pathPoints[0].x;
    this.y = pathPoints[0].y;
    this.radius = config.radius ?? 13;
    this.baseDamage = config.baseDamage ?? 1;
    this.isBoss = Boolean(config.isBoss);
    this.shape = config.shape || "circle";
    this.baseColor = config.color || "#8b0000";
    this.slowMultiplier = 1;
    this.slowTimer = 0;
    this.iceSlowTimer = 0;
    this.hitFlashTimer = 0;
    this.reachedBase = false;
  }

  update(dt) {
    const targetIndex = this.pathIndex + 1;
    if (targetIndex >= this.pathPoints.length) {
      this.reachedBase = true;
      return;
    }

    const target = this.pathPoints[targetIndex];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        this.slowMultiplier = 1;
      }
    }
    if (this.iceSlowTimer > 0) {
      this.iceSlowTimer -= dt;
      if (this.iceSlowTimer <= 0) {
        this.iceSlowTimer = 0;
      }
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }

    const activeSlow = this.slowTimer > 0 ? this.slowMultiplier : 1;
    const step = this.speed * activeSlow * dt;

    if (dist <= step) {
      this.x = target.x;
      this.y = target.y;
      this.pathIndex += 1;
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  applySlow(amount, duration) {
    const cappedAmount = Math.max(0, Math.min(0.8, amount));
    const slowValue = 1 - cappedAmount;
    this.slowMultiplier = Math.min(this.slowMultiplier, slowValue);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  draw() {
    const hpRatio = Math.max(0, this.hp / this.maxHp);
    const bodyColor = this.hitFlashTimer > 0 ? darkenHexColor(this.baseColor, 0.35) : this.baseColor;
    const t = performance.now() * 0.007;
    const bob = Math.sin(t + this.x * 0.04 + this.y * 0.03) * 1.4;
    const wobble = Math.sin(t * 1.2 + this.pathIndex * 0.35 + this.x * 0.02) * 0.05;
    const slowed = this.slowTimer > 0 || this.iceSlowTimer > 0;
    const now = performance.now();
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(wobble);
    if (slowed) {
      const chill = ctx.createRadialGradient(0, 0, this.radius * 0.2, 0, 0, this.radius + 10);
      chill.addColorStop(0, "rgba(207, 250, 254, 0.14)");
      chill.addColorStop(0.55, "rgba(103, 232, 249, 0.06)");
      chill.addColorStop(1, "rgba(103, 232, 249, 0)");
      ctx.fillStyle = chill;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = bodyColor;
    if (this.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(this.radius * 0.9, this.radius * 0.8);
      ctx.lineTo(-this.radius * 0.9, this.radius * 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (this.shape === "square") {
      const side = this.radius * 1.75;
      ctx.fillRect(-side / 2, -side / 2, side, side);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.isBoss) {
      drawBossFace(ctx, 0, 0, this.radius);
    }

    if (slowed) {
      const ringR = this.radius + 3 + Math.sin(now * 0.006 + this.x * 0.1) * 0.8;
      const pulse = 0.32 + 0.12 * Math.sin(now * 0.005);
      ctx.strokeStyle = `rgba(34, 211, 238, ${pulse})`;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -(now * 0.04) % 16;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      for (let k = 0; k < 3; k += 1) {
        const ang = now * 0.0022 + k * ((Math.PI * 2) / 3);
        const pr = ringR + 1.5;
        const sx = Math.cos(ang) * pr;
        const sy = Math.sin(ang) * pr;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = "#1f2937";
    ctx.fillRect(-16, -20, 32, 5);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(-16, -20, 32 * hpRatio, 5);
    ctx.restore();
  }
}

// --- Tower: non-aura towers use findTarget + cooldown; frost applies slow every frame in range ---
class Tower {
  constructor(tileX, tileY, typeId) {
    const type = TOWER_TYPES[typeId] || TOWER_TYPES.basic;
    this.tileX = tileX;
    this.tileY = tileY;
    this.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.y = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.typeId = type.id;
    this.range = type.range;
    this.damage = type.damage ?? 0;
    this.fireRate = type.fireRate ?? 0;
    this.projectileColor = type.projectileColor;
    this.projectileSpeed = type.projectileSpeed ?? 340;
    this.slowAmount = type.slowAmount || 0;
    this.slowDuration = type.slowDuration || 0;
    this.splash = Boolean(type.splash);
    this.splashHalfSize = type.splashHalfSize || TILE_SIZE / 2;
    this.projectileStyle = type.projectileStyle || "orb";
    this.aura = Boolean(type.aura);
    this.targetMode = type.targetMode || "progress";
    this.color = type.color;
    this.barrelColor = type.barrelColor;
    this.railSpeed = type.railSpeed ?? 0;
    this.cooldown = this.typeId === "rail" ? 0.5 : 0;
    this.aimAngle = -Math.PI / 2;
    this.auraSoundTimer = 0;
  }

  update(dt) {
    if (this.aura) {
      let enemyInAura = false;
      for (const enemy of state.enemies) {
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.range) {
          enemyInAura = true;
          enemy.applySlow(this.slowAmount, this.slowDuration);
        }
      }
      this.auraSoundTimer = Math.max(0, this.auraSoundTimer - dt);
      if (enemyInAura && this.auraSoundTimer <= 0) {
        playFrostAuraSfx();
        this.auraSoundTimer = 1;
      }
      return;
    }

    const aimTarget = this.findTarget();
    if (aimTarget) {
      this.aimAngle = Math.atan2(aimTarget.y - this.y, aimTarget.x - this.x);
    }

    this.cooldown -= dt;
    if (this.cooldown > 0) {
      return;
    }

    const target = this.findTarget();
    if (!target) {
      return;
    }

    this.cooldown = this.fireRate;

    if (this.typeId === "rail") {
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) {
        return;
      }
      const dirX = dx / len;
      const dirY = dy / len;
      const startX = this.x + dirX * 22;
      const startY = this.y + dirY * 22;
      state.projectiles.push(new RailProjectile(startX, startY, dirX, dirY, this.railSpeed || 1000, this.damage));
      playRailShotSfx();
      return;
    }
    if (this.typeId === "basic") {
      playBasicTurretShotSfx();
    } else if (this.typeId === "ice") {
      playIceTurretShotSfx();
    } else if (this.typeId === "rocket") {
      playRocketTurretShotSfx();
    }

    state.projectiles.push(new Projectile(this.x, this.y, target, {
      damage: this.damage,
      color: this.projectileColor,
      speed: this.projectileSpeed,
      slowAmount: this.slowAmount,
      slowDuration: this.slowDuration,
      splash: this.splash,
      splashHalfSize: this.splashHalfSize,
      style: this.projectileStyle,
      sourceTowerTypeId: this.typeId
    }));
  }

  findTarget() {
    if (this.typeId === "rail") {
      return this.findRailTarget();
    }
    let best = null;

    if (this.targetMode === "highestHp") {
      let bestHp = -1;
      for (const enemy of state.enemies) {
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist > this.range) {
          continue;
        }
        if (this.typeId === "ice" && enemy.iceSlowTimer > 0) {
          continue;
        }
        if (enemy.hp > bestHp) {
          best = enemy;
          bestHp = enemy.hp;
        }
      }
      return best;
    }

    // progress: enemy closest to base wins (minimum remaining distance along path)
    let bestRemaining = Infinity;
    for (const enemy of state.enemies) {
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist > this.range) {
        continue;
      }
      if (this.typeId === "ice" && enemy.iceSlowTimer > 0) {
        continue;
      }
      const remaining = getEnemyRemainingPathDistance(enemy);
      if (remaining < bestRemaining) {
        best = enemy;
        bestRemaining = remaining;
      } else if (
        best !== null &&
        Math.abs(remaining - bestRemaining) < 0.02 &&
        enemy.pathIndex > best.pathIndex
      ) {
        best = enemy;
      }
    }

    return best;
  }

  findRailTarget() {
    let best = null;
    let bestCount = -1;
    let bestTieRemaining = Infinity;

    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) {
        continue;
      }
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist > this.range) {
        continue;
      }
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) {
        continue;
      }
      const dirX = dx / len;
      const dirY = dy / len;
      const startX = this.x + dirX * 22;
      const startY = this.y + dirY * 22;
      const cnt = countEnemiesOnRailLine(startX, startY, dirX, dirY, this.x, this.y, this.range);
      const remaining = getEnemyRemainingPathDistance(enemy);
      if (cnt > bestCount || (cnt === bestCount && remaining < bestTieRemaining)) {
        bestCount = cnt;
        bestTieRemaining = remaining;
        best = enemy;
      }
    }

    return best;
  }

  drawFrostAuraTower() {
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    const breathe = 0.92 + 0.08 * Math.sin(t * 2.1);

    ctx.strokeStyle = "rgba(103, 232, 249, 0.55)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(103, 232, 249, 0.1)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(34, 211, 238, ${0.2 + 0.18 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range * 0.45 * breathe, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#0c2f38";
    ctx.beginPath();
    ctx.moveTo(this.x - 22, this.y + 16);
    ctx.lineTo(this.x + 22, this.y + 16);
    ctx.lineTo(this.x + 17, this.y + 5);
    ctx.lineTo(this.x - 17, this.y + 5);
    ctx.closePath();
    ctx.fill();

    const bodyGrad = ctx.createLinearGradient(this.x, this.y - 20, this.x, this.y + 10);
    bodyGrad.addColorStop(0, "#164e63");
    bodyGrad.addColorStop(0.45, "#0e7490");
    bodyGrad.addColorStop(1, "#0c4a5e");
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(this.x - 12, this.y - 14, 24, 24);

    ctx.fillStyle = "rgba(207, 250, 254, 0.35)";
    ctx.fillRect(this.x - 10, this.y - 12, 4, 18);

    ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.x - 12, this.y - 14, 24, 24);

    ctx.fillStyle = "#155e75";
    ctx.beginPath();
    ctx.moveTo(this.x - 14, this.y - 14);
    ctx.lineTo(this.x + 14, this.y - 14);
    ctx.lineTo(this.x + 10, this.y - 22);
    ctx.lineTo(this.x - 10, this.y - 22);
    ctx.closePath();
    ctx.fill();

    const orbR = 6 + 1.2 * pulse;
    ctx.shadowColor = "rgba(56, 189, 248, 0.9)";
    ctx.shadowBlur = 12 + 14 * pulse;
    ctx.fillStyle = "#67e8f9";
    ctx.beginPath();
    ctx.arc(this.x, this.y - 26, orbR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(this.x - 2, this.y - 28, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(165, 243, 252, ${0.35 + 0.25 * pulse})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(this.x, this.y - 26, orbR + 4 + 2 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawBasicTurret() {
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle + Math.PI / 2);

    ctx.fillStyle = "#1e3a5f";
    ctx.beginPath();
    ctx.moveTo(-20, 14);
    ctx.lineTo(20, 14);
    ctx.lineTo(16, 20);
    ctx.lineTo(-16, 20);
    ctx.closePath();
    ctx.fill();

    const hullGrad = ctx.createLinearGradient(0, -12, 0, 12);
    hullGrad.addColorStop(0, "#3b82f6");
    hullGrad.addColorStop(0.5, this.color);
    hullGrad.addColorStop(1, "#1e40af");
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.lineTo(14, 10);
    ctx.lineTo(12, -8);
    ctx.lineTo(-12, -8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(147, 197, 253, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const barrelGrad = ctx.createLinearGradient(0, -8, 0, -26);
    barrelGrad.addColorStop(0, "#60a5fa");
    barrelGrad.addColorStop(0.6, this.barrelColor);
    barrelGrad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(-5, -24, 10, 16);
    ctx.fillStyle = "rgba(30, 64, 175, 0.6)";
    ctx.fillRect(-5, -18, 10, 2);
    ctx.fillRect(-5, -12, 10, 2);

    ctx.fillStyle = `rgba(254, 240, 138, ${0.35 + 0.35 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, -26, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -26, 4 + pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawIceTurret() {
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
    const shimmer = 0.92 + 0.08 * Math.sin(t * 5);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle + Math.PI / 2);

    ctx.fillStyle = "#0c4a6e";
    ctx.beginPath();
    ctx.moveTo(-18, 16);
    ctx.lineTo(18, 16);
    ctx.lineTo(14, 22);
    ctx.lineTo(-14, 22);
    ctx.closePath();
    ctx.fill();

    const hullGrad = ctx.createLinearGradient(-12, -10, 12, 10);
    hullGrad.addColorStop(0, "#0891b2");
    hullGrad.addColorStop(0.45, this.color);
    hullGrad.addColorStop(1, "#155e75");
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(-13, 10);
    ctx.lineTo(13, 10);
    ctx.lineTo(11, -6);
    ctx.lineTo(-11, -6);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(165, 243, 252, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.strokeStyle = `rgba(207, 250, 254, ${0.4 * shimmer})`;
    ctx.lineWidth = 1;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(s * 11, -4);
      ctx.lineTo(s * 15, -14);
      ctx.lineTo(s * 12, -16);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.shadowColor = "rgba(103, 232, 249, 0.55)";
    ctx.shadowBlur = 6 + 8 * pulse;
    const barrelGrad = ctx.createLinearGradient(0, -6, 0, -28);
    barrelGrad.addColorStop(0, "#a5f3fc");
    barrelGrad.addColorStop(1, "#06b6d4");
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(-4.5, -26, 9, 20);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.beginPath();
    ctx.arc(0, -26, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(125, 211, 252, ${0.35 + 0.25 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, -10);
    ctx.lineTo(3, -10);
    ctx.stroke();

    ctx.restore();
  }

  drawRocketTurret() {
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.8);
    const flicker = 0.85 + 0.15 * Math.sin(t * 6.2);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle + Math.PI / 2);

    ctx.fillStyle = "#4c1d95";
    ctx.beginPath();
    ctx.moveTo(-22, 15);
    ctx.lineTo(22, 15);
    ctx.lineTo(18, 21);
    ctx.lineTo(-18, 21);
    ctx.closePath();
    ctx.fill();

    const hullGrad = ctx.createLinearGradient(0, -8, 0, 12);
    hullGrad.addColorStop(0, "#8b5cf6");
    hullGrad.addColorStop(0.45, this.color);
    hullGrad.addColorStop(1, "#5b21b6");
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(-15, 10);
    ctx.lineTo(15, 10);
    ctx.lineTo(13, -4);
    ctx.lineTo(-13, -4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(196, 181, 253, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#6d28d9";
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(-22, 8);
    ctx.lineTo(-18, 10);
    ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, 2);
    ctx.lineTo(22, 8);
    ctx.lineTo(18, 10);
    ctx.lineTo(14, 4);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = "rgba(249, 115, 22, 0.75)";
    ctx.shadowBlur = 10 + 12 * pulse;
    ctx.fillStyle = `rgba(251, 146, 60, ${0.55 * flicker})`;
    ctx.beginPath();
    ctx.ellipse(0, -6, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const barrelGrad = ctx.createLinearGradient(0, -4, 0, -30);
    barrelGrad.addColorStop(0, "#c4b5fd");
    barrelGrad.addColorStop(0.5, this.barrelColor);
    barrelGrad.addColorStop(1, "#5b21b6");
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(-6, -28, 12, 24);
    ctx.fillStyle = "#7c3aed";
    ctx.fillRect(-6, -16, 12, 3);

    ctx.fillStyle = this.projectileColor || "#f97316";
    ctx.globalAlpha = 0.45 + 0.35 * pulse;
    ctx.beginPath();
    ctx.arc(0, -30, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(254, 215, 170, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -30, 5 + pulse * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawRailTurret() {
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
    const arcPhase = Math.sin(t * 8);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle + Math.PI / 2);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-24, 14, 48, 8);
    ctx.fillStyle = "#334155";
    ctx.fillRect(-20, 16, 40, 4);

    const hullGrad = ctx.createLinearGradient(-14, -6, 14, 10);
    hullGrad.addColorStop(0, "#64748b");
    hullGrad.addColorStop(0.4, this.color);
    hullGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = hullGrad;
    ctx.fillRect(-16, -6, 32, 16);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-16.5, -6.5, 33, 17);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(-10, 2, 6, 5);
    ctx.fillRect(4, 2, 6, 5);

    ctx.fillStyle = "#334155";
    ctx.fillRect(-18, -2, 4, 8);
    ctx.fillRect(14, -2, 4, 8);

    const railGrad = ctx.createLinearGradient(0, -18, 0, -32);
    railGrad.addColorStop(0, "#fde68a");
    railGrad.addColorStop(0.35, this.barrelColor);
    railGrad.addColorStop(1, "#92400e");
    ctx.fillStyle = railGrad;
    ctx.fillRect(-18, -22, 36, 6);
    ctx.fillRect(-4, -30, 8, 12);

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(-17, -21, 34, 2);
    ctx.fillRect(-17, -19, 34, 2);

    ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 + 0.35 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14 + arcPhase * 2, -24);
    ctx.lineTo(14 - arcPhase * 2, -28);
    ctx.stroke();

    ctx.shadowColor = "rgba(251, 191, 36, 0.6)";
    ctx.shadowBlur = 4 + 6 * pulse;
    ctx.fillStyle = "#fcd34d";
    ctx.fillRect(-3, -32, 6, 3);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  draw() {
    if (this.aura) {
      if (this.typeId === "frost") {
        this.drawFrostAuraTower();
        return;
      }
      ctx.strokeStyle = "rgba(103, 232, 249, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(103, 232, 249, 0.07)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - 14, this.y - 14, 28, 28);
      return;
    }
    if (this.typeId === "basic") {
      this.drawBasicTurret();
      return;
    }
    if (this.typeId === "ice") {
      this.drawIceTurret();
      return;
    }
    if (this.typeId === "rocket") {
      this.drawRocketTurret();
      return;
    }
    if (this.typeId === "rail") {
      this.drawRailTurret();
      return;
    }
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - 14, this.y - 14, 28, 28);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle + Math.PI / 2);
    ctx.fillStyle = this.barrelColor;
    ctx.fillRect(-4, -20, 8, 10);
    ctx.restore();
  }
}

// --- Standard projectile: homing shot; on hit calls damageEnemy (ice checks frost synergy here) ---
class Projectile {
  constructor(x, y, target, config) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = config.damage;
    this.color = config.color || "#fde047";
    this.speed = config.speed || 340;
    this.slowAmount = config.slowAmount || 0;
    this.slowDuration = config.slowDuration || 0;
    this.splash = Boolean(config.splash);
    this.splashHalfSize = config.splashHalfSize || TILE_SIZE / 2;
    this.style = config.style || "orb";
    this.angle = 0;
    this.done = false;
    this.sourceTowerTypeId = config.sourceTowerTypeId || null;
  }

  update(dt) {
    if (this.done || !state.enemies.includes(this.target)) {
      this.done = true;
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    this.angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (dist <= step + this.target.radius * 0.4) {
      this.applyHit();
      this.done = true;
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  applyHit() {
    if (!this.splash) {
      let slowAmt = this.slowAmount;
      if (
        this.sourceTowerTypeId === "ice" &&
        this.style === "snowflake" &&
        isEnemyInAnyFrostAura(this.target)
      ) {
        slowAmt = 0.35;
      }
      damageEnemy(this.target, this.damage, slowAmt, this.slowDuration);
      if (this.sourceTowerTypeId === "ice") {
        this.target.iceSlowTimer = Math.max(this.target.iceSlowTimer, this.slowDuration);
      }
      return;
    }

    const direction = getEnemyForwardVector(this.target);
    const centers = [
      { x: this.target.x, y: this.target.y },
      { x: this.target.x + direction.x * TILE_SIZE, y: this.target.y + direction.y * TILE_SIZE },
      { x: this.target.x - direction.x * TILE_SIZE, y: this.target.y - direction.y * TILE_SIZE }
    ];

    const hitEnemies = new Set();
    for (const center of centers) {
      state.effects.push(new ExplosionEffect(center.x, center.y));
      for (const enemy of state.enemies) {
        if (hitEnemies.has(enemy)) {
          continue;
        }
        if (Math.abs(enemy.x - center.x) <= this.splashHalfSize && Math.abs(enemy.y - center.y) <= this.splashHalfSize) {
          damageEnemy(enemy, this.damage, 0, 0);
          hitEnemies.add(enemy);
        }
      }
    }
  }

  draw() {
    if (this.style === "snowflake") {
      drawSnowflakeProjectile(this.x, this.y, this.color);
      return;
    }
    if (this.style === "rocket") {
      drawRocketProjectile(this.x, this.y, this.angle, this.color);
      return;
    }
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Rail aiming: ray vs circle for “how many enemies does this beam line hit?” ---
function segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) {
    return Math.hypot(cx - x1, cy - y1) <= r;
  }
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(cx - px, cy - py) <= r;
}

function countEnemiesOnRailLine(startX, startY, dirX, dirY, towerX, towerY, range) {
  const farX = startX + dirX * 4000;
  const farY = startY + dirY * 4000;
  let count = 0;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }
    const d = Math.hypot(enemy.x - towerX, enemy.y - towerY);
    if (d > range) {
      continue;
    }
    if (segmentHitsCircle(startX, startY, farX, farY, enemy.x, enemy.y, enemy.radius + 3)) {
      count += 1;
    }
  }
  return count;
}

/** Moves along a line; pierces each enemy once per shot; bonus dmg vs boss/square in update(). */
class RailProjectile {
  constructor(sx, sy, dirX, dirY, speed, damage) {
    this.x = sx;
    this.y = sy;
    this.prevX = sx;
    this.prevY = sy;
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = speed;
    this.damage = damage;
    this.hitEnemies = new Set();
    this.done = false;
  }

  update(dt) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) {
        continue;
      }
      if (this.hitEnemies.has(enemy)) {
        continue;
      }
      if (segmentHitsCircle(this.prevX, this.prevY, this.x, this.y, enemy.x, enemy.y, enemy.radius + 3)) {
        let dmg = this.damage;
        let mult = 1;
        if (enemy.isBoss) {
          mult *= 1.5;
        }
        if (enemy.shape === "square") {
          mult *= 1.5;
        }
        damageEnemy(enemy, dmg * mult, 0, 0);
        this.hitEnemies.add(enemy);
      }
    }
    if (this.x < -100 || this.x > canvas.width + 100 || this.y < -100 || this.y > canvas.height + 100) {
      this.done = true;
    }
  }

  draw() {
    const bx = this.x - this.dirX * 120;
    const by = this.y - this.dirY * 120;
    const fx = this.x + this.dirX * 40;
    const fy = this.y + this.dirY * 40;
    ctx.strokeStyle = "rgba(251, 191, 36, 0.45)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
  }
}

/** Short-lived ring drawn after rocket splash (state.effects). */
class ExplosionEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.life = 0.35;
    this.maxLife = 0.35;
    this.maxRadius = TILE_SIZE * 0.55;
  }

  update(dt) {
    this.life -= dt;
  }

  draw() {
    const progress = 1 - Math.max(0, this.life) / this.maxLife;
    const radius = this.maxRadius * progress;
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.strokeStyle = `rgba(255, 196, 120, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 120, 40, ${alpha * 0.45})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  get done() {
    return this.life <= 0;
  }
}

// --- Wave flow: startWave arms counters; update() drives spawnEnemy until quota met ---
function startWave() {
  if (!state.gameStarted || state.waveInProgress || state.baseHp <= 0 || state.gameWon || state.wave > FINAL_WAVE) {
    return;
  }

  const config = getWaveConfig(state.wave);
  state.waveInProgress = true;
  state.spawning = true;
  state.enemiesSpawnedThisWave = 0;
  state.enemiesToSpawnThisWave = getEnemySpawnCountForWave(config);
  state.enemiesReachedBaseThisWave = 0;
  state.spawnTimer = 0;
  state.waveConfig = config;
  startWaveBtn.disabled = true;
  trackEvent("wave_start", {
    wave: state.wave,
    map: selectedMap ? selectedMap.mapName : "unknown",
    difficulty: state.difficulty
  });
}

function spawnEnemy() {
  if (!state.waveConfig) {
    return;
  }
  const randomPath = mapPathOptions[Math.floor(Math.random() * mapPathOptions.length)];
  const typeConfig = getEnemyTypeForWave(state.wave);
  const enemyConfig = {
    ...state.waveConfig,
    hp: Math.floor(state.waveConfig.hp * typeConfig.hpMultiplier * state.difficultyHpMultiplier),
    speed: state.waveConfig.speed * typeConfig.speedMultiplier,
    radius: typeConfig.radius ?? state.waveConfig.radius,
    color: typeConfig.color,
    shape: typeConfig.shape,
    isBoss: Boolean(state.waveConfig.isBoss)
  };
  state.enemies.push(new Enemy(enemyConfig, randomPath));
  state.enemiesSpawnedThisWave += 1;
}

/** Visual/variant stats layered on top of getWaveConfig base numbers. */
function getEnemyTypeForWave(wave) {
  // Keep boss wave as dedicated boss enemy.
  if (wave === 10) {
    return {
      shape: "circle",
      color: "#7f1d1d",
      hpMultiplier: 1,
      speedMultiplier: 1
    };
  }

  const pool = [
    {
      shape: "circle",
      color: "#8b0000",
      hpMultiplier: 1,
      speedMultiplier: 1
    }
  ];

  if (wave >= 3) {
    pool.push({
      shape: "triangle",
      color: "#0f766e",
      hpMultiplier: 0.75,
      speedMultiplier: 1.25,
      radius: 12
    });
  }

  if (wave >= 7) {
    pool.push({
      shape: "square",
      color: "#7c3f00",
      hpMultiplier: 1.35,
      speedMultiplier: 0.82,
      radius: 14
    });
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/** Per-wave enemy count, HP, speed, spawn gap, boss flag — main difficulty curve. */
function getWaveConfig(wave) {
  // Waves 1-9: steadily increase count and HP so each wave feels harder.
  if (wave <= 9) {
    return {
      enemyCount: 6 + wave * 2,
      hp: 35 + wave * 12,
      speed: 44 + wave * 2,
      spawnInterval: Math.max(0.45, 1.15 - wave * 0.08),
      baseDamage: 1,
      radius: 13,
      isBoss: false,
      color: "#8b0000"
    };
  }

  if (wave === 10) {
    return {
      enemyCount: 1,
      hp: 2025,
      speed: 54,
      spawnInterval: 1.2,
      baseDamage: 20,
      radius: 39,
      isBoss: true,
      color: "#7f1d1d"
    };
  }

  // Post-boss scaling continues from a tougher baseline.
  return {
    enemyCount: 16 + (wave - 10) * 2,
    hp: 160 + (wave - 10) * 22,
    speed: 56 + (wave - 10) * 2,
    spawnInterval: Math.max(0.35, 0.62 - (wave - 10) * 0.02),
    baseDamage: 1,
    radius: 14,
    isBoss: false,
    color: "#8b0000"
  };
}

/** Hard mode: +1 spawn per wave; boss wave stays a single boss. */
function getEnemySpawnCountForWave(config) {
  if (state.difficulty !== "hard" || config.isBoss) {
    return config.enemyCount;
  }
  return config.enemyCount + 1;
}

/** Display name for the wave-10 circle boss (shown in next-wave preview). */
const BOSS_DISPLAY_NAME = "Zortac CircleFace";
const BOSS_NEXT_WAVE_BLURB = `Titan Boss Detected: ${BOSS_DISPLAY_NAME}`;
const DEFEAT_LINE_BOSS = "Zortac was able to break your defenses and has now encircled the city.";
const DEFEAT_LINE_REGULAR = "The GeoScourge has taken the city.";

/** Wave number that will start next (null = hide panel). */
function getNextWaveNumber() {
  if (!state.gameStarted || state.gameWon || state.baseHp <= 0) {
    return null;
  }
  if (state.waveInProgress && state.wave >= FINAL_WAVE) {
    return null;
  }
  if (state.waveInProgress) {
    return state.wave + 1;
  }
  if (state.wave > FINAL_WAVE) {
    return null;
  }
  return state.wave;
}

/** Milestone preview for triangle (wave 3), square (7), boss (10); else null. */
function getNewEnemyPreview(nextWave) {
  if (nextWave === FINAL_WAVE) {
    return {
      blurb: BOSS_NEXT_WAVE_BLURB,
      icon: { shape: "circle", color: "#7f1d1d", isBoss: true, radius: 39 }
    };
  }
  if (nextWave === 3) {
    return {
      blurb: "Skirmisher: faster movement, lower HP than standard grunts.",
      icon: { shape: "triangle", color: "#0f766e", isBoss: false, radius: 12 }
    };
  }
  if (nextWave === 7) {
    return {
      blurb: "Armored square: higher HP, slower; takes extra damage from rail shots.",
      icon: { shape: "square", color: "#7c3f00", isBoss: false, radius: 14 }
    };
  }
  return null;
}

function drawNextWaveEnemyIcon(canvas, iconSpec) {
  if (!canvas) {
    return;
  }
  const c = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "rgba(15, 23, 42, 0.55)";
  c.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + (iconSpec.isBoss ? 2 : 0);
  const r = iconSpec.isBoss ? Math.min(20, (Math.min(w, h) / 2) - 4) : iconSpec.shape === "square" ? 15 : iconSpec.shape === "triangle" ? 14 : 14;
  c.save();
  c.translate(cx, cy);
  c.fillStyle = iconSpec.color;
  if (iconSpec.shape === "triangle") {
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r * 0.9, r * 0.8);
    c.lineTo(-r * 0.9, r * 0.8);
    c.closePath();
    c.fill();
  } else if (iconSpec.shape === "square") {
    const side = r * 1.75;
    c.fillRect(-side / 2, -side / 2, side, side);
  } else {
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
  }
  if (iconSpec.isBoss) {
    drawBossFace(c, 0, 0, r);
  }
  c.restore();
}

function updateNextWavePanel() {
  if (!nextWavePanel || !nextWaveNumEl || !nextWaveEnemyCountEl) {
    return;
  }
  const nw = getNextWaveNumber();
  if (nw === null) {
    nextWavePanel.classList.add("hidden");
    return;
  }
  nextWavePanel.classList.remove("hidden");
  nextWaveNumEl.textContent = String(nw);
  const cfg = getWaveConfig(nw);
  nextWaveEnemyCountEl.textContent = String(getEnemySpawnCountForWave(cfg));

  const preview = getNewEnemyPreview(nw);
  if (!nextWaveNewSection || !nextWaveBlurbEl) {
    return;
  }
  if (!preview) {
    nextWaveNewSection.classList.add("hidden");
    return;
  }
  nextWaveNewSection.classList.remove("hidden");
  nextWaveBlurbEl.textContent = preview.blurb;
  drawNextWaveEnemyIcon(nextWavePreviewCanvas, preview.icon);
}

function isEnemyInAnyFrostAura(enemy) {
  for (const tower of state.towers) {
    if (tower.typeId !== "frost" || !tower.aura) {
      continue;
    }
    const dist = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
    if (dist <= tower.range) {
      return true;
    }
  }
  return false;
}

/** Central hit handler: HP, brief flash, optional slow. */
function damageEnemy(enemy, damage, slowAmount, slowDuration) {
  enemy.hp -= damage;
  enemy.hitFlashTimer = 0.2;
  if (slowAmount > 0 && slowDuration > 0) {
    enemy.applySlow(slowAmount, slowDuration);
  }
}

function darkenHexColor(hex, amount) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const scale = Math.max(0, 1 - amount);
  const dr = Math.floor(r * scale);
  const dg = Math.floor(g * scale);
  const db = Math.floor(b * scale);
  return `rgb(${dr}, ${dg}, ${db})`;
}

// --- Small canvas drawing helpers for projectile styles ---
function drawSnowflakeProjectile(x, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  const r = 6;
  const dirs = [
    [1, 0],
    [0, 1],
    [0.707, 0.707],
    [0.707, -0.707]
  ];
  ctx.beginPath();
  for (const [dx, dy] of dirs) {
    ctx.moveTo(x - dx * r, y - dy * r);
    ctx.lineTo(x + dx * r, y + dy * r);
  }
  ctx.stroke();
}

function drawRocketProjectile(x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(-6, -2, 9, 4);
  ctx.beginPath();
  ctx.moveTo(3, -3);
  ctx.lineTo(8, 0);
  ctx.lineTo(3, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fca5a5";
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-10, -2);
  ctx.lineTo(-10, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Distance left for `enemy` to travel along its polyline to the path end (base).
 * Comparable across lanes (unlike raw pathIndex when paths have different lengths).
 */
function getEnemyRemainingPathDistance(enemy) {
  const pts = enemy.pathPoints;
  if (!pts || pts.length < 2) {
    return 0;
  }
  const i = enemy.pathIndex;
  if (i >= pts.length - 1) {
    return 0;
  }
  let d = Math.hypot(enemy.x - pts[i + 1].x, enemy.y - pts[i + 1].y);
  for (let j = i + 1; j < pts.length - 1; j += 1) {
    d += Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
  }
  return d;
}

function getEnemyForwardVector(enemy) {
  const nextPoint = enemy.pathPoints[enemy.pathIndex + 1];
  if (!nextPoint) {
    return { x: 1, y: 0 };
  }

  const dx = nextPoint.x - enemy.x;
  const dy = nextPoint.y - enemy.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) {
    return { x: 1, y: 0 };
  }

  return { x: dx / length, y: dy / length };
}

// --- Build / sell: gold checks, capacity, buildableGrid, one tower per tile ---
function placeTower(tileX, tileY) {
  const towerType = TOWER_TYPES[state.selectedTowerType];
  if (!towerType || state.gold < towerType.cost) {
    return;
  }
  if (isTowerTypeAtCapacity(towerType.id)) {
    return;
  }
  if (!inBounds(tileX, tileY) || !buildableGrid[tileY][tileX]) {
    return;
  }
  if (state.towers.some((tower) => tower.tileX === tileX && tower.tileY === tileY)) {
    return;
  }

  state.gold -= towerType.cost;
  state.towers.push(new Tower(tileX, tileY, towerType.id));
  trackEvent("tower_placed", {
    tower_type: towerType.id,
    wave: state.wave,
    gold_remaining: state.gold,
    map: selectedMap ? selectedMap.mapName : "unknown"
  });
}

function sellTower(tileX, tileY) {
  const towerIndex = state.towers.findIndex((tower) => tower.tileX === tileX && tower.tileY === tileY);
  if (towerIndex < 0) {
    return;
  }
  const tower = state.towers[towerIndex];
  const towerType = TOWER_TYPES[tower.typeId];
  if (towerType) {
    state.gold += towerType.cost;
  }
  trackEvent("tower_sold", {
    tower_type: tower.typeId,
    wave: state.wave,
    gold_after_sell: state.gold,
    map: selectedMap ? selectedMap.mapName : "unknown"
  });
  state.towers.splice(towerIndex, 1);
}

/** Clears wave entities only; keeps towers/gold/wave number (retry current wave). */
function restartCurrentLevel() {
  if (!state.gameStarted || !state.waveInProgress || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  state.enemies = [];
  state.projectiles = [];
  state.effects = [];
  state.goldPopups = [];
  state.waveInProgress = false;
  state.spawning = false;
  state.enemiesSpawnedThisWave = 0;
  state.enemiesToSpawnThisWave = 0;
  state.spawnTimer = 0;
  state.waveConfig = null;
  for (const tower of state.towers) {
    tower.cooldown = 0;
  }
}

function countTowersByType(typeId) {
  return state.towers.filter((tower) => tower.typeId === typeId).length;
}

function isTowerTypeAtCapacity(typeId) {
  const towerType = TOWER_TYPES[typeId];
  if (!towerType || !towerType.maxCount) {
    return false;
  }
  return countTowersByType(typeId) >= towerType.maxCount;
}

function inBounds(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

/**
 * One simulation step: spawning, entity updates, deaths / base damage, wave completion.
 * Early exit if game over or victory screen logic has frozen the match.
 */
function update(dt) {
  for (const p of state.goldPopups) {
    p.life -= dt;
    p.y -= GOLD_POPUP_RISE_PX_PER_SEC * dt;
  }
  state.goldPopups = state.goldPopups.filter((p) => p.life > 0);

  if (state.baseHp <= 0 || state.gameWon) {
    return;
  }

  if (state.spawning) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = state.waveConfig ? state.waveConfig.spawnInterval : 1;
      if (state.enemiesSpawnedThisWave >= state.enemiesToSpawnThisWave) {
        state.spawning = false;
      }
    }
  }

  for (const tower of state.towers) {
    tower.update(dt);
  }
  for (const enemy of state.enemies) {
    enemy.update(dt);
  }
  for (const projectile of state.projectiles) {
    projectile.update(dt);
  }
  for (const effect of state.effects) {
    effect.update(dt);
  }

  const aliveEnemies = [];
  for (const enemy of state.enemies) {
    if (enemy.reachedBase) {
      state.baseHp -= enemy.baseDamage;
      state.baseDamageFlashUntil = performance.now() + BASE_DAMAGE_FLASH_MS;
      state.enemiesReachedBaseThisWave += 1;
      if (state.baseHp <= 0) {
        state.gameWon = false;
        state.gameOverByBoss = Boolean(enemy.isBoss);
        if (!state.gameOverTracked) {
          state.gameOverTracked = true;
          trackEvent("game_over", {
            wave_reached: state.wave,
            map: selectedMap ? selectedMap.mapName : "unknown",
            towers_placed: state.towers.length
          });
        }
      }
      continue;
    }
    if (enemy.hp <= 0) {
      state.gold += KILL_GOLD;
      state.goldPopups.push({
        x: enemy.x,
        y: enemy.y - enemy.radius - 6,
        amount: KILL_GOLD,
        life: GOLD_POPUP_DURATION_SEC,
        maxLife: GOLD_POPUP_DURATION_SEC
      });
      continue;
    }
    aliveEnemies.push(enemy);
  }
  state.enemies = aliveEnemies;
  state.projectiles = state.projectiles.filter((projectile) => !projectile.done);
  state.effects = state.effects.filter((effect) => !effect.done);

  if (state.waveInProgress && !state.spawning && state.enemies.length === 0) {
    const completedWave = state.wave;
    state.waveInProgress = false;
    state.waveConfig = null;
    trackEvent("wave_complete", {
      wave: completedWave,
      map: selectedMap ? selectedMap.mapName : "unknown",
      base_hp: state.baseHp
    });

    if (completedWave >= FINAL_WAVE) {
      if (state.baseHp > 0) {
        state.gameWon = true;
        state.selectedTowerType = null;
        startWaveBtn.disabled = true;
        trackEvent("victory", {
          final_wave: completedWave,
          map: selectedMap ? selectedMap.mapName : "unknown",
          towers_placed: state.towers.length
        });
      }
      return;
    }

    state.wave += 1;
    startWaveBtn.disabled = false;
    const baseWaveBonus = WAVE_BASE_BONUS_START + (completedWave - 1) * WAVE_BASE_BONUS_STEP;
    const flawlessBonus = state.enemiesReachedBaseThisWave === 0 ? WAVE_FLAWLESS_BONUS : 0;
    const waveBonus = baseWaveBonus + flawlessBonus;
    state.gold += waveBonus;
  }
}

// --- World drawing (bottom-up paint order is assembled in draw()) ---
function grassShade(x, y) {
  const h = (x * 17 + y * 31) % 7;
  if (h === 0 || h === 1) {
    return GRASS_LIGHT;
  }
  if (h === 2 || h === 3) {
    return GRASS_DARK;
  }
  return GRASS_BASE;
}

function drawBuildableGrassTile(px, py, x, y) {
  ctx.fillStyle = grassShade(x, y);
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "rgba(0, 0, 0, 0.045)";
  if ((x + y) % 2 === 0) {
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }
  ctx.fillStyle = BUILD_TILE_PATTERN;
  ctx.fillRect(px + (x % 3) * 3, py + (y % 3) * 3, 2, 2);
  const inset = 6;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.strokeRect(px + inset, py + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);
  ctx.setLineDash([]);
}

/** Background layer + per-tile stone path vs grass (snake map can use a PNG underlay). */
function drawGrid() {
  const isSnake = selectedMap && selectedMap.mapName === "snake";
  if (isSnake && snakeMapBgLoaded && snakeMapBg.complete) {
    ctx.drawImage(snakeMapBg, 0, 0, canvas.width, canvas.height);
  } else {
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, "#5f9448");
    grad.addColorStop(0.45, "#528a3e");
    grad.addColorStop(1, "#447030");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      if (pathGrid[y][x] === 1) {
        drawSnakeStonePathTile(px, py, x, y);
        drawSnakePathGrassDividers(px, py, x, y);
      } else {
        ctx.save();
        if (isSnake && snakeMapBgLoaded && snakeMapBg.complete) {
          ctx.globalAlpha = 0.82;
        }
        drawSnakeGrassTile(px, py, x, y);
        ctx.restore();
      }

      ctx.strokeStyle =
        pathGrid[y][x] === 1 ? "rgba(55, 52, 46, 0.35)" : "rgba(18, 62, 18, 0.42)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }
}

/** Direction hints along each lane (skips awkward segments on fork maps). */
function drawPathArrows() {
  const sharedPrefixLength = getSharedPrefixLength(mapPathOptions);

  mapPathOptions.forEach((path, pathIndex) => {
    const pal = LANE_PALETTES[pathIndex % LANE_PALETTES.length];
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (path.length < 2) {
      return;
    }
    const hasFork = mapPathOptions.length > 1 && sharedPrefixLength > 0;
    const baseSegIndex = hasFork ? Math.max(0, sharedPrefixLength) : Math.floor((path.length - 2) * 0.58);
    const segIndex = Math.min(path.length - 2, baseSegIndex + (hasFork ? 1 : 0));
    const from = path[segIndex];
    const to = path[segIndex + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const segLength = Math.hypot(dx, dy);
    if (segLength < 0.001) {
      return;
    }
    const ux = dx / segLength;
    const uy = dy / segLength;

    const anchor = {
      x: from.x + ux * (TILE_SIZE * 0.72),
      y: from.y + uy * (TILE_SIZE * 0.72)
    };
    const shaftLength = TILE_SIZE * 1.05;
    const headLength = TILE_SIZE * 0.38;
    const startX = anchor.x - ux * shaftLength;
    const startY = anchor.y - uy * shaftLength;

    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.stroke();

    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 3.5;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.stroke();

    const px = -uy;
    const py = ux;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(anchor.x - ux * headLength + px * headLength * 0.65, anchor.y - uy * headLength + py * headLength * 0.65);
    ctx.lineTo(anchor.x - ux * headLength - px * headLength * 0.65, anchor.y - uy * headLength - py * headLength * 0.65);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.deep;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(anchor.x - ux * headLength + px * headLength * 0.65, anchor.y - uy * headLength + py * headLength * 0.65);
    ctx.lineTo(anchor.x - ux * headLength - px * headLength * 0.65, anchor.y - uy * headLength - py * headLength * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/** How many waypoint indices all paths share (fork maps: shared trunk). Used by arrows. */
function getSharedPrefixLength(paths) {
  if (!paths.length) {
    return 0;
  }
  let index = 0;
  const shortestLen = Math.min(...paths.map((path) => path.length));
  while (index < shortestLen) {
    const ref = paths[0][index];
    const allMatch = paths.every((path) => path[index].x === ref.x && path[index].y === ref.y);
    if (!allMatch) {
      break;
    }
    index += 1;
  }
  return index;
}

/** Small markers at path starts (from spawnMarkers). */
function drawSpawnIndicators() {
  const t = performance.now() / 1000;
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.8);
  for (const marker of spawnMarkers) {
    const { x, y, angle } = marker;
    ctx.strokeStyle = `rgba(245, 158, 11, ${0.65 + 0.2 * pulse})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(245, 158, 11, ${0.14 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 9px Arial";
    ctx.textAlign = "center";
    const labelY = y < 28 ? y + 32 : y - 23;
    ctx.textBaseline = y < 28 ? "top" : "bottom";
    ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
    ctx.fillText("SPAWN", x + 0.5, labelY + (y < 28 ? 0.5 : -0.5));
    ctx.fillStyle = "rgba(254, 243, 199, 0.98)";
    ctx.fillText("SPAWN", x, labelY);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(4, -5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Base graphic at endPoint (enemies “reach base” when path ends). */
function drawBase() {
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(endPoint.x - 18, endPoint.y - 18, 36, 36);
}

/** Tint when hovering a valid build cell with a tower selected. */
function drawBuildHighlight() {
  const selectedType = TOWER_TYPES[state.selectedTowerType];
  if (!selectedType || !state.hoveredTile) {
    return;
  }
  const { x, y } = state.hoveredTile;
  if (!inBounds(x, y)) {
    return;
  }

  const buildable = buildableGrid[y][x] && !state.towers.some((tower) => tower.tileX === x && tower.tileY === y);
  const hasGold = state.gold >= selectedType.cost;
  ctx.fillStyle = buildable && hasGold ? "rgba(59, 130, 246, 0.35)" : "rgba(220, 38, 38, 0.35)";
  ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

  const centerX = x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = y * TILE_SIZE + TILE_SIZE / 2;
  ctx.strokeStyle = buildable && hasGold ? "rgba(147, 197, 253, 0.75)" : "rgba(248, 113, 113, 0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, selectedType.range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = buildable && hasGold ? "rgba(147, 197, 253, 0.08)" : "rgba(248, 113, 113, 0.08)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, selectedType.range, 0, Math.PI * 2);
  ctx.fill();
}

/** Range ring for the tower under the cursor (read-only feedback). */
function drawHoveredTowerRange() {
  if (!state.hoveredTile) {
    return;
  }
  const hoveredTower = state.towers.find((tower) => tower.tileX === state.hoveredTile.x && tower.tileY === state.hoveredTile.y);
  if (!hoveredTower) {
    return;
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hoveredTower.x, hoveredTower.y, hoveredTower.range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.beginPath();
  ctx.arc(hoveredTower.x, hoveredTower.y, hoveredTower.range, 0, Math.PI * 2);
  ctx.fill();
}

/** Floating +Ng labels when an enemy is killed (styled like sell refund text). */
function drawGoldPopups() {
  if (!state.goldPopups.length) {
    return;
  }
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of state.goldPopups) {
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    const label = `+${p.amount}g`;
    ctx.strokeStyle = `rgba(15, 23, 42, ${0.75 * alpha})`;
    ctx.fillStyle = `rgba(250, 204, 21, ${0.98 * alpha})`;
    ctx.lineWidth = 3;
    ctx.strokeText(label, p.x, p.y);
    ctx.fillText(label, p.x, p.y);
  }
}

/** Sell mode: follow mouse and show refund preview on towers. */
function drawSellCursorIndicator() {
  if (!state.sellMode || !state.mouseCanvasPos) {
    return;
  }
  const { x, y } = state.mouseCanvasPos;
  ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", x + 12, y - 12);
  if (state.hoveredTile) {
    const hoveredTower = state.towers.find(
      (tower) => tower.tileX === state.hoveredTile.x && tower.tileY === state.hoveredTile.y
    );
    if (hoveredTower) {
      const towerType = TOWER_TYPES[hoveredTower.typeId];
      const refund = towerType ? towerType.cost : 0;
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(250, 204, 21, 0.98)";
      ctx.strokeStyle = "rgba(15, 23, 42, 0.75)";
      ctx.lineWidth = 3;
      const label = `+${refund}g sell`;
      ctx.strokeText(label, x + 18, y - 32);
      ctx.fillText(label, x + 18, y - 32);
    }
  }
}

/** Brief full-screen red tint when base HP is lost (enemy reached base). */
function drawBaseDamageFlash() {
  if (!state.gameStarted || state.gameWon) {
    return;
  }
  const now = performance.now();
  if (now >= state.baseDamageFlashUntil) {
    return;
  }
  const remaining = state.baseDamageFlashUntil - now;
  const t = remaining / BASE_DAMAGE_FLASH_MS;
  const alpha = BASE_DAMAGE_FLASH_MAX_ALPHA * t * t;
  ctx.fillStyle = `rgba(200, 35, 40, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** Full-canvas overlay when baseHp hits 0 (loss). */
function drawGameOver() {
  if (state.baseHp > 0 || state.gameWon) {
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 48);
  ctx.font = "24px Arial";
  ctx.fillText(`You reached wave ${state.wave}`, canvas.width / 2, canvas.height / 2 - 6);
  ctx.font = "18px Arial";
  const defeatLine = state.gameOverByBoss ? DEFEAT_LINE_BOSS : DEFEAT_LINE_REGULAR;
  ctx.fillText(defeatLine, canvas.width / 2, canvas.height / 2 + 28);
}

/** Shown after surviving the final wave with base HP left. */
function drawVictoryScreen() {
  if (!state.gameWon || state.baseHp <= 0) {
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 46px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Victory!", canvas.width / 2, canvas.height / 2 - 32);
  ctx.font = "24px Arial";
  ctx.fillText("Zortac has been defeated. You have stopped the Geometric Menace for now...", canvas.width / 2, canvas.height / 2 + 12);
  ctx.font = "20px Arial";
  ctx.fillText("Press Restart Game to play again.", canvas.width / 2, canvas.height / 2 + 48);
}

/** Boss enemies layer this on top of their shape in Enemy.draw(). */
function drawBossFace(targetCtx, x, y, radius) {
  targetCtx.fillStyle = "#111";
  targetCtx.beginPath();
  targetCtx.arc(x - radius * 0.34, y - radius * 0.22, radius * 0.12, 0, Math.PI * 2);
  targetCtx.arc(x + radius * 0.34, y - radius * 0.22, radius * 0.12, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.strokeStyle = "#111";
  targetCtx.lineWidth = 2.5;
  targetCtx.beginPath();
  targetCtx.moveTo(x - radius * 0.52, y + radius * 0.34);
  targetCtx.quadraticCurveTo(x, y + radius * 0.1, x + radius * 0.52, y + radius * 0.34);
  targetCtx.stroke();
}

/** Full frame: world → entities → FX → modal overlays. Order matters for z-index. */
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawPathArrows();
  drawSpawnIndicators();
  drawBase();
  drawSnakeMapLabels();
  drawBuildHighlight();
  drawHoveredTowerRange();
  for (const tower of state.towers) {
    tower.draw();
  }
  for (const enemy of state.enemies) {
    enemy.draw();
  }
  for (const projectile of state.projectiles) {
    projectile.draw();
  }
  for (const effect of state.effects) {
    effect.draw();
  }
  drawGoldPopups();
  drawSellCursorIndicator();
  drawGameOver();
  drawVictoryScreen();
  drawBaseDamageFlash();
}

/** Syncs state.* to the HTML HUD and enables/disables buttons each frame. */
function updateHud() {
  waveEl.textContent = String(state.wave);
  goldEl.textContent = String(state.gold);
  baseHpEl.textContent = String(Math.max(0, state.baseHp));
  if (state.gameWon) {
    remainingEl.textContent = "0";
  } else {
    remainingEl.textContent = String(state.enemies.length + (state.enemiesToSpawnThisWave - state.enemiesSpawnedThisWave));
  }
  startWaveBtn.disabled =
    !state.gameStarted || state.baseHp <= 0 || state.waveInProgress || state.gameWon || state.wave > FINAL_WAVE;
  if (rerollMapBtn) {
    rerollMapBtn.disabled = !state.gameStarted || state.waveInProgress;
  }
  restartLevelBtn.disabled =
    !state.gameStarted ||
    state.baseHp <= 0 ||
    state.gameWon ||
    !state.waveInProgress ||
    state.wave > FINAL_WAVE;
  restartBtn.classList.toggle("hidden", !(state.baseHp <= 0 || state.gameWon));
  fastForwardBtn.disabled = !state.gameStarted || state.baseHp <= 0 || state.gameWon;
  fastForwardBtn.classList.toggle("speed-btn-active", state.speedMultiplier > 1);
  fastForwardBtn.textContent = `Game speed: ×${state.speedMultiplier}`;
  if (returnToMenuBtn) {
    returnToMenuBtn.disabled = !state.gameStarted;
  }
  sellModeBtn.disabled = !state.gameStarted || state.baseHp <= 0 || state.gameWon;
  sellModeBtn.classList.toggle("sell-mode-active", state.sellMode);
  sellModeBtn.textContent = state.sellMode ? "Sell Turret (On)" : "Sell Turret";

  for (const button of towerButtons) {
    const typeId = button.dataset.towerType;
    const type = TOWER_TYPES[typeId];
    const isActive = state.selectedTowerType === typeId;
    button.classList.toggle("active", isActive);
    const atCap = type ? isTowerTypeAtCapacity(typeId) : false;
    const unaffordable = Boolean(type) && state.gold < type.cost;
    button.classList.toggle("unaffordable", state.gameStarted && unaffordable && !atCap);
    button.disabled = !state.gameStarted || state.baseHp <= 0 || state.gameWon || !type || atCap || unaffordable;
    if (atCap && isActive) {
      state.selectedTowerType = null;
    }
    if (type) {
      const countLabel = type.maxCount ? ` ${countTowersByType(typeId)}/${type.maxCount}` : "";
      button.textContent = `${type.name} (${type.cost}g)${countLabel}`;
    }
  }
  updateNextWavePanel();
}

let previous = performance.now();

/** requestAnimationFrame driver: caps dt, applies speed multiplier, update → draw → HUD. */
function gameLoop(now) {
  if (!state.gameStarted) {
    updateHud();
    requestAnimationFrame(gameLoop);
    return;
  }
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;
  const scaledDt = dt * state.speedMultiplier;

  update(scaledDt);
  draw();
  updateHud();

  requestAnimationFrame(gameLoop);
}

// --- Canvas input: tile pick uses same scaling as CSS-sized canvas ---
canvas.addEventListener("mousemove", (event) => {
  if (!state.gameStarted) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) / (rect.width / canvas.width);
  const canvasY = (event.clientY - rect.top) / (rect.height / canvas.height);
  state.mouseCanvasPos = { x: canvasX, y: canvasY };
  const x = Math.floor(canvasX / TILE_SIZE);
  const y = Math.floor(canvasY / TILE_SIZE);
  state.hoveredTile = { x, y };
});

canvas.addEventListener("mouseleave", () => {
  state.hoveredTile = null;
  state.mouseCanvasPos = null;
});

canvas.addEventListener("click", (event) => {
  if (!state.gameStarted || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const tileX = Math.floor((event.clientX - rect.left) / (rect.width / canvas.width) / TILE_SIZE);
  const tileY = Math.floor((event.clientY - rect.top) / (rect.height / canvas.height) / TILE_SIZE);
  if (state.sellMode) {
    sellTower(tileX, tileY);
    return;
  }
  if (!state.selectedTowerType) {
    return;
  }
  placeTower(tileX, tileY);
});

// --- Tower menu: click toggles selected type; capacity/affordability enforced in updateHud ---
towerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.gameStarted || state.baseHp <= 0 || state.gameWon) {
      return;
    }
    const typeId = button.dataset.towerType;
    if (!typeId || isTowerTypeAtCapacity(typeId)) {
      return;
    }
    state.sellMode = false;
    state.selectedTowerType = state.selectedTowerType === typeId ? null : typeId;
  });
});

// --- HUD buttons & global hotkeys ---
startWaveBtn.addEventListener("click", startWave);
if (rerollMapBtn) {
  rerollMapBtn.addEventListener("click", () => {
    if (state.waveInProgress) {
      return;
    }
    window.location.reload();
  });
}
restartLevelBtn.addEventListener("click", () => {
  restartCurrentLevel();
});
fastForwardBtn.addEventListener("click", () => {
  if (!state.gameStarted || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  state.speedMultiplier = state.speedMultiplier === 1 ? 2 : state.speedMultiplier === 2 ? 4 : 1;
});
if (returnToMenuBtn) {
  returnToMenuBtn.addEventListener("click", () => {
    if (!state.gameStarted) {
      return;
    }
    openStartScreen();
  });
}
sellModeBtn.addEventListener("click", () => {
  toggleSellMode();
});
restartBtn.addEventListener("click", () => {
  openStartScreen();
});

function toggleSellMode() {
  if (!state.gameStarted || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  state.sellMode = !state.sellMode;
  if (state.sellMode) {
    state.selectedTowerType = null;
  }
}

function selectTowerByMenuIndex(index) {
  if (!state.gameStarted || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  const typeId = TOWER_MENU_ORDER[index];
  if (!typeId || !TOWER_TYPES[typeId]) {
    return;
  }
  if (isTowerTypeAtCapacity(typeId)) {
    return;
  }
  state.sellMode = false;
  state.selectedTowerType = state.selectedTowerType === typeId ? null : typeId;
}

window.addEventListener("keydown", (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return;
  }
  if (!state.gameStarted || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  if (event.code === "KeyF") {
    event.preventDefault();
    if (holdFSell) {
      if (event.repeat) {
        return;
      }
      state.sellMode = true;
      state.selectedTowerType = null;
    } else {
      toggleSellMode();
    }
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    startWave();
    return;
  }
  const key = event.key;
  if (key >= "1" && key <= "5") {
    event.preventDefault();
    selectTowerByMenuIndex(Number.parseInt(key, 10) - 1);
  }
});

window.addEventListener("keyup", (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return;
  }
  if (!holdFSell || event.code !== "KeyF") {
    return;
  }
  if (!state.gameStarted || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  state.sellMode = false;
});

let selectedMapIdForStart = null;
let menuMusicUnlockBound = false;
let loreTypingTimer = null;

// --- Intro flow: typed lore overlay → map/difficulty overlay → Begin starts match ---
const LORE_PARAGRAPHS = [
  "Incoming Transmission...",
  "Welcome Commander,",
  "If you are reading this message it means you've passed the Geometric Defensive Tactics and Combat training course, or what you called Geometry 101.",
  "That's right, that wasn't just any class it was a training…and you've been called up. We need all the tower commanders we can get our hands on to defend Earth against the GeoScourge.",
  "We are not yet sure where they come from or what they want, but one thing we know is that they WILL be DESTROYED.",
  "I have given you full command of our defensive towers and logistics, now defend what is OURS…"
];

function getLoreFullText() {
  const n = LORE_PARAGRAPHS.length;
  if (n === 0) {
    return "";
  }
  let s = LORE_PARAGRAPHS[0];
  for (let i = 1; i < n; i += 1) {
    s += (i === 1 ? "\n" : "\n\n") + LORE_PARAGRAPHS[i];
  }
  return s;
}

function stopMenuMusic() {
  if (!menuMusicEl) {
    return;
  }
  menuMusicEl.pause();
  menuMusicEl.currentTime = 0;
}

function clearLoreTyping() {
  if (loreTypingTimer !== null) {
    clearInterval(loreTypingTimer);
    loreTypingTimer = null;
  }
}

function startLoreTyping() {
  clearLoreTyping();
  if (!loreTransmissionEl) {
    return;
  }
  const words = [];
  LORE_PARAGRAPHS.forEach((p, i) => {
    words.push(...p.split(/\s+/).filter(Boolean));
    if (i < LORE_PARAGRAPHS.length - 1) {
      words.push(i === 0 ? "\n" : "\n\n");
    }
  });
  let i = 0;
  let buffer = "";
  loreTypingTimer = setInterval(() => {
    if (i >= words.length) {
      clearLoreTyping();
      return;
    }
    const w = words[i];
    i += 1;
    if (w === "\n" || w === "\n\n") {
      buffer += w;
    } else {
      const endsBreak = buffer.endsWith("\n") || buffer.endsWith("\n\n");
      buffer += (buffer && !endsBreak ? " " : "") + w;
    }
    loreTransmissionEl.textContent = buffer;
  }, 28);
}

function dismissLoreScreen() {
  clearLoreTyping();
  if (loreTransmissionEl) {
    loreTransmissionEl.textContent = getLoreFullText();
  }
  if (loreOverlayEl) {
    loreOverlayEl.classList.add("hidden");
  }
  if (startOverlayEl) {
    startOverlayEl.classList.remove("hidden");
  }
  applyAudioVolumes();
  playMenuMusic();
  bindMenuMusicUnlock();
}

function onLoreContinue(event) {
  if (!loreOverlayEl || loreOverlayEl.classList.contains("hidden")) {
    return;
  }
  event.preventDefault();
  document.removeEventListener("keydown", onLoreContinue);
  document.removeEventListener("pointerdown", onLoreContinue);
  dismissLoreScreen();
}

function startLoreScreen() {
  stopMenuMusic();
  if (!loreOverlayEl || !loreTransmissionEl) {
    if (startOverlayEl) {
      startOverlayEl.classList.remove("hidden");
    }
    applyAudioVolumes();
    playMenuMusic();
    bindMenuMusicUnlock();
    return;
  }
  loreOverlayEl.classList.remove("hidden");
  loreTransmissionEl.textContent = "";
  startLoreTyping();
  document.addEventListener("keydown", onLoreContinue);
  document.addEventListener("pointerdown", onLoreContinue);
}

function playMenuMusic() {
  if (!menuMusicEl) {
    return;
  }
  const playAttempt = menuMusicEl.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {
      // Autoplay can be blocked until user gesture; we retry after interaction.
    });
  }
}

function bindMenuMusicUnlock() {
  if (!menuMusicEl || menuMusicUnlockBound) {
    return;
  }
  menuMusicUnlockBound = true;
  const unlock = () => {
    if (!state.gameStarted) {
      playMenuMusic();
    }
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);
}

/** Bottom-right mute, panel toggle, and range inputs → audioSettings + applyAudioVolumes. */
function setupAudioControls() {
  refreshAudioHudUi();
  if (muteToggleBtn) {
    muteToggleBtn.addEventListener("click", () => {
      audioSettings.muted = !audioSettings.muted;
      applyAudioVolumes();
      refreshAudioHudUi();
    });
  }
  if (audioSettingsBtn && audioSettingsPanel) {
    audioSettingsBtn.addEventListener("click", () => {
      const opening = audioSettingsPanel.classList.contains("hidden");
      audioSettingsPanel.classList.toggle("hidden");
      if (opening && holdFSellCheckbox) {
        holdFSellCheckbox.checked = holdFSell;
      }
    });
  }
  if (holdFSellCheckbox) {
    holdFSellCheckbox.checked = holdFSell;
    holdFSellCheckbox.addEventListener("change", () => {
      holdFSell = holdFSellCheckbox.checked;
      saveHoldFSell(holdFSell);
    });
  }
  if (sfxVolumeSlider) {
    sfxVolumeSlider.addEventListener("input", () => {
      const next = Number.parseInt(sfxVolumeSlider.value, 10);
      audioSettings.sfxLevel = clampAudioLevel(Number.isNaN(next) ? 5 : next);
      applyAudioVolumes();
      refreshAudioHudUi();
    });
  }
  if (musicVolumeSlider) {
    musicVolumeSlider.addEventListener("input", () => {
      const next = Number.parseInt(musicVolumeSlider.value, 10);
      audioSettings.musicLevel = clampAudioLevel(Number.isNaN(next) ? 5 : next);
      applyAudioVolumes();
      refreshAudioHudUi();
    });
  }
}

/** Default numbers for a fresh run (called from Begin and Return to menu paths). */
function resetGameState() {
  state.wave = 1;
  state.gold = 250;
  state.baseHp = 20;
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.effects = [];
  state.goldPopups = [];
  state.waveInProgress = false;
  state.spawning = false;
  state.hoveredTile = null;
  state.selectedTowerType = null;
  state.sellMode = false;
  state.mouseCanvasPos = null;
  state.enemiesSpawnedThisWave = 0;
  state.enemiesToSpawnThisWave = 0;
  state.enemiesReachedBaseThisWave = 0;
  state.spawnTimer = 0;
  state.waveConfig = null;
  state.gameWon = false;
  state.gameOverTracked = false;
  state.gameOverByBoss = false;
  state.speedMultiplier = 1;
  state.difficultyHpMultiplier = 1;
  state.difficulty = "normal";
  state.baseDamageFlashUntil = 0;
}

/** Offscreen minimap for each map card on the start screen. */
function renderMapThumbnail(ctx2, mapName, w, h) {
  const layout = buildMapLayout(mapName);
  const pg = createPathGrid(layout.pathTiles);
  const cw = w / COLS;
  const ch = h / ROWS;
  ctx2.fillStyle = "#4a7a3a";
  ctx2.fillRect(0, 0, w, h);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      ctx2.fillStyle = pg[y][x] ? "#d4a574" : "#5a8f46";
      ctx2.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
    }
  }
  ctx2.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx2.strokeRect(0.5, 0.5, w - 1, h - 1);
}

function refreshBeginButtonState() {
  if (beginGameBtn) {
    beginGameBtn.disabled = !selectedMapIdForStart;
  }
}

function ensureDefaultMapSelection() {
  if (MAP_CATALOG.length !== 1 || !mapCardsEl) {
    return;
  }
  selectedMapIdForStart = MAP_CATALOG[0].id;
  const only = mapCardsEl.querySelector(".map-card");
  if (only) {
    only.classList.add("selected");
  }
  refreshBeginButtonState();
}

function buildMapCards() {
  if (!mapCardsEl) {
    return;
  }
  mapCardsEl.innerHTML = "";
  for (const map of MAP_CATALOG) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "map-card";
    const thumb = document.createElement("canvas");
    thumb.width = 140;
    thumb.height = 80;
    thumb.className = "map-thumb";
    renderMapThumbnail(thumb.getContext("2d"), map.id, 140, 80);
    const title = document.createElement("span");
    title.className = "map-card-title";
    title.textContent = map.name;
    const sub = document.createElement("span");
    sub.className = "map-card-blurb";
    sub.textContent = map.blurb;
    card.appendChild(thumb);
    card.appendChild(title);
    card.appendChild(sub);
    card.addEventListener("click", () => {
      selectedMapIdForStart = map.id;
      mapCardsEl.querySelectorAll(".map-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      refreshBeginButtonState();
    });
    mapCardsEl.appendChild(card);
  }
  ensureDefaultMapSelection();
}

/** Menu mode: hide game, reset selection, preview map layout as fork until user picks. */
function openStartScreen() {
  state.gameStarted = false;
  selectedMapIdForStart = null;
  if (mapCardsEl) {
    mapCardsEl.querySelectorAll(".map-card").forEach((c) => c.classList.remove("selected"));
  }
  resetGameState();
  applyMapLayout("fork");
  ensureDefaultMapSelection();
  if (loreOverlayEl) {
    loreOverlayEl.classList.add("hidden");
  }
  clearLoreTyping();
  if (loreTransmissionEl) {
    loreTransmissionEl.textContent = "";
  }
  document.removeEventListener("keydown", onLoreContinue);
  document.removeEventListener("pointerdown", onLoreContinue);
  if (startOverlayEl) {
    startOverlayEl.classList.remove("hidden");
  }
  playMenuMusic();
}

/** Hover tooltips: text comes from each tower’s `description` in TOWER_TYPES. */
function setupTowerTooltips() {
  if (!towerTooltipEl) {
    return;
  }
  towerButtons.forEach((btn) => {
    const typeId = btn.dataset.towerType;
    const t = TOWER_TYPES[typeId];
    if (!t || !t.description) {
      return;
    }
    btn.addEventListener("mouseenter", () => {
      towerTooltipEl.textContent = t.description;
      towerTooltipEl.classList.remove("hidden");
    });
    btn.addEventListener("mousemove", (e) => {
      towerTooltipEl.style.left = `${e.clientX + 14}px`;
      towerTooltipEl.style.top = `${e.clientY + 14}px`;
    });
    btn.addEventListener("mouseleave", () => {
      towerTooltipEl.classList.add("hidden");
    });
  });
}

function getSelectedDifficulty() {
  const el = document.querySelector('input[name="difficulty"]:checked');
  if (!el) {
    return "normal";
  }
  if (el.value === "easy") {
    return "easy";
  }
  if (el.value === "hard") {
    return "hard";
  }
  return "normal";
}

// --- Begin: applies chosen map, difficulty HP multiplier, closes overlay, sets gameStarted ---
if (beginGameBtn) {
  beginGameBtn.addEventListener("click", () => {
    if (!selectedMapIdForStart) {
      return;
    }
    applyMapLayout(selectedMapIdForStart);
    resetGameState();
    const difficulty = getSelectedDifficulty();
    state.difficulty = difficulty;
    state.difficultyHpMultiplier =
      difficulty === "easy" ? 0.75 : difficulty === "hard" ? 1.15 : 1;
    state.gameStarted = true;
    trackEvent("game_start", {
      map: selectedMap ? selectedMap.mapName : selectedMapIdForStart,
      difficulty
    });
    if (startOverlayEl) {
      startOverlayEl.classList.add("hidden");
    }
  });
}

// --- First paint: default map layout for thumbnails/menu; lore plays before real run ---
applyMapLayout("fork");
resetGameState();
state.gameStarted = false;
buildMapCards();
setupTowerTooltips();
setupAudioControls();
applyAudioVolumes();
startLoreScreen();

requestAnimationFrame(gameLoop);
