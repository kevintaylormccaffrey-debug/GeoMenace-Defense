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
const restartLevelBtn = document.getElementById("restartLevelBtn");
const sellModeBtn = document.getElementById("sellModeBtn");
const fastForwardBtn = document.getElementById("fastForwardBtn");
const restartBtn = document.getElementById("restartBtn");

const TILE_SIZE = 52;
const COLS = Math.floor(canvas.width / TILE_SIZE);
const ROWS = Math.floor(canvas.height / TILE_SIZE);
const PATH_COLOR = "#c8a56d";
const FINAL_WAVE = 10;
const KILL_GOLD = 10;
const TOWER_TYPES = {
  basic: {
    id: "basic",
    name: "Basic Turret",
    cost: 100,
    range: 145,
    damage: 15,
    fireRate: 1,
    color: "#2563eb",
    barrelColor: "#93c5fd",
    projectileColor: "#fde047",
    targetMode: "progress",
    projectileSpeed: 340
  },
  ice: {
    id: "ice",
    name: "Ice Turret",
    cost: 150,
    range: 130,
    color: "#0891b2",
    barrelColor: "#67e8f9",
    aura: true,
    slowAmount: 0.25,
    slowDuration: 0.2,
    maxCount: 3
  },
  rocket: {
    id: "rocket",
    name: "Rocket Turret",
    cost: 300,
    range: 175,
    damage: 14,
    fireRate: 3,
    color: "#7c3aed",
    barrelColor: "#c4b5fd",
    projectileColor: "#f97316",
    targetMode: "highestHp",
    projectileSpeed: 290,
    splash: true,
    splashHalfSize: TILE_SIZE / 2,
    maxCount: 2,
    projectileStyle: "rocket"
  }
};
TOWER_TYPES.rocket.damage = Math.floor(TOWER_TYPES.basic.damage * 0.75);

const state = {
  wave: 1,
  gold: 100,
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
  fastForward: false
};

const selectedMap = buildMapLayout(randomMapName());
const pathGrid = createPathGrid(selectedMap.pathTiles);
const mapPathOptions = selectedMap.paths.map((pathTiles) => toPixelPath(pathTiles));
const endPoint = toPixelPoint(selectedMap.endTile);
const buildableGrid = createBuildableGrid(pathGrid);

function randomMapName() {
  const mapNames = ["A", "Z", "W", "P"];
  return mapNames[Math.floor(Math.random() * mapNames.length)];
}

