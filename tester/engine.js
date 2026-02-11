#!/usr/bin/env node

/**
 * Kingdom Wars - Game Engine / Tester
 * 
 * Simulates the full game according to the rules:
 * - 4 players with towers (HP, armor, resources, level)
 * - Alternating Negotiation and Combat phases
 * - Fatigue after turn 25
 * - Last tower standing wins
 */

const http = require('http');
const https = require('https');
const url = require('url');

// ============ CONFIGURATION ============

const CONFIG = {
  STARTING_HP: 100,
  STARTING_ARMOR: 0,
  STARTING_RESOURCES: 0,
  STARTING_LEVEL: 1,
  MAX_LEVEL: 6,
  FATIGUE_START_TURN: 25,
  REQUEST_TIMEOUT_MS: 1000,
  MAX_TURNS: 100, // Safety limit
};

// ============ COLORS ============

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ============ GAME STATE ============

class Tower {
  constructor(playerId, botUrl) {
    this.playerId = playerId;
    this.botUrl = botUrl;
    this.hp = CONFIG.STARTING_HP;
    this.armor = CONFIG.STARTING_ARMOR;
    this.resources = CONFIG.STARTING_RESOURCES;
    this.level = CONFIG.STARTING_LEVEL;
    this.name = `Player ${playerId}`;
  }

  isAlive() {
    return this.hp > 0;
  }

  /** Display name with player ID for clarity */
  displayName() {
    return `P${this.playerId}`;
  }

  toPublicView() {
    return {
      playerId: this.playerId,
      hp: this.hp,
      armor: this.armor,
      level: this.level,
    };
  }

  toPrivateView() {
    return {
      playerId: this.playerId,
      hp: this.hp,
      armor: this.armor,
      resources: this.resources,
      level: this.level,
    };
  }
}

class Game {
  constructor(botUrls) {
    this.gameId = Math.floor(Math.random() * 100000);
    this.turn = 0;
    this.towers = botUrls.map((url, i) => new Tower(i + 1, url));
    this.previousAttacks = [];
    this.diplomacyMessages = new Map(); // playerId -> received diplomacy
    this.log = [];
    this.eliminations = []; // Track elimination order: [{tower, turn}, ...]
  }

  getAliveTowers() {
    return this.towers.filter((t) => t.isAlive());
  }

  /** Record a tower elimination */
  recordElimination(tower) {
    if (!this.eliminations.find(e => e.tower.playerId === tower.playerId)) {
      this.eliminations.push({ tower, turn: this.turn });
    }
  }

  /** Get final rankings (1st = last standing/last to die, last = first to die) */
  getRankings() {
    const rankings = [];
    
    // Still alive players are ranked first (if multiple, they tie)
    const alive = this.getAliveTowers();
    for (const tower of alive) {
      rankings.push({ tower, turn: null, rank: 1 });
    }
    
    // Eliminated players are ranked by elimination order (last eliminated = better rank)
    const eliminated = [...this.eliminations].reverse();
    let rank = alive.length + 1;
    for (const { tower, turn } of eliminated) {
      rankings.push({ tower, turn, rank });
      rank++;
    }
    
    return rankings;
  }

  getWinner() {
    const alive = this.getAliveTowers();
    if (alive.length === 1) return alive[0];
    if (alive.length === 0) return null; // Draw
    return null; // Game continues
  }
}

// ============ COST CALCULATIONS ============

function upgradeCost(level) {
  return Math.floor(50 * Math.pow(1.75, level - 1));
}

function resourcesPerTurn(level) {
  return Math.floor(20 * Math.pow(1.5, level - 1));
}

function fatigueDamage(turn) {
  if (turn < CONFIG.FATIGUE_START_TURN) return 0;
  const fatigueTurns = turn - CONFIG.FATIGUE_START_TURN + 1;
  return fatigueTurns * 5; // Escalating: 5, 10, 15, 20...
}

// ============ HTTP CLIENT ============

function normalizeUrl(botUrl) {
  // Add http:// if no protocol specified
  if (!botUrl.startsWith('http://') && !botUrl.startsWith('https://')) {
    return `http://${botUrl}`;
  }
  return botUrl;
}

