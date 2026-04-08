const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const waveEl = document.getElementById("wave");
const goldEl = document.getElementById("gold");
const baseHpEl = document.getElementById("baseHp");
const remainingEl = document.getElementById("remaining");
const turretCountsEl = document.getElementById("turretCounts");

const towerButtons = [...document.querySelectorAll(".tower-btn")];
const startWaveBtn = document.getElementById("startWaveBtn");
const rerollMapBtn = document.getElementById("rerollMapBtn");
const startOverlayEl = document.getElementById("startOverlay");
const beginGameBtn = document.getElementById("beginGameBtn");
const mapCardsEl = document.getElementById("mapCards");
const towerTooltipEl = document.getElementById("towerTooltip");
const restartLevelBtn = document.getElementById("restartLevelBtn");
const sellModeBtn = document.getElementById("sellModeBtn");
const fastForwardBtn = document.getElementById("fastForwardBtn");
const returnToMenuBtn = document.getElementById("returnToMenuBtn");
const restartBtn = document.getElementById("restartBtn");
const menuMusicEl = document.getElementById("menuMusic");
const railShotSfx = new Audio("assets/rail-shot.mp3");
const basicTurretShotSfx = new Audio("assets/basic_turret.mp3");
const rocketTurretShotSfx = new Audio("assets/rocket_tower.mp3");
const iceTurretShotSfx = new Audio("assets/ice_turret.mp3");
const frostAuraSfx = new Audio("assets/frost_aura.mp3");

const TILE_SIZE = 52;
const COLS = Math.floor(canvas.width / TILE_SIZE);
const ROWS = Math.floor(canvas.height / TILE_SIZE);
const GRASS_BASE = "#5a8f46";
const GRASS_DARK = "#4a7a3a";
const GRASS_LIGHT = "#6fb050";
const BUILD_TILE_STROKE = "rgba(25, 70, 25, 0.38)";
const BUILD_TILE_PATTERN = "rgba(255, 255, 255, 0.06)";
const FINAL_WAVE = 10;
const KILL_GOLD = 10;
const TOWER_MENU_ORDER = ["basic", "ice", "frost", "rocket", "rail"];
const TOWER_TYPES = {
  basic: {
    id: "basic",
    name: "Basic Turret",
    description:
      "Reliable single-target damage; shoots the enemy farthest along the path.\nStats:\nCost: 100g,\nRange: 145,\nDamage: 15,\nShot Interval: 1s,\nProjectile speed 340,\nTarget Prio: Lead enemy.\nMax 6 towers.",
    cost: 100,
    range: 145,
    damage: 15,
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
      "Continuous aura: Enemies inside the ring are slowed by 25%. Ice Turret snowflakes that hit an enemy inside any Frost Aura apply 35% slow instead of 25%.\nStats:\nCost: 150g,\nRange: 145,\nAura slow: 25% (always on in range),\nSynergy: Ice hits in aura → 35% slow,\nNo shots — aura only.\nMax 3 towers.",
    cost: 150,
    range: 145,
    color: "#0891b2",
    barrelColor: "#67e8f9",
    aura: true,
    slowAmount: 0.25,
    slowDuration: 0.22,
    maxCount: 3
  },
  ice: {
    id: "ice",
    name: "Ice Turret",
    description:
      "Snowflake shots; skips enemies recently hit by Ice (spreads chill). In a Frost Aura, hits apply 35% slow instead of 25%.\nStats:\nCost: 150g,\nRange: 130,\nDamage: 10,\nShot Interval: 2s,\nProjectile speed 320,\nOn hit: 25% slow for 1s (35% in Frost Aura),\nTarget Prio: Lead enemy without recent Ice hit.\nMax 4 towers.",
    cost: 150,
    range: 130,
    damage: 10,
    fireRate: 2,
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
    damage: 25,
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
      "Piercing beam through every enemy along a line; aims for the direction that hits the most targets.\nStats:\nCost: 400g,\nRange: 350,\nDamage: 45 per hit,\nShot Interval: 4s,\nBeam speed: 1000,\nBonus vs boss: 1.5×,\nBonus vs square enemies: 1.5×,\nTarget Prio: Most enemies on line.\nMax 2 towers.",
    cost: 400,
    range: 350,
    damage: 45,
    fireRate: 4,
    color: "#475569",
    barrelColor: "#fbbf24",
    targetMode: "progress",
    railSpeed: 1000,
    maxCount: 2
  }
};

