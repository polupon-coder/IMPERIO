// Jugadores máquina. Eligen siempre entre las acciones legales del motor (las mismas que la
// interfaz ofrece) y nunca miran el generador de dados: las probabilidades de combate se calculan.
import {
  activationLimit,
  canRecruitNow,
  activeSeat,
  attackTargets,
  baseDice,
  bombardPositions,
  canActivate,
  canAttackNow,
  canUseCivil,
  canUseMilitary,
  groupCandidates,
  hasBuilding,
  isUnlocked,
  moveTargets,
} from './military';
import { exchangeOptions, initialPlacements, legalPlacements, ringSpots, unitsAt } from './phase1';
import {
  BUILDINGS,
  BUILDING_COST,
  CAPITALS,
  MAX_PER_TYPE,
  RESOURCES,
  RINGS,
  SEATS,
  SIDES,
  UNIT_COST,
  UNIT_TYPES,
  canAfford,
  CONVERT_RATE,
  FAITH_COST,
  isCapital,
  isLand,
  manhattan,
  orthoNeighbors,
  ringOwner,
  sideCell,
  sideTowards,
} from './rules';
import type { Action, Building, GameState, Resource, Resources, Seat, Side, Terrain, UnitType } from './types';
import { unitCount, wallBuildCheck } from './game';

export type BotLevel = 'facil' | 'normal';
type Rand = () => number;

// ---------------------------------------------------------------------------------------------
// Quién debe actuar
// ---------------------------------------------------------------------------------------------

/** Asientos que tienen ahora mismo una decisión pendiente. */
export function pendingSeats(s: GameState): Seat[] {
  if (s.phase === 'GAME_OVER' || s.phase === 'SETUP') return [];
  if (s.prompt) return [s.prompt.seat];
  if (s.phase === 'PHASE_2') return s.turn ? [s.turn.seat] : [];
  const queued = s.players.filter((p) => p.rewardQueue.length).map((p) => p.seat);
  if (s.step === 'INITIAL_PLACEMENT')
    return [...new Set([...queued, ...s.players.filter((p) => p.initialTiles.length).map((p) => p.seat)])];
  if (s.step === 'FINAL_DEPLOY') return s.players.filter((p) => p.reserve.length).map((p) => p.seat);
  if (s.step === 'BLOCKED') return [];
  return queued.length ? queued : [activeSeat(s)];
}

/** Acción elegida por la máquina para `seat`, o null si no le toca decidir nada. */
export function chooseAction(s: GameState, seat: Seat, level: BotLevel, r: Rand = Math.random): Action | null {
  if (!pendingSeats(s).includes(seat)) return null;
  if (s.phase === 'PHASE_1') return phase1(s, seat, level, r);
  if (s.phase === 'PHASE_2') return phase2(s, seat, level, r);
  return null;
}

const pickBest = <T>(items: T[], score: (x: T) => number): T | undefined => {
  let best: T | undefined;
  let bs = -Infinity;
  for (const it of items) {
    const v = score(it);
    if (v > bs) {
      bs = v;
      best = it;
    }
  }
  return best;
};

// ---------------------------------------------------------------------------------------------
// Utilidades de tablero
// ---------------------------------------------------------------------------------------------

/** Casillas laterales de la Capital (las únicas desde las que se conquista). */
const sideCells = (seat: Seat) => SIDES.map((side) => ({ side, pos: sideCell(seat, side) }));

/** Lados de la propia Capital por los que un enemigo podría conquistar (tierra y sin Muralla). */
function openSides(s: GameState, seat: Seat) {
  return sideCells(seat).filter(
    ({ side, pos }) => !s.players[seat].walls.includes(side) && (s.cells[pos].terrain === null || isLand(s.cells[pos].terrain)),
  );
}

const enemyUnits = (s: GameState, seat: Seat) => s.units.filter((u) => u.owner !== seat);
const ownUnits = (s: GameState, seat: Seat) => s.units.filter((u) => u.owner === seat);