function buildMapLayout(mapName) {
  const maps = {
    A: {
      paths: [[
        [8, 0], [7, 1], [6, 2], [5, 3], [4, 4],
        [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4],
        [11, 3], [10, 2], [9, 1], [8, 2], [8, 3], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9]
      ]]
    },
    Z: {
      paths: [
        [
          [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1],
          [15, 2], [14, 3], [13, 4], [12, 5], [11, 6], [10, 7], [9, 8], [8, 9],
          [9, 9], [10, 9], [11, 9], [12, 9], [13, 9], [14, 9], [15, 9], [16, 9]
        ],
        [
          [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1],
          [16, 2], [16, 3], [15, 4], [14, 5], [13, 6], [12, 7], [11, 8], [10, 9],
          [11, 9], [12, 9], [13, 9], [14, 9], [15, 9], [16, 9]
        ]
      ]
    },
    W: {
      paths: [
        [
          [0, 2], [1, 2], [2, 2], [3, 2],
          [4, 3], [5, 4], [6, 5], [7, 6],
          [8, 5], [9, 4], [10, 3], [11, 2],
          [12, 3], [13, 4], [14, 5], [15, 6], [16, 7]
        ],
        [
          [0, 2], [1, 2], [2, 2], [3, 2],
          [4, 1], [5, 1], [6, 2], [7, 3],
          [8, 4], [9, 5], [10, 6], [11, 5],
          [12, 4], [13, 5], [14, 6], [15, 7], [16, 7]
        ]
      ]
    },
    P: {
      paths: [[
        [4, 9], [4, 8], [4, 7], [4, 6], [4, 5], [4, 4], [4, 3], [4, 2], [4, 1],
        [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1],
        [12, 2], [12, 3], [11, 3], [10, 3], [9, 3], [8, 3], [7, 3], [6, 3], [5, 3], [4, 3],
        [8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9]
      ]]
    }
  };

  const mapDef = maps[mapName] || maps.A;
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
    mapName,
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
    ctx.fillStyle = bodyColor;
    if (this.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - this.radius);
      ctx.lineTo(this.x + this.radius * 0.9, this.y + this.radius * 0.8);
      ctx.lineTo(this.x - this.radius * 0.9, this.y + this.radius * 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (this.shape === "square") {
      const side = this.radius * 1.75;
      ctx.fillRect(this.x - side / 2, this.y - side / 2, side, side);
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.isBoss) {
      drawBossFace(this.x, this.y, this.radius);
    }

    ctx.fillStyle = "#1f2937";
    ctx.fillRect(this.x - 16, this.y - 20, 32, 5);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(this.x - 16, this.y - 20, 32 * hpRatio, 5);
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
    this.cooldown = 0;
  }

  update(dt) {
    if (this.aura) {
      for (const enemy of state.enemies) {
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.range) {
          enemy.applySlow(this.slowAmount, this.slowDuration);
        }
      }
      return;
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
    state.projectiles.push(new Projectile(this.x, this.y, target, {
      damage: this.damage,
      color: this.projectileColor,
      speed: this.projectileSpeed,
      slowAmount: this.slowAmount,
      slowDuration: this.slowDuration,
      splash: this.splash,
      splashHalfSize: this.splashHalfSize,
      style: this.projectileStyle
    }));
  }

  findTarget() {
    let best = null;
    let bestMetric = -1;

    for (const enemy of state.enemies) {
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist > this.range) {
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

  draw() {
    if (this.aura) {
      ctx.strokeStyle = "rgba(103, 232, 249, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(103, 232, 249, 0.07)";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - 14, this.y - 14, 28, 28);
    ctx.fillStyle = this.barrelColor;
    ctx.fillRect(this.x - 4, this.y - 20, 8, 10);
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
      damageEnemy(this.target, this.damage, this.slowAmount, this.slowDuration);
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
  if (state.waveInProgress || state.baseHp <= 0 || state.gameWon || state.wave > FINAL_WAVE) {
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
    hp: Math.floor(state.waveConfig.hp * typeConfig.hpMultiplier),
    speed: state.waveConfig.speed * typeConfig.speedMultiplier,
    radius: typeConfig.radius ?? state.waveConfig.radius,
    color: typeConfig.color,
    shape: typeConfig.shape
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
      baseDamage: 12,
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
  if (!state.waveInProgress || state.baseHp <= 0 || state.gameWon) {
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
      state.gameWon = true;
      state.selectedTowerType = null;
      startWaveBtn.disabled = true;
      return;
    }

    state.wave += 1;
    startWaveBtn.disabled = false;
    const waveBonus = completedWave === 1 ? 40 : completedWave * 10;
    state.gold += waveBonus;
  }
}

function drawGrid() {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      if (pathGrid[y][x] === 1) {
        ctx.fillStyle = PATH_COLOR;
      } else {
        ctx.fillStyle = "#14532d";
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawPathArrows() {
  ctx.strokeStyle = "rgba(24, 26, 31, 0.3)";
  ctx.fillStyle = "rgba(24, 26, 31, 0.3)";
  ctx.lineWidth = 3;
  const sharedPrefixLength = getSharedPrefixLength(mapPathOptions);

  for (const path of mapPathOptions) {
    if (path.length < 2) {
      continue;
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
      continue;
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

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.stroke();

    const px = -uy;
    const py = ux;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(anchor.x - ux * headLength + px * headLength * 0.65, anchor.y - uy * headLength + py * headLength * 0.65);
    ctx.lineTo(anchor.x - ux * headLength - px * headLength * 0.65, anchor.y - uy * headLength - py * headLength * 0.65);
    ctx.closePath();
    ctx.fill();
  }
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
}

function drawGameOver() {
  if (state.baseHp > 0) {
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
  if (!state.gameWon) {
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
  const iceCount = countTowersByType("ice");
  const rocketCount = countTowersByType("rocket");
  turretCountsEl.textContent = `Basic ${basicCount}, Ice ${iceCount}/3, Rocket ${rocketCount}/2`;

  startWaveBtn.disabled = state.baseHp <= 0 || state.waveInProgress || state.gameWon || state.wave > FINAL_WAVE;
  rerollMapBtn.disabled = state.waveInProgress;
  restartLevelBtn.disabled =
    state.baseHp <= 0 || state.gameWon || !state.waveInProgress || state.wave > FINAL_WAVE;
  restartBtn.classList.toggle("hidden", !(state.baseHp <= 0 || state.gameWon));
  fastForwardBtn.disabled = state.baseHp <= 0 || state.gameWon;
  fastForwardBtn.classList.toggle("speed-btn-active", state.fastForward);
  fastForwardBtn.textContent = state.fastForward ? "Fast Forward x2 (On)" : "Fast Forward x2";
  sellModeBtn.disabled = state.baseHp <= 0 || state.gameWon;
  sellModeBtn.classList.toggle("sell-mode-active", state.sellMode);
  sellModeBtn.textContent = state.sellMode ? "Sell Turret (On)" : "Sell Turret";

  for (const button of towerButtons) {
    const typeId = button.dataset.towerType;
    const type = TOWER_TYPES[typeId];
    const isActive = state.selectedTowerType === typeId;
    button.classList.toggle("active", isActive);
    const atCap = type ? isTowerTypeAtCapacity(typeId) : false;
    button.disabled = state.baseHp <= 0 || state.gameWon || !type || atCap;
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
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;
  const speedMultiplier = state.fastForward ? 2 : 1;
  const scaledDt = dt * speedMultiplier;

  update(scaledDt);
  draw();
  updateHud();

  requestAnimationFrame(gameLoop);
}

canvas.addEventListener("mousemove", (event) => {
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
  if (state.baseHp <= 0 || state.gameWon) {
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
    if (state.baseHp <= 0 || state.gameWon) {
      return;
    }
    const typeId = button.dataset.towerType;
    state.sellMode = false;
    state.selectedTowerType = state.selectedTowerType === typeId ? null : typeId;
  });
});

startWaveBtn.addEventListener("click", startWave);
rerollMapBtn.addEventListener("click", () => {
  if (state.waveInProgress) {
    return;
  }
  window.location.reload();
});
restartLevelBtn.addEventListener("click", () => {
  restartCurrentLevel();
});
fastForwardBtn.addEventListener("click", () => {
  if (state.baseHp <= 0 || state.gameWon) {
    return;
  }
  state.fastForward = !state.fastForward;
});
sellModeBtn.addEventListener("click", () => {
  if (state.baseHp <= 0 || state.gameWon) {
    return;
  }
  state.sellMode = !state.sellMode;
  if (state.sellMode) {
    state.selectedTowerType = null;
  }
});
restartBtn.addEventListener("click", () => {
  window.location.reload();
});

requestAnimationFrame(gameLoop);