const MAP_CATALOG = [
  {
    id: "fork",
    name: "Fork Map",
    blurb: "Two lanes merge before the base."
  },
  {
    id: "trident",
    name: "Trident",
    blurb: "Three top spawns funnel into one lane to the base."
  },
  {
    id: "snake",
    name: "Snake",
    blurb: "S-shaped path from top to bottom."
  }
];

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
  spawnTimer: 0,
  waveConfig: null,
  gameWon: false,
  speedMultiplier: 1,
  difficultyHpMultiplier: 1,
  gameStarted: false
};

railShotSfx.preload = "auto";
railShotSfx.volume = 0.45;
basicTurretShotSfx.preload = "auto";
basicTurretShotSfx.volume = 0.3;
rocketTurretShotSfx.preload = "auto";
rocketTurretShotSfx.volume = 0.36;
iceTurretShotSfx.preload = "auto";
iceTurretShotSfx.volume = 0.32;
frostAuraSfx.preload = "auto";
frostAuraSfx.volume = 0.24;

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

let selectedMap;
let pathGrid;
let pathLaneGrid;
let mapPathOptions;
let endPoint;
let buildableGrid;
let spawnMarkers;

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

function applyMapLayout(mapName) {
  selectedMap = buildMapLayout(mapName);
  pathGrid = createPathGrid(selectedMap.pathTiles);
  pathLaneGrid = createPathLaneGrid(selectedMap.paths);
  mapPathOptions = selectedMap.paths.map((pathTiles) => toPixelPath(pathTiles));
  endPoint = toPixelPoint(selectedMap.endTile);
  buildableGrid = createBuildableGrid(pathGrid);
  spawnMarkers = computeSpawnMarkers(mapPathOptions);
}

function pathForkMergePaths() {
  const top = [];
  for (let x = 0; x <= 8; x += 1) {
    top.push([x, 0]);
  }
  top.push([8, 1], [8, 2]);
  const bottom = [];
  for (let x = 0; x <= 8; x += 1) {
    bottom.push([x, ROWS - 1]);
  }
  for (let y = ROWS - 2; y >= 2; y -= 1) {
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

function pathTridentPaths() {
  const cx = 8;
  const yMerge = 4;
  const leftSp = 2;
  const rightSp = 14;
  const tail = [];
  for (let y = yMerge + 1; y <= ROWS - 1; y += 1) {
    tail.push([cx, y]);
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

function pathSnakeS() {
  const tiles = [];
  for (let y = 0; y < ROWS; y += 1) {
    if (y % 2 === 0) {
      for (let x = 0; x <= COLS - 1; x += 1) {
        tiles.push([x, y]);
      }
    } else {
      for (let x = COLS - 1; x >= 0; x -= 1) {
        tiles.push([x, y]);
      }
    }
  }
  return dedupeConsecutiveTiles(tiles);
}

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

function createPathGrid(pathTiles) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (const [x, y] of pathTiles) {
    if (inBounds(x, y)) {
      grid[y][x] = 1;
    }
  }
  return grid;
}

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

function toPixelPoint(tile) {
  return {
    x: tile[0] * TILE_SIZE + TILE_SIZE / 2,
    y: tile[1] * TILE_SIZE + TILE_SIZE / 2
  };
}

function toPixelPath(pathTiles) {
  return pathTiles.map((tile) => toPixelPoint(tile));
}

function createBuildableGrid(grid) {
  return grid.map((row) => row.map((cell) => cell === 0));
}

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
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(wobble);
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
      drawBossFace(0, 0, this.radius);
    }

    ctx.fillStyle = "#1f2937";
    ctx.fillRect(-16, -20, 32, 5);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(-16, -20, 32 * hpRatio, 5);
    ctx.restore();
  }
}

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
    this.cooldown = 0;
    this.aimAngle = -Math.PI / 2;
    this.auraSoundTimer = 0;
  }

  updateAuraAim() {
    let nearest = null;
    let bestD = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) {
        continue;
      }
      const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (d <= this.range && d < bestD) {
        bestD = d;
        nearest = enemy;
      }
    }
    if (nearest) {
      this.aimAngle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
    }
  }

  update(dt) {
    if (this.aura) {
      this.updateAuraAim();
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
    let bestMetric = -1;

    for (const enemy of state.enemies) {
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist > this.range) {
        continue;
      }
      if (this.typeId === "ice" && enemy.iceSlowTimer > 0) {
        continue;
      }
      const metric = this.targetMode === "highestHp" ? enemy.hp : enemy.pathIndex;
      if (metric > bestMetric) {
        best = enemy;
        bestMetric = metric;
      }
    }

    return best;
  }

  findRailTarget() {
    let best = null;
    let bestCount = -1;
    let bestTie = -1;

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
      const tie = enemy.pathIndex;
      if (cnt > bestCount || (cnt === bestCount && tie > bestTie)) {
        bestCount = cnt;
        bestTie = tie;
        best = enemy;
      }
    }

    return best;
  }

  draw() {
    if (this.aura) {
      const strong = this.typeId === "frost";
      ctx.strokeStyle = strong ? "rgba(103, 232, 249, 0.55)" : "rgba(103, 232, 249, 0.28)";
      ctx.lineWidth = strong ? 2.5 : 2;
      ctx.setLineDash(strong ? [6, 4] : []);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = strong ? "rgba(103, 232, 249, 0.1)" : "rgba(103, 232, 249, 0.07)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - 14, this.y - 14, 28, 28);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle + Math.PI / 2);
    ctx.fillStyle = this.barrelColor;
    if (this.typeId === "rail") {
      ctx.fillRect(-16, -20, 32, 5);
      ctx.fillRect(-3, -24, 6, 10);
    } else {
      ctx.fillRect(-4, -20, 8, 10);
    }
    ctx.restore();
  }
}

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