async function sendRequest(botUrl, endpoint, method, body = null) {
  return new Promise((resolve) => {
    const normalizedUrl = normalizeUrl(botUrl);
    const parsedUrl = new url.URL(endpoint, normalizedUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: CONFIG.REQUEST_TIMEOUT_MS,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ success: true, data: JSON.parse(data) });
        } catch {
          resolve({ success: false, error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ============ GAME PHASES ============

async function fetchBotInfo(tower) {
  const result = await sendRequest(tower.botUrl, '/info', 'GET');
  if (result.success && result.data.name) {
    tower.name = result.data.name;
  }
}

async function healthCheck(tower) {
  const result = await sendRequest(tower.botUrl, '/healthz', 'GET');
  return result.success && result.data.status === 'OK';
}

async function negotiationPhase(game) {
  const allDiplomacy = [];

  for (const tower of game.getAliveTowers()) {
    const enemies = game.getAliveTowers()
      .filter((t) => t.playerId !== tower.playerId)
      .map((t) => t.toPublicView());

    const request = {
      gameId: game.gameId,
      turn: game.turn,
      playerTower: tower.toPrivateView(),
      enemyTowers: enemies,
      combatActions: game.previousAttacks,
    };

    const result = await sendRequest(tower.botUrl, '/negotiate', 'POST', request);

    if (result.success && Array.isArray(result.data)) {
      for (const msg of result.data) {
        if (msg.allyId && typeof msg.allyId === 'number') {
          // Store diplomacy message for the ally
          if (!game.diplomacyMessages.has(msg.allyId)) {
            game.diplomacyMessages.set(msg.allyId, []);
          }
          game.diplomacyMessages.get(msg.allyId).push({
            playerId: tower.playerId,
            action: { allyId: msg.allyId, attackTargetId: msg.attackTargetId },
          });
          allDiplomacy.push({
            from: tower.playerId,
            to: msg.allyId,
            attackTarget: msg.attackTargetId,
          });
        }
      }
    }
  }

  return allDiplomacy;
}

async function combatPhase(game) {
  const allActions = new Map(); // playerId -> actions
  const attacks = [];

  // Collect actions from all bots
  for (const tower of game.getAliveTowers()) {
    const enemies = game.getAliveTowers()
      .filter((t) => t.playerId !== tower.playerId)
      .map((t) => t.toPublicView());

    const diplomacy = game.diplomacyMessages.get(tower.playerId) || [];

    const request = {
      gameId: game.gameId,
      turn: game.turn,
      playerTower: tower.toPrivateView(),
      enemyTowers: enemies,
      diplomacy: diplomacy,
      previousAttacks: game.previousAttacks,
    };

    const result = await sendRequest(tower.botUrl, '/combat', 'POST', request);

    if (result.success && Array.isArray(result.data)) {
      const validatedActions = validateActions(result.data, tower, game);
      allActions.set(tower.playerId, validatedActions);
    } else {
      allActions.set(tower.playerId, []);
    }
  }

  // Process all actions
  for (const tower of game.getAliveTowers()) {
    const actions = allActions.get(tower.playerId) || [];
    let resourcesSpent = 0;

    for (const action of actions) {
      if (action.type === 'armor') {
        tower.armor += action.amount;
        resourcesSpent += action.amount;
        game.log.push(`  ${colors.cyan(tower.displayName())}: +${action.amount} armor`);
      } else if (action.type === 'upgrade') {
        const cost = upgradeCost(tower.level);
        tower.level += 1;
        resourcesSpent += cost;
        game.log.push(`  ${colors.magenta(tower.displayName())}: Upgraded to level ${tower.level}`);
      } else if (action.type === 'attack') {
        attacks.push({
          playerId: tower.playerId,
          action: { targetId: action.targetId, troopCount: action.troopCount },
        });
        resourcesSpent += action.troopCount;
      }
    }

    tower.resources -= resourcesSpent;
  }

  // Process attacks (damage is applied after all actions are collected)
  for (const attack of attacks) {
    const attacker = game.towers.find((t) => t.playerId === attack.playerId);
    const target = game.towers.find((t) => t.playerId === attack.action.targetId);

    if (target && target.isAlive()) {
      let damage = attack.action.troopCount;
      const armorDamage = Math.min(target.armor, damage);
      target.armor -= armorDamage;
      damage -= armorDamage;
      target.hp -= damage;
      target.hp = Math.max(0, target.hp);

      game.log.push(
        `  ${colors.red(attacker.displayName())} attacks ${colors.yellow(target.displayName())} for ${attack.action.troopCount} damage`
      );
      if (target.hp <= 0) {
        game.recordElimination(target);
        game.log.push(`  ${colors.red('💀')} ${colors.bold(target.displayName())} has been eliminated!`);
      }
    }
  }

  // Store attacks for next turn's previousAttacks
  game.previousAttacks = attacks;

  return attacks;
}

function validateActions(actions, tower, game) {
  if (!Array.isArray(actions)) return [];

  const validated = [];
  let totalCost = 0;
  let hasArmor = false;
  let hasUpgrade = false;
  const attackTargets = new Set();

  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;

    if (action.type === 'armor') {
      if (hasArmor) continue; // Only one armor action allowed
      if (typeof action.amount !== 'number' || action.amount <= 0) continue;
      const amount = Math.floor(action.amount);
      if (totalCost + amount > tower.resources) continue;
      hasArmor = true;
      totalCost += amount;
      validated.push({ type: 'armor', amount });
    } else if (action.type === 'upgrade') {
      if (hasUpgrade) continue; // Only one upgrade allowed
      if (tower.level >= CONFIG.MAX_LEVEL) continue;
      const cost = upgradeCost(tower.level);
      if (totalCost + cost > tower.resources) continue;
      hasUpgrade = true;
      totalCost += cost;
      validated.push({ type: 'upgrade' });
    } else if (action.type === 'attack') {
      if (typeof action.targetId !== 'number') continue;
      if (typeof action.troopCount !== 'number' || action.troopCount <= 0) continue;
      if (attackTargets.has(action.targetId)) continue; // No duplicate targets
      const target = game.towers.find((t) => t.playerId === action.targetId);
      if (!target || !target.isAlive()) continue;
      if (target.playerId === tower.playerId) continue; // Can't attack self
      const troops = Math.floor(action.troopCount);
      if (totalCost + troops > tower.resources) continue;
      attackTargets.add(action.targetId);
      totalCost += troops;
      validated.push({ type: 'attack', targetId: action.targetId, troopCount: troops });
    }
  }

  return validated;
}

function applyResourceGeneration(game) {
  for (const tower of game.getAliveTowers()) {
    const income = resourcesPerTurn(tower.level);
    tower.resources += income;
  }
}

function applyFatigue(game) {
  const damage = fatigueDamage(game.turn);
  if (damage > 0) {
    game.log.push(`  ${colors.red('⚠️  FATIGUE')}: All towers take ${damage} damage!`);
    for (const tower of game.getAliveTowers()) {
      tower.hp -= damage;
      tower.hp = Math.max(0, tower.hp);
      if (tower.hp <= 0) {
        game.recordElimination(tower);
        game.log.push(`  ${colors.red('💀')} ${colors.bold(tower.displayName())} died to fatigue!`);
      }
    }
  }
}

// ============ DISPLAY ============

function displayTurnHeader(game) {
  console.log();
  console.log(colors.bold(`════════════════ TURN ${game.turn} ════════════════`));
}

function displayTowerStatus(game) {
  console.log(colors.dim('Tower Status:'));
  for (const tower of game.towers) {
    const status = tower.isAlive()
      ? `HP:${tower.hp} ARM:${tower.armor} RES:${tower.resources} LVL:${tower.level}`
      : colors.red('ELIMINATED');
    const color = tower.isAlive() ? colors.green : colors.red;
    console.log(`  ${color(tower.displayName())} [${tower.botUrl}]: ${status}`);
  }
}

function displayLog(game) {
  for (const line of game.log) {
    console.log(line);
  }
  game.log = [];
}

function displayWinner(winner, game) {
  console.log();
  console.log(colors.bold('════════════════ GAME OVER ════════════════'));
  
  // Display final rankings
  const rankings = game.getRankings();
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  
  console.log(colors.bold('\n📊 FINAL RANKINGS:\n'));
  
  for (const { tower, turn, rank } of rankings) {
    const medal = medals[rank - 1] || `${rank}.`;
    const turnInfo = turn ? ` (eliminated turn ${turn})` : ' (survived)';
    const color = rank === 1 ? colors.green : rank === 2 ? colors.yellow : colors.dim;
    console.log(color(`   ${medal} ${tower.displayName()} [${tower.botUrl}]${turnInfo}`));
  }
  
  console.log();
  
  if (winner) {
    console.log(colors.green(`🏆 WINNER: ${winner.displayName()}`));
    console.log(colors.green(`   URL: ${winner.botUrl}`));
    console.log(colors.green(`   Final Stats: HP:${winner.hp} ARM:${winner.armor} RES:${winner.resources} LVL:${winner.level}`));
  } else {
    console.log(colors.yellow('🤝 DRAW - All remaining players eliminated simultaneously'));
  }
  console.log(`   Total Turns: ${game.turn}`);
  console.log();
}

// ============ MAIN GAME LOOP ============

async function runGame(botUrls) {
  console.log(colors.bold('\n🏰 KINGDOM WARS - Game Tester 🏰\n'));
  console.log('Initializing game with bots:');
  
  const game = new Game(botUrls);

  // Health check and fetch bot info
  for (const tower of game.towers) {
    console.log(`  ${tower.displayName()}: Checking ${tower.botUrl}...`);
    const healthy = await healthCheck(tower);
    if (!healthy) {
      console.log(colors.red(`    ❌ Bot at ${tower.botUrl} is not responding!`));
      process.exit(1);
    }
    await fetchBotInfo(tower);
    console.log(colors.green(`    ✓ ${tower.displayName()} [${tower.botUrl}] is ready`));
  }

  console.log(colors.green('\nAll bots are ready! Starting game...\n'));

  // Main game loop
  while (game.turn < CONFIG.MAX_TURNS) {
    game.turn++;
    displayTurnHeader(game);

    // Clear diplomacy messages from previous turn
    game.diplomacyMessages.clear();

    // Resource generation (after negotiation, before combat)
    applyResourceGeneration(game);

    // Negotiation phase
    game.log.push(colors.blue('📜 Negotiation Phase'));
    const diplomacy = await negotiationPhase(game);
    if (diplomacy.length > 0) {
      for (const d of diplomacy) {
        const from = game.towers.find((t) => t.playerId === d.from);
        const to = game.towers.find((t) => t.playerId === d.to);
        const targetStr = d.attackTarget
          ? ` (suggesting attack on P${d.attackTarget})`
          : '';
        game.log.push(`  ${from.displayName()} → ${to.displayName()}: Peace offer${targetStr}`);
      }
    } else {
      game.log.push(colors.dim('  No diplomacy this turn'));
    }

    // Combat phase
    game.log.push(colors.red('⚔️  Combat Phase'));
    await combatPhase(game);

    // Apply fatigue
    applyFatigue(game);

    // Display status
    displayTowerStatus(game);
    displayLog(game);

    // Check for winner
    const winner = game.getWinner();
    if (winner || game.getAliveTowers().length === 0) {
      displayWinner(winner, game);
      
      // Output winner URL for scripting
      if (winner) {
        console.log(`WINNER_URL=${winner.botUrl}`);
      }
      return winner;
    }
  }

  console.log(colors.yellow('\n⏰ Game ended due to turn limit'));
  return null;
}

// ============ ENTRY POINT ============

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node engine.js <bot1_url> <bot2_url> [bot3_url] [bot4_url]');
  console.log('Example: node engine.js http://localhost:8000 http://localhost:8001');
  process.exit(1);
}

// Pad to 4 players if needed (duplicate bots)
while (args.length < 4) {
  args.push(args[args.length % args.length]);
}

runGame(args.slice(0, 4)).catch((err) => {
  console.error('Game error:', err);
  process.exit(1);
});