/** Amenaza sobre la propia Capital: enemigos cerca de sus lados abiertos. */
function threatLevel(s: GameState, seat: Seat) {
  const open = openSides(s, seat).map((o) => o.pos);
  let t = 0;
  for (const e of enemyUnits(s, seat)) {
    const d = Math.min(...open.map((p) => manhattan(p, e.pos)), manhattan(CAPITALS[seat], e.pos));
    if (d <= 1) t += 3;
    else if (d <= 3) t += 1;
  }
  return t;
}

/** Distancia por tierra (en casillas) desde las metas, para un tipo de tropa. */
function distanceMap(s: GameState, seat: Seat, type: UnitType, goals: number[]): number[] {
  const dist = new Array(64).fill(Infinity);
  const q: number[] = [];
  for (const g of goals) {
    dist[g] = 0;
    q.push(g);
  }
  while (q.length) {
    const cur = q.shift()!;
    for (const n of orthoNeighbors(cur)) {
      const t = s.cells[n].terrain;
      if (isCapital(n) || !isLand(t) || (type === 'artilleria' && t === 'montana')) continue;
      // El terreno lento cuesta más (entrar termina la activación); las casillas con enemigos
      // se pueden despejar atacando, pero cuestan bastante más.
      const enemy = unitsAt(s, n).some((u) => u.owner !== seat);
      const nd = dist[cur] + (t === 'llanura' ? 1 : 1.6) + (enemy ? 3 : 0);
      if (nd < dist[n]) {
        dist[n] = nd;
        q.push(n);
      }
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------------------------
// Probabilidades de combate
// ---------------------------------------------------------------------------------------------

/** P(gana atacante), P(gana defensor) con a y b dados (solo cuenta el más alto). */
export function duel(a: number, b: number): [number, number] {
  let win = 0;
  let lose = 0;
  for (let k = 1; k <= 6; k++) {
    const pa = (k / 6) ** a - ((k - 1) / 6) ** a; // máx. del atacante = k
    win += pa * ((k - 1) / 6) ** b;
    lose += pa * (1 - (k / 6) ** b);
  }
  return [win, lose];
}

const UNIT_VALUE: Record<UnitType, number> = { infanteria: 1, arquero: 1.2, lancero: 1.1, caballeria: 1.4, artilleria: 1.5 };

/** Tipo que elegiría el defensor en una pila mixta (el que menos opciones da al atacante). */
function defenderBest(s: GameState, pos: number, attType: UnitType, n: number, distance: 1 | 2) {
  const here = unitsAt(s, pos);
  const types = [...new Set(here.map((u) => u.type))];
  return pickBest(types, (t) => {
    const m = here.filter((u) => u.type === t).length;
    const [ba, bb, canLose] = baseDice(attType, t, distance);
    const [w, l] = duel(ba + n - 1, bb + m - 1);
    return -w + (canLose ? l * 0.5 : 0);
  })!;
}

// ---------------------------------------------------------------------------------------------
// Fase I
// ---------------------------------------------------------------------------------------------

function phase1(s: GameState, seat: Seat, level: BotLevel, r: Rand): Action | null {
  const p = s.players[seat];
  const q = p.rewardQueue[0];
  if (q) {
    if (q.kind === 'choose') return { type: 'chooseReward', option: chooseReward(s, seat, q.options, level, r) };
    if (q.kind === 'deploy') return { type: 'deployUnit', pos: bestSpot(s, seat, q.unit, r) };
    return { type: 'placeWall', side: bestWallSide(s, seat, r) };
  }
  // Tropas en reserva que ya tienen sitio
  const ri = p.reserve.findIndex((t) => ringSpots(s, seat, t).length);
  if (ri >= 0) return { type: 'deployReserve', index: ri, pos: bestSpot(s, seat, p.reserve[ri], r) };

  if (s.step === 'INITIAL_PLACEMENT' && p.initialTiles.length) {
    const options: Array<{ terrain: Terrain; pos: number }> = [];
    for (const terrain of new Set(p.initialTiles))
      for (const pos of initialPlacements(s, seat, terrain)) options.push({ terrain, pos });
    const best = pickBest(options, ({ terrain, pos }) => {
      const side = sideTowards(seat, pos) !== null;
      let v = r() * 0.8;
      if (terrain === 'agua' && side) v += 3; // el Agua cierra un lado de la Capital
      if (terrain === 'llanura' && side) v += 1; // buena casilla de guardia
      if (terrain === 'montana' && !side) v += 1;
      return v;
    })!;
    return { type: 'placeInitial', ...best };
  }
  if (s.step === 'PILE_PLACEMENT' && activeSeat(s) === seat) {
    const tile = s.pile[0];
    const best = pickBest(legalPlacements(s, seat, tile), (pos) => {
      let v = r();
      const mine = ringOwner(pos) === seat;
      if (mine && isLand(tile)) v += 4; // recompensa militar
      if (mine && tile === 'agua' && sideTowards(seat, pos) !== null) v += 3;
      if (!mine && tile === 'agua') {
        // Agua cerca de Capitales rivales: les complica el acceso
        const rival = Math.min(...SEATS.filter((x) => x !== seat).map((x) => manhattan(pos, CAPITALS[x])));
        v += 2 / rival;
      }
      if (!mine && isLand(tile)) v += 1.5 / manhattan(pos, CAPITALS[seat]);
      return v;
    })!;
    return { type: 'placeTile', pos: best };
  }
  if (s.step === 'EXCHANGE' && activeSeat(s) === seat) {
    const opts = exchangeOptions(s, seat, s.exchangeTile!);
    const o = opts[Math.floor(r() * opts.length)];
    return { type: 'exchange', from: o.from, to: o.to };
  }
  return null;
}

function chooseReward(s: GameState, seat: Seat, options: Array<UnitType | 'muralla'>, level: BotLevel, r: Rand) {
  const p = s.players[seat];
  const walls = p.originalWalls.length;
  const landSides = sideCells(seat).filter(({ pos }) => s.cells[pos].terrain !== 'agua').length;
  return pickBest(options, (o) => {
    let v = r() * (level === 'facil' ? 2 : 0.6);
    if (o === 'muralla') v += walls < Math.min(2, landSides) ? 3 : 1;
    else {
      const n = unitCount(s, seat, o);
      v += { infanteria: 2, arquero: 2.4, lancero: 2, caballeria: 2.4, artilleria: 2.2 }[o] - n * 0.5;
    }
    return v;
  })!;
}

/** Mejor casilla del anillo para desplegar o reclutar: primero los lados abiertos sin guardia. */
function bestSpot(s: GameState, seat: Seat, type: UnitType, r: Rand) {
  const open = new Set(openSides(s, seat).map((o) => o.pos));
  return pickBest(ringSpots(s, seat, type), (pos) => {
    const here = unitsAt(s, pos).length;
    let v = r() * 0.5;
    if (open.has(pos)) v += here === 0 ? 5 : 1.5;
    else if (sideTowards(seat, pos) !== null) v += 1;
    if (s.cells[pos].terrain === 'llanura') v += 1;
    v -= here * 1.2;
    return v;
  })!;
}

function bestWallSide(s: GameState, seat: Seat, r: Rand): Side {
  const p = s.players[seat];
  return pickBest(
    SIDES.filter((x) => !p.originalWalls.includes(x)),
    (side) => {
      const t = s.cells[sideCell(seat, side)].terrain;
      return r() + (t === 'agua' ? -5 : t === null ? 1.5 : 3);
    },
  )!;
}

// ---------------------------------------------------------------------------------------------
// Fase II — economía
// ---------------------------------------------------------------------------------------------

const BUILD_PRIORITY: Record<Building, number> = {
  mercado: 10,
  ayuntamiento: 9,
  biblioteca: 8,
  cuartel: 6,
  herreria: 6,
  arqueria: 5,
  caballerizas: 5,
  iglesia: 3,
};

function buildPriority(s: GameState, seat: Seat, b: Building) {
  let v = BUILD_PRIORITY[b];
  // Los edificios que desbloquean tropas que ya tiene suben de prioridad
  const own = ownUnits(s, seat);
  const has = (t: UnitType) => own.some((u) => u.type === t);
  if (b === 'cuartel' && has('infanteria')) v += 2;
  if (b === 'arqueria' && has('arquero')) v += 2;
  if (b === 'herreria' && (has('lancero') || has('artilleria'))) v += 2;
  if (b === 'caballerizas' && has('caballeria')) v += 1;
  return v;
}

const remainingBuildings = (s: GameState, seat: Seat) => {
  const p = s.players[seat];
  return BUILDINGS.filter((b) => !p.buildings.includes(b) && !(b === 'ayuntamiento' && p.buildings.length < 2));
};

/** Conversiones de Mercado necesarias para pagar `cost` (o null si no alcanza). */
function conversionPlan(have: Resources, cost: Resources): Array<{ give: Resource; get: Resource }> | null {
  const res = { ...have };
  const plan: Array<{ give: Resource; get: Resource }> = [];
  for (const need of RESOURCES) {
    while (res[need] < cost[need]) {
      const give = pickBest(
        RESOURCES.filter((x) => x !== need && res[x] - cost[x] >= CONVERT_RATE),
        (x) => res[x] - cost[x],
      );
      if (!give) return null;
      res[give] -= CONVERT_RATE;
      res[need] += 1;
      plan.push({ give, get: need });
    }
  }
  return plan;
}

/** Edificio a construir ahora (con las conversiones necesarias), según prioridad. */
function buildChoice(s: GameState, seat: Seat) {
  const p = s.players[seat];
  const market = hasBuilding(s, seat, 'mercado');
  const options = remainingBuildings(s, seat)
    .map((b) => ({ b, plan: canAfford(p.resources, BUILDING_COST[b]) ? [] : market ? conversionPlan(p.resources, BUILDING_COST[b]) : null }))
    .filter((x) => x.plan !== null) as Array<{ b: Building; plan: Array<{ give: Resource; get: Resource }> }>;
  return pickBest(options, (x) => buildPriority(s, seat, x.b) - x.plan.length * 0.8);
}

/** Recurso que más falta para el próximo edificio. */
function neededResource(s: GameState, seat: Seat): Resource {
  const p = s.players[seat];
  const target = pickBest(remainingBuildings(s, seat), (b) => buildPriority(s, seat, b));
  if (!target) return pickBest(RESOURCES, (r) => -p.resources[r])!;
  return pickBest(RESOURCES, (r) => BUILDING_COST[target][r] - p.resources[r] - p.resources[r] * 0.001)!;
}

// ---------------------------------------------------------------------------------------------
// Fase II — decisiones fuera del turno (prompts)
// ---------------------------------------------------------------------------------------------

function answerPrompt(s: GameState, seat: Seat, level: BotLevel, r: Rand): Action | null {
  const pr = s.prompt!;
  const p = s.players[seat];
  switch (pr.kind) {
    case 'library':
      return { type: 'libraryChoice', resource: neededResource(s, seat) };
    case 'defenderChoice': {
      const c = s.combat!;
      const pos = c.target.kind === 'troops' ? c.target.pos : -1;
      const unit = level === 'facil' && r() < 0.4 ? pr.options[Math.floor(r() * pr.options.length)] : defenderBest(s, pos, c.attackerType, c.attackerUnits.length, c.distance);
      return { type: 'defenderChoice', unit };
    }
    case 'faith': {
      const c = s.combat!;
      const a = Math.max(...c.attackerDice);
      const b = Math.max(...c.defenderDice);
      let use: boolean;
      if (level === 'facil') use = r() < 0.4;
      else if (pr.role === 'attacker') use = a < b || (a === b && !c.attackerCanLose);
      else use = b < a;
      // La Fe es cara: no se gasta en empates si el Agua escasea
      if (level === 'normal' && a === b && p.resources.agua < FAITH_COST * 2) use = false;
      return { type: 'faith', use };
    }
    case 'advance': {
      if (level === 'facil') return { type: 'advance', accept: r() < 0.6 };
      const mine = unitsAt(s, pr.from).filter((u) => u.owner === seat).length;
      const danger = orthoNeighbors(pr.to).some((n) => {
        const e = unitsAt(s, n).filter((u) => u.owner !== seat);
        return e.length > mine;
      });
      // No abandona un lado abierto de su propia Capital
      const guarding = openSides(s, seat).some((o) => o.pos === pr.from);
      // Avanzar a un lado de una Capital rival por conquistar deja la conquista a un paso
      const siege = SEATS.some((x) => x !== seat && !p.conquests.includes(x) && sideTowards(x, pr.to) !== null);
      return { type: 'advance', accept: !guarding && (siege || !danger) };
    }
    case 'trade': {
      const from = s.players[pr.from];
      if (from.buildings.length >= 7) return { type: 'respondTrade', accept: false }; // no ayuda a quien está a punto de ganar
      const gets = RESOURCES.find((x) => pr.give[x] > 0)!;
      const gives = RESOURCES.find((x) => pr.receive[x] > 0)!;
      const target = pickBest(remainingBuildings(s, seat), (b) => buildPriority(s, seat, b));
      const cost = target ? BUILDING_COST[target] : { comida: 0, madera: 0, piedra: 0, agua: 0 };
      const useful = p.resources[gets] < cost[gets];
      const spare = p.resources[gives] - 1 >= cost[gives];
      const accept = level === 'facil' ? r() < 0.5 && p.resources[gives] >= 1 : useful && spare;
      return { type: 'respondTrade', accept };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Fase II — turno propio
// ---------------------------------------------------------------------------------------------

interface Plan {
  target: Seat | null; // Capital rival objetivo de la conquista
  marching: boolean; // si las tropas libres avanzan hacia ella
  guards: Set<string>; // tropas que custodian lados abiertos de la propia Capital
}

function makePlan(s: GameState, seat: Seat, level: BotLevel): Plan {
  const p = s.players[seat];
  const rivals = SEATS.filter((x) => x !== seat && !p.conquests.includes(x) && conquerable(s, x));
  const mine = ownUnits(s, seat).filter((u) => u.type !== 'artilleria');
  const target =
    pickBest(rivals, (x) => {
      const defenders = enemyUnits(s, seat).filter((u) => u.owner === x && manhattan(u.pos, CAPITALS[x]) <= 2).length;
      const walls = s.players[x].walls.length;
      // Distancia media de las propias tropas a esa Capital (por tierra)
      const dist = distanceMap(s, seat, 'infanteria', goalsFor(s, seat, x, 'infanteria'));
      const reach = mine.length ? mine.reduce((n, u) => n + Math.min(dist[u.pos], 30), 0) / mine.length : manhattan(CAPITALS[seat], CAPITALS[x]);
      return -(walls * 1.5 + defenders * 0.8 + reach * 0.5);
    }) ?? null;
  const army = ownUnits(s, seat).length;
  const marching =
    p.conquests.length === 0 &&
    (level === 'normal' ? p.buildings.length >= 4 || army >= 9 : p.buildings.length >= 6 || army >= 12);
  const guards = new Set<string>();
  for (const { pos } of openSides(s, seat)) {
    const here = unitsAt(s, pos).filter((u) => u.owner === seat);
    if (here.length) guards.add(here[0].id);
  }
  return { target, marching, guards };
}

/**
 * Metas para avanzar hacia la Capital objetivo: sus lados (para conquistar o atacar la Muralla),
 * las posiciones de bombardeo de la Artillería y, si los lados están ocupados por defensores,
 * las casillas desde las que atacarlos.
 */
function goalsFor(s: GameState, seat: Seat, target: Seat, type: UnitType): number[] {
  const out = new Set<number>();
  const ok = (pos: number) => {
    const t = s.cells[pos].terrain;
    return !isCapital(pos) && isLand(t) && !(type === 'artilleria' && t === 'montana') && !unitsAt(s, pos).some((u) => u.owner !== seat);
  };
  for (const side of SIDES) {
    const front = sideCell(target, side);
    if (!isLand(s.cells[front].terrain)) continue;
    const walled = s.players[target].walls.includes(side);
    if (type === 'artilleria' && walled) bombardPositions(target, side).forEach((b) => out.add(b));
    if (ok(front)) out.add(front);
    else if (unitsAt(s, front).some((u) => u.owner !== seat)) {
      // Lado ocupado por defensores: acercarse para atacarlos (los de alcance, a distancia 2,
      // desde donde el Arquero y la Artillería no sufren bajas)
      if (type === 'arquero' || type === 'artilleria') {
        for (let pos = 0; pos < 64; pos++) if (manhattan(pos, front) === 2 && ok(pos)) out.add(pos);
      } else for (const n of orthoNeighbors(front)) if (ok(n)) out.add(n);
    }
  }
  return [...out].filter(ok);
}

/** Capitales que se pueden llegar a conquistar (algún lado de tierra). */
const conquerable = (s: GameState, x: Seat) => SIDES.some((side) => isLand(s.cells[sideCell(x, side)].terrain));

interface Scored {
  action: Action;
  value: number;
}

function attackOptions(s: GameState, seat: Seat, plan: Plan): Scored[] {
  const out: Scored[] = [];
  const acts = s.turn?.military?.activations ?? {};
  const used = Object.keys(acts).length;
  const myOpen = openSides(s, seat).map((o) => o.pos);
  for (const u of ownUnits(s, seat)) {
    if (!canActivate(s, u) || !canAttackNow(s, u)) continue;
    const ids = [u.id];
    for (const g of groupCandidates(s, u.id)) {
      const fresh = [...ids, g].filter((id) => !acts[id]).length;
      if (used + fresh <= activationLimit(s)) ids.push(g);
    }
    const n = ids.length;
    const tg = attackTargets(s, u.id);
    for (const pos of tg.troops) {
      const d = manhattan(u.pos, pos) as 1 | 2;
      const t = defenderBest(s, pos, u.type, n, d);
      const m = unitsAt(s, pos).filter((x) => x.type === t).length;
      const [ba, bb, canLose] = baseDice(u.type, t, d);
      const [w, l] = duel(ba + n - 1, bb + m - 1);
      const near = Math.min(...myOpen.map((p) => manhattan(p, pos)), 9);
      const clearsTarget = plan.target !== null && sideTowards(plan.target, pos) !== null;
      const killValue = UNIT_VALUE[t] + (near <= 1 ? 2.5 : near <= 2 ? 1 : 0) + (clearsTarget ? 2 : 0);
      const lossValue = canLose ? UNIT_VALUE[u.type] : 0;
      // Usar varias figuras cuesta activaciones: se descuenta un poco
      const value = w * killValue - l * lossValue - (n - 1) * 0.08;
      out.push({ action: { type: 'attack', unitIds: ids, target: pos }, value });
    }
    for (const wl of tg.walls) {
      const art = u.type === 'artilleria';
      const [w, l] = art ? duel(2 + n - 1, 1) : duel(n, 2);
      const goal = wl.capital === plan.target ? 2.2 : 0.8;
      const value = w * goal - (art ? l * UNIT_VALUE.artilleria : 0);
      out.push({ action: { type: 'attackWall', unitIds: ids, capital: wl.capital, side: wl.side }, value });
    }
  }
  return out;
}

function moveOptions(s: GameState, seat: Seat, plan: Plan): Scored[] {
  const out: Scored[] = [];
  const threat = threatLevel(s, seat);
  const open = openSides(s, seat);
  const unguarded = new Set(open.filter(({ pos }) => !unitsAt(s, pos).some((u) => u.owner === seat)).map((o) => o.pos));
  const maps = new Map<UnitType, number[]>();
  const distTo = (type: UnitType) => {
    if (plan.target === null) return null;
    if (!maps.has(type)) maps.set(type, distanceMap(s, seat, type, goalsFor(s, seat, plan.target, type)));
    return maps.get(type)!;
  };
  for (const u of ownUnits(s, seat)) {
    if (!canActivate(s, u)) continue;
    const targets = moveTargets(s, u.id);
    if (!targets.size) continue;
    const isGuard = plan.guards.has(u.id);
    const dist = plan.marching && !isGuard ? distTo(u.type) : null;
    for (const to of targets.keys()) {
      let value = 0;
      // Defensa: cubrir un lado abierto sin guardia
      if (unguarded.has(to)) value += 2 + threat * 0.6;
      // No abandonar la guardia si hay amenaza
      if (isGuard && threat > 0) value -= 4;
      if (isGuard && threat === 0 && !plan.marching) value -= 1;
      // Marcha hacia la Capital objetivo
      if (dist) {
        const gain = dist[u.pos] - dist[to];
        if (Number.isFinite(gain)) value += gain * 1.1;
        if (dist[to] === 0) value += 1.5;
      }
      // Riesgo: acabar junto a pilas enemigas más fuertes
      const adjEnemy = orthoNeighbors(to).reduce((n, x) => n + unitsAt(s, x).filter((e) => e.owner !== seat).length, 0);
      const mine = unitsAt(s, to).filter((x) => x.owner === seat).length + 1;
      if (adjEnemy > mine) value -= 0.8 * (adjEnemy - mine);
      out.push({ action: { type: 'move', unitId: u.id, to }, value });
    }
  }
  return out;
}

function recruitChoice(s: GameState, seat: Seat, plan: Plan, r: Rand): Action | null {
  const p = s.players[seat];
  const options = UNIT_TYPES.filter(
    (t) => isUnlocked(s, seat, t) && unitCount(s, seat, t) < MAX_PER_TYPE && canAfford(p.resources, UNIT_COST[t]) && ringSpots(s, seat, t).length,
  );
  const targetWalled = plan.target !== null && s.players[plan.target].walls.length > 0;
  const enemyCav = enemyUnits(s, seat).filter((u) => u.type === 'caballeria').length;
  const t = pickBest(options, (x) => {
    let v = r() * 0.5 - unitCount(s, seat, x) * 0.4;
    if (x === 'caballeria') v += 2;
    if (x === 'arquero') v += 1.6;
    if (x === 'lancero') v += 1 + enemyCav * 0.3;
    if (x === 'artilleria') v += targetWalled ? 2 : 0.5;
    if (x === 'infanteria') v += 1;
    return v;
  });
  return t ? { type: 'recruit', unit: t, pos: bestSpot(s, seat, t, r) } : null;
}

function wallChoice(s: GameState, seat: Seat, level: BotLevel): Action | null {
  const threat = threatLevel(s, seat);
  const p = s.players[seat];
  // Sin amenaza, solo si ya no le quedan edificios que construir pronto
  const nearBuilding = remainingBuildings(s, seat).length > 0 && p.buildings.length < 8;
  if (threat === 0 && nearBuilding) return null;
  if (level === 'facil' && threat < 3) return null;
  const sides = SIDES.filter((side) => isLand(s.cells[sideCell(seat, side)].terrain) && wallBuildCheck(s, seat, side).ok);
  const best = pickBest(sides, (side) => {
    const pos = sideCell(seat, side);
    const nearEnemy = Math.min(9, ...enemyUnits(s, seat).map((e) => manhattan(e.pos, pos)));
    return (wallBuildCheck(s, seat, side).repair ? 1 : 0) - nearEnemy;
  });
  return best ? { type: 'buildWall', side: best } : null;
}

function phase2(s: GameState, seat: Seat, level: BotLevel, r: Rand): Action | null {
  if (s.prompt) return s.prompt.seat === seat ? answerPrompt(s, seat, level, r) : null;
  if (s.combat || s.turn?.seat !== seat) return null;
  const p = s.players[seat];
  const t = s.turn!;
  const plan = makePlan(s, seat, level);
  const sloppy = level === 'facil';

  // 1. Conquistar si se puede (puede dar la victoria)
  for (const u of ownUnits(s, seat)) {
    if (!canActivate(s, u)) continue;
    const caps = attackTargets(s, u.id).capitals;
    if (caps.length) return { type: 'conquer', unitId: u.id, capital: caps[0] };
  }

  // 2. Construir (con conversiones del Mercado si hacen falta)
  if (canUseCivil(s)) {
    const choice = buildChoice(s, seat);
    if (choice && !(sloppy && r() < 0.15)) {
      if (choice.plan.length) return { type: 'convert', ...choice.plan[0] };
      return { type: 'build', building: choice.b };
    }
  }

  // 2b. Murallas: reparar o levantar en lados abiertos de tierra, sobre todo si hay amenaza
  if (canUseCivil(s)) {
    const wall = wallChoice(s, seat, level);
    if (wall) return wall;
  }

  // 3. Acción militar
  if (canUseMilitary(s)) {
    const started = !!t.military;
    const threat = threatLevel(s, seat);
    const attacks = attackOptions(s, seat, plan);
    const moves = moveOptions(s, seat, plan);
    const thresholdAttack = sloppy ? 0.25 : 0.12;
    let best = pickBest([...attacks.filter((a) => a.value > thresholdAttack), ...moves.filter((m) => m.value > 0.5)], (x) => x.value + (sloppy ? r() * 1.5 : r() * 0.05));
    if (sloppy && best && r() < 0.2) best = undefined;

    // A21: se puede reclutar 1 tropa y además activar hasta 2 (recluta primero, si conviene)
    if (canRecruitNow(s)) {
      const army = ownUnits(s, seat).length;
      const wantArmy =
        (threat > 0 && openSides(s, seat).length > 0 && army < 20) || army < (sloppy ? 4 : 6) || (plan.marching && army < 12);
      const civilLeft = canUseCivil(s) && !hasBuilding(s, seat, 'ayuntamiento');
      const savingForBuild = civilLeft && remainingBuildings(s, seat).some((b) => {
        // Le falta poco para un edificio: mejor no gastar
        const cost = BUILDING_COST[b];
        return RESOURCES.reduce((n, x) => n + Math.max(0, cost[x] - p.resources[x]), 0) <= 2;
      });
      // Un gran ataque de 3 figuras vale más que reclutar (reclutar deja solo 2 activaciones)
      const bigAttack = (best?.value ?? 0) >= 2.5 && best?.action.type === 'attack' && best.action.unitIds.length >= 3;
      if (wantArmy && !savingForBuild && !bigAttack) {
        const rec = recruitChoice(s, seat, plan, r);
        if (rec) return rec;
      }
    }
    if (best) return best.action;
    if (started && t.military?.open) return { type: 'endMilitary' };
  }

  // 4. Construir después de la acción militar (con Ayuntamiento)
  if (canUseCivil(s)) {
    const choice = buildChoice(s, seat);
    if (choice) return choice.plan.length ? { type: 'convert', ...choice.plan[0] } : { type: 'build', building: choice.b };
  }
  return { type: 'endTurn' };
}