function startWave() {
  if (!state.gameStarted || state.waveInProgress || state.baseHp <= 0 || state.gameWon || state.wave > FINAL_WAVE) {
    return;
  }

  const config = getWaveConfig(state.wave);
  state.waveInProgress = true;
  state.spawning = true;
  state.enemiesSpawnedThisWave = 0;
  state.enemiesToSpawnThisWave = config.enemyCount;
  state.spawnTimer = 0;
  state.waveConfig = config;
  startWaveBtn.disabled = true;
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
      hp: 2700,
      speed: 54,
      spawnInterval: 1.2,
      baseDamage: 5,
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
  state.towers.splice(towerIndex, 1);
}

function restartCurrentLevel() {
  if (!state.gameStarted || !state.waveInProgress || state.baseHp <= 0 || state.gameWon) {
    return;
  }
  state.enemies = [];
  state.projectiles = [];
  state.effects = [];
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

function update(dt) {
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
      if (state.baseHp <= 0) {
        state.gameWon = false;
      }
      continue;
    }
    if (enemy.hp <= 0) {
      state.gold += KILL_GOLD;
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

    if (completedWave >= FINAL_WAVE) {
      if (state.baseHp > 0) {
        state.gameWon = true;
        state.selectedTowerType = null;
        startWaveBtn.disabled = true;
      }
      return;
    }

    state.wave += 1;
    startWaveBtn.disabled = false;
    const waveBonus = completedWave === 1 ? 40 : completedWave * 10;
    state.gold += waveBonus;
  }
}

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

function drawGrid() {
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#5f9448");
  grad.addColorStop(0.45, "#528a3e");
  grad.addColorStop(1, "#447030");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      if (pathGrid[y][x] === 1) {
        drawPathTile(px, py, x, y);
        drawPathGrassDividers(px, py, x, y);
      } else {
        drawBuildableGrassTile(px, py, x, y);
      }

      ctx.strokeStyle =
        pathGrid[y][x] === 1 ? "rgba(70, 42, 14, 0.4)" : BUILD_TILE_STROKE;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }
}

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

function drawBase() {
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(endPoint.x - 18, endPoint.y - 18, 36, 36);
}

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

function drawGameOver() {
  if (state.baseHp > 0 || state.gameWon) {
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 10);
  ctx.font = "24px Arial";
  ctx.fillText(`You reached wave ${state.wave}`, canvas.width / 2, canvas.height / 2 + 30);
}

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
  ctx.fillText("You have stopped the Geometric Menace for now...", canvas.width / 2, canvas.height / 2 + 12);
  ctx.font = "20px Arial";
  ctx.fillText("Press Restart Game to play again.", canvas.width / 2, canvas.height / 2 + 48);
}

function drawBossFace(x, y, radius) {
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x - radius * 0.34, y - radius * 0.22, radius * 0.12, 0, Math.PI * 2);
  ctx.arc(x + radius * 0.34, y - radius * 0.22, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.52, y + radius * 0.34);
  ctx.quadraticCurveTo(x, y + radius * 0.1, x + radius * 0.52, y + radius * 0.34);
  ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawPathArrows();
  drawSpawnIndicators();
  drawBase();
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
  drawSellCursorIndicator();
  drawGameOver();
  drawVictoryScreen();
}

function updateHud() {
  waveEl.textContent = String(state.wave);
  goldEl.textContent = String(state.gold);
  baseHpEl.textContent = String(Math.max(0, state.baseHp));
  if (state.gameWon) {
    remainingEl.textContent = "0";
  } else {
    remainingEl.textContent = String(state.enemies.length + (state.enemiesToSpawnThisWave - state.enemiesSpawnedThisWave));
  }
  const basicCount = countTowersByType("basic");
  const frostCount = countTowersByType("frost");
  const iceCount = countTowersByType("ice");
  const rocketCount = countTowersByType("rocket");
  const railCount = countTowersByType("rail");
  turretCountsEl.textContent = `Basic ${basicCount}/6, Ice ${iceCount}/4, Frost ${frostCount}/3, Rocket ${rocketCount}/2, Rail ${railCount}/2`;

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
    button.disabled = !state.gameStarted || state.baseHp <= 0 || state.gameWon || !type || atCap;
    if (atCap && isActive) {
      state.selectedTowerType = null;
    }
    if (type) {
      const countLabel = type.maxCount ? ` ${countTowersByType(typeId)}/${type.maxCount}` : "";
      button.textContent = `${type.name} (${type.cost}g)${countLabel}`;
    }
  }
}

let previous = performance.now();
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
    toggleSellMode();
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

let selectedMapIdForStart = null;
let menuMusicUnlockBound = false;

function playMenuMusic() {
  if (!menuMusicEl) {
    return;
  }
  menuMusicEl.volume = 0.5;
  const playAttempt = menuMusicEl.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {
      // Autoplay can be blocked until user gesture; we retry after interaction.
    });
  }
}

function stopMenuMusic() {
  if (!menuMusicEl) {
    return;
  }
  menuMusicEl.pause();
  menuMusicEl.currentTime = 0;
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

function resetGameState() {
  state.wave = 1;
  state.gold = 250;
  state.baseHp = 20;
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.effects = [];
  state.waveInProgress = false;
  state.spawning = false;
  state.hoveredTile = null;
  state.selectedTowerType = null;
  state.sellMode = false;
  state.mouseCanvasPos = null;
  state.enemiesSpawnedThisWave = 0;
  state.enemiesToSpawnThisWave = 0;
  state.spawnTimer = 0;
  state.waveConfig = null;
  state.gameWon = false;
  state.speedMultiplier = 1;
  state.difficultyHpMultiplier = 1;
}

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

function openStartScreen() {
  state.gameStarted = false;
  selectedMapIdForStart = null;
  if (mapCardsEl) {
    mapCardsEl.querySelectorAll(".map-card").forEach((c) => c.classList.remove("selected"));
  }
  resetGameState();
  applyMapLayout("fork");
  ensureDefaultMapSelection();
  if (startOverlayEl) {
    startOverlayEl.classList.remove("hidden");
  }
  playMenuMusic();
}

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
  return el && el.value === "easy" ? "easy" : "normal";
}

if (beginGameBtn) {
  beginGameBtn.addEventListener("click", () => {
    if (!selectedMapIdForStart) {
      return;
    }
    applyMapLayout(selectedMapIdForStart);
    resetGameState();
    state.difficultyHpMultiplier = getSelectedDifficulty() === "easy" ? 0.75 : 1;
    state.gameStarted = true;
    stopMenuMusic();
    if (startOverlayEl) {
      startOverlayEl.classList.add("hidden");
    }
  });
}

applyMapLayout("fork");
resetGameState();
state.gameStarted = false;
buildMapCards();
setupTowerTooltips();
bindMenuMusicUnlock();
playMenuMusic();

requestAnimationFrame(gameLoop);
