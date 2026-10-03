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
  canTowerAttack,
  towerTargets,
  canUseCivil,
  canUseMilitary,
  groupCandidates,
  hasBuilding,
  isUnlocked,
  moveTargets,
} from './military';
import { exchangeOptions, initialPlacements, legalPlacements, ringSpots, towerAt, unitsAt } from './phase1';
import {
  BUILDINGS,
  BUILDING_COST,
  CAPITALS,
  MAX_PER_TYPE,
  MAX_STACK,
  RESOURCES,
  RINGS,
  SEATS,
  SIDES,
  UNIT_COST,
  UNIT_TYPES,
  canAfford,
  CONVERT_RATE,
  TOWER_COST,
  FAITH_COST,
  VICTORY,
  isCapital,
  capitalSeatAt,
  isLand,
  manhattan,
  orthoNeighbors,
  ringOwner,
  sideCell,
  sideTowards,
} from './rules';
import type { Action, Building, GameState, Resource, Resources, Seat, Side, Terrain, UnitType } from './types';
import { applyAction, towerBuildSpots, unitCount, wallBuildCheck } from './game';

export type BotLevel = 'facil' | 'normal' | 'dificil';
type Rand = () => number;

/** Lo que la máquina sabe del Mundo además del tablero: quién es humano y qué máquinas son difíciles. */
export interface BotOptions {
  humans?: Seat[];
  hardBots?: Seat[];
}

/**
 * Máquina difícil que «caza» al humano: la más cercana a la Capital del primer humano.
 * Así al menos una va a por él aunque haya varias difíciles.
 */
export function hunterSeat(opts: BotOptions): Seat | null {
  const human = opts.humans?.[0];
  if (human === undefined || !opts.hardBots?.length) return null;
  return pickBest(opts.hardBots, (b) => -manhattan(CAPITALS[b], CAPITALS[human]) - b * 0.01) ?? null;
}

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
export function chooseAction(s: GameState, seat: Seat, level: BotLevel, r: Rand = Math.random, opts: BotOptions = {}): Action | null {
  if (!pendingSeats(s).includes(seat)) return null;
  if (s.phase === 'PHASE_1') return phase1(s, seat, level, r);
  if (s.phase === 'PHASE_2') return phase2(s, seat, level, r, opts);
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

/** Lo cerca que está un jugador de la victoria (8 edificios y 2 conquistas). */
const progress = (s: GameState, seat: Seat) => s.players[seat].buildings.length + s.players[seat].conquests.length * 3;

/** Rival más avanzado si va claramente por delante del resto (modo difícil: se le frena). */
function leaderOf(s: GameState, seat: Seat): Seat | null {
  const rivals = SEATS.filter((x) => x !== seat).sort((a, b) => progress(s, b) - progress(s, a));
  const top = rivals[0];
  return progress(s, top) >= Math.max(6, progress(s, seat) + 1) ? top : null;
}

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

/** Enemigos cerca de una casilla de la propia Capital (para reforzar el lado más amenazado). */
function sideDanger(s: GameState, seat: Seat, pos: number) {
  return enemyUnits(s, seat).reduce((n, e) => n + (manhattan(e.pos, pos) <= 1 ? 1.5 : manhattan(e.pos, pos) <= 3 ? 0.5 : 0), 0);
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
      if (isCapital(n)) {
        // A27: la propia Capital se atraviesa (un paso)
        if (capitalSeatAt(n) === seat && dist[cur] + 1 < dist[n]) {
          dist[n] = dist[cur] + 1;
          q.push(n);
        }
        continue;
      }
      if (!isLand(t) || (type === 'artilleria' && t === 'montana')) continue;
      // El terreno lento cuesta más (entrar termina la activación); las casillas con enemigos
      // se pueden despejar atacando, pero cuestan bastante más.
      const tw = towerAt(s, n);
      const enemy = unitsAt(s, n).some((u) => u.owner !== seat) || (tw !== null && tw !== seat); // A28: el propio se atraviesa y se ocupa
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

/** Difícil: Biblioteca, Mercado y, en cuanto se pueda, el Ayuntamiento (como juega un buen jugador). */
const BUILD_PRIORITY_HARD: Record<Building, number> = { ...BUILD_PRIORITY, biblioteca: 11, mercado: 10, ayuntamiento: 13 };

function buildPriority(s: GameState, seat: Seat, b: Building, smart = false) {
  let v = (smart ? BUILD_PRIORITY_HARD : BUILD_PRIORITY)[b];
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
function buildChoice(s: GameState, seat: Seat, smart = false) {
  const p = s.players[seat];
  const market = hasBuilding(s, seat, 'mercado');
  const options = remainingBuildings(s, seat)
    .map((b) => ({ b, plan: canAfford(p.resources, BUILDING_COST[b]) ? [] : market ? conversionPlan(p.resources, BUILDING_COST[b]) : null }))
    .filter((x) => x.plan !== null) as Array<{ b: Building; plan: Array<{ give: Resource; get: Resource }> }>;
  return pickBest(options, (x) => buildPriority(s, seat, x.b, smart) - x.plan.length * (smart ? 0.3 : 0.8));
}

/** Recurso que más falta para el próximo edificio. */
function neededResource(s: GameState, seat: Seat, smart = false): Resource {
  const p = s.players[seat];
  const target = pickBest(remainingBuildings(s, seat), (b) => buildPriority(s, seat, b, smart));
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
      return { type: 'libraryChoice', resource: neededResource(s, seat, level === 'dificil') };
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
      if (level !== 'facil' && a === b && p.resources.agua < FAITH_COST * 2) use = false;
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
      if (level === 'dificil' && progress(s, pr.from) >= progress(s, seat) + 1) return { type: 'respondTrade', accept: false };
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
  humans: Set<Seat>; // asientos humanos (el difícil tiende a ir a por ellos)
  hunter: boolean; // esta máquina caza al humano
  alarm: boolean; // difícil: se siente amenazada y acumula defensa
}

function makePlan(s: GameState, seat: Seat, level: BotLevel, opts: BotOptions = {}): Plan {
  const smart = level === 'dificil';
  const humans = new Set(smart ? (opts.humans ?? []).filter((h) => h !== seat) : []);
  const hunter = smart && hunterSeat(opts) === seat;
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
      // Difícil: tendencia a ir a por el humano (mucha si es la cazadora)
      const prey = humans.has(x) ? (hunter ? 8 : 1.5) : 0;
      return -(walls * 1.5 + defenders * 0.8 + reach * 0.5) + prey;
    }) ?? null;
  const army = ownUnits(s, seat).length;
  const alarm = smart && threatLevel(s, seat) >= 3;
  const marching =
    p.conquests.length < VICTORY.conquests &&
    (level === 'dificil'
      ? p.buildings.length >= 4 || army >= 8
      : level === 'normal'
        ? p.buildings.length >= 4 || army >= 9
        : p.buildings.length >= 6 || army >= 12);
  const guards = new Set<string>();
  for (const { pos } of openSides(s, seat)) {
    const here = unitsAt(s, pos).filter((u) => u.owner === seat);
    if (here.length) guards.add(here[0].id);
  }
  return { target, marching, guards, humans, hunter, alarm };
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
    return (
      !isCapital(pos) && isLand(t) && !(type === 'artilleria' && t === 'montana') && (towerAt(s, pos) === null || towerAt(s, pos) === seat) && !unitsAt(s, pos).some((u) => u.owner !== seat)
    );
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

function attackOptions(s: GameState, seat: Seat, plan: Plan, smart = false): Scored[] {
  const out: Scored[] = [];
  const myOpen = openSides(s, seat).map((o) => o.pos);
  const leader = smart ? leaderOf(s, seat) : null;
  for (const u of ownUnits(s, seat)) {
    if (!canActivate(s, u) || !canAttackNow(s, u)) continue;
    // A25: todo el grupo del mismo tipo ataca por una sola activación
    const ids = [u.id, ...groupCandidates(s, u.id)];
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
      let killValue = UNIT_VALUE[t] + (near <= 1 ? 2.5 : near <= 2 ? 1 : 0) + (clearsTarget ? 2 : 0);
      if (smart) {
        const owner = unitsAt(s, pos)[0].owner;
        // Frena al que va ganando y aprovecha las pilas que se quedan con una sola figura
        if (owner === leader) killValue += 0.8;
        if (plan.humans.has(owner)) killValue += plan.hunter ? 1.2 : 0.4;
        if (unitsAt(s, pos).length === 1) killValue += 0.3;
      }
      const lossValue = canLose ? UNIT_VALUE[u.type] : 0;
      // Usar varias figuras cuesta activaciones: se descuenta un poco
      const value = w * killValue - l * lossValue - (n - 1) * 0.08;
      out.push({ action: { type: 'attack', unitIds: ids, target: pos }, value });
    }
    for (const pos of tg.towers) {
      const [w] = duel(n, 2);
      // Un Torreón enemigo cerca de la propia Capital o en el camino hacia la objetivo vale más
      const near = Math.min(...myOpen.map((p) => manhattan(p, pos)), 9);
      const value = w * (2.2 + (near <= 2 ? 1.5 : 0)) - (n - 1) * 0.08;
      out.push({ action: { type: 'attackTower', unitIds: ids, target: pos }, value });
    }
    for (const wl of tg.walls) {
      const art = u.type === 'artilleria';
      const [w, l] = art ? duel(2 + n - 1, 1) : duel(n, 2);
      let goal = wl.capital === plan.target ? 2.2 : 0.8;
      // Difícil: abrir brecha en una Capital aún por conquistar vale más (y más con grupo)
      if (smart && !s.players[seat].conquests.includes(wl.capital)) goal += 1.6 + (n - 1) * 0.5;
      const value = w * goal - (art ? l * UNIT_VALUE.artilleria : 0);
      out.push({ action: { type: 'attackWall', unitIds: ids, capital: wl.capital, side: wl.side }, value });
    }
  }
  if (canTowerAttack(s)) {
    const from = s.players[seat].tower!;
    for (const pos of towerTargets(s, seat)) {
      const d = manhattan(from, pos) as 1 | 2;
      const t = defenderBest(s, pos, 'arquero', 1, d);
      const m = unitsAt(s, pos).filter((x) => x.type === t).length;
      const [ba, bb] = baseDice('arquero', t, d);
      const [w, l] = duel(ba, bb + m - 1);
      const near = Math.min(...myOpen.map((p) => manhattan(p, pos)), 9);
      const lossValue = t === 'arquero' || t === 'artilleria' ? 3 : 0; // solo una tropa con alcance lo derriba
      const value = w * (UNIT_VALUE[t] + (near <= 1 ? 2.5 : near <= 2 ? 1 : 0)) - l * lossValue;
      out.push({ action: { type: 'towerAttack', target: pos }, value });
    }
  }
  return out;
}

function moveOptions(s: GameState, seat: Seat, plan: Plan, smart = false): Scored[] {
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
    // Difícil y amenazada: las tropas junto a la Capital se quedan a defenderla en vez de marchar
    const home = plan.alarm && manhattan(u.pos, CAPITALS[seat]) <= 2;
    const dist = plan.marching && !isGuard && !home ? distTo(u.type) : null;
    // Difícil: las figuras iguales de la loseta marchan juntas (A25, una sola activación)
    const acts = s.turn?.military?.activations ?? {};
    const mates =
      smart && dist && !acts[u.id]
        ? ownUnits(s, seat).filter((o) => o.id !== u.id && o.pos === u.pos && o.type === u.type && !acts[o.id] && !plan.guards.has(o.id))
        : [];
    for (const to of targets.keys()) {
      let value = 0;
      // Defensa: cubrir un lado abierto sin guardia
      if (unguarded.has(to)) value += 2 + threat * 0.6;
      if (home) {
        // Acumular defensa en los lados abiertos, sobre todo en el más amenazado
        const side = open.find((o) => o.pos === to);
        const fromSide = open.some((o) => o.pos === u.pos);
        if (side && !fromSide) value += 2.5 + sideDanger(s, seat, to);
        if (fromSide && !side) value -= 3;
      }
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
      if (smart && dist) {
        const room = MAX_STACK - (towerAt(s, to) === seat ? 1 : 0) - unitsAt(s, to).filter((x) => x.owner === seat).length - 1;
        const going = mates.slice(0, Math.max(0, room));
        const gain = dist[u.pos] - dist[to];
        if (going.length && Number.isFinite(gain) && gain > 0) {
          value += gain * 1.1 * going.length;
          out.push({ action: { type: 'move', unitId: u.id, to, with: going.map((o) => o.id) }, value });
          continue;
        }
        // Agrupar figuras del mismo tipo prepara ataques de grupo
        if (unitsAt(s, to).some((x) => x.owner === seat && x.type === u.type)) value += 0.6;
      }
      out.push({ action: { type: 'move', unitId: u.id, to }, value });
    }
  }
  return out;
}

function recruitChoice(s: GameState, seat: Seat, plan: Plan, r: Rand, smart = false): Action | null {
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
    if (smart) {
      // Contra las tropas rivales cercanas: el tipo con mejores duelos cuerpo a cuerpo
      const near = enemyUnits(s, seat).filter((e) => manhattan(e.pos, CAPITALS[seat]) <= 5);
      for (const e of near) {
        const [a, b] = baseDice(x, e.type, 1);
        v += (a - b) * 0.35;
      }
      // Arqueros y caballería en grupo son lo más eficaz; sumarse a figuras iguales permite atacar juntas
      if (x === 'arquero' || x === 'caballeria') v += 1.2;
      if (stackSpot(s, seat, x) !== undefined) v += 0.8;
    }
    return v;
  });
  if (!t) return null;
  const guardSpot = plan.alarm ? defenseSpot(s, seat, t) : undefined;
  return { type: 'recruit', unit: t, pos: guardSpot ?? (smart ? stackSpot(s, seat, t) : undefined) ?? bestSpot(s, seat, t, r) };
}

/** Lado abierto de la propia Capital más amenazado donde aún cabe una tropa de ese tipo. */
function defenseSpot(s: GameState, seat: Seat, type: UnitType): number | undefined {
  const spots = new Set(ringSpots(s, seat, type));
  const open = openSides(s, seat).filter((o) => spots.has(o.pos));
  return pickBest(open, (o) => sideDanger(s, seat, o.pos))?.pos;
}

/** Casilla del anillo donde ya hay figuras propias del mismo tipo y cabe otra (para formar grupos). */
function stackSpot(s: GameState, seat: Seat, type: UnitType): number | undefined {
  const spots = ringSpots(s, seat, type).filter((pos) => unitsAt(s, pos).some((u) => u.owner === seat && u.type === type));
  return pickBest(spots, (pos) => unitsAt(s, pos).filter((u) => u.type === type).length);
}

function wallChoice(s: GameState, seat: Seat, level: BotLevel): Action | null {
  const threat = threatLevel(s, seat);
  const p = s.players[seat];
  // Difícil: si un rival que aún no le ha conquistado está cerca de ganar, se amuralla igualmente
  const danger =
    level === 'dificil' &&
    SEATS.some((x) => x !== seat && !s.players[x].conquests.includes(seat) && s.players[x].conquests.length >= 1 && s.players[x].buildings.length >= 7);
  // Sin amenaza, solo si ya no le quedan edificios que construir pronto
  const nearBuilding = remainingBuildings(s, seat).length > 0 && p.buildings.length < 8;
  if (threat === 0 && nearBuilding && !danger) return null;
  if (level === 'facil' && threat < 3) return null;
  const sides = SIDES.filter((side) => isLand(s.cells[sideCell(seat, side)].terrain) && wallBuildCheck(s, seat, side).ok);
  const best = pickBest(sides, (side) => {
    const pos = sideCell(seat, side);
    const nearEnemy = Math.min(9, ...enemyUnits(s, seat).map((e) => manhattan(e.pos, pos)));
    return (wallBuildCheck(s, seat, side).repair ? 1 : 0) - nearEnemy;
  });
  return best ? { type: 'buildWall', side: best } : null;
}

/** Torreón en la casilla con más enemigos al alcance (o null si no conviene o no se puede). */
function towerChoice(s: GameState, seat: Seat, smart: boolean, sloppy: boolean, r: Rand): Action | null {
  const p = s.players[seat];
  const spots = towerBuildSpots(s, seat);
  if (!spots.length || !canAfford(p.resources, TOWER_COST) || (sloppy && r() < 0.5)) return null;
  const myCap = CAPITALS[seat];
  const best = pickBest(spots, (pos) => {
    const enemies = enemyUnits(s, seat).filter((e) => manhattan(e.pos, pos) <= 2).length;
    return enemies * 2 + (manhattan(pos, myCap) <= 3 ? 1 : 0) + r() * 0.3;
  })!;
  const worth = smart || enemyUnits(s, seat).some((e) => manhattan(e.pos, best) <= 3) || p.buildings.length >= 8;
  return worth ? { type: 'buildTower', pos: best } : null;
}

function phase2(s: GameState, seat: Seat, level: BotLevel, r: Rand, opts: BotOptions = {}): Action | null {
  if (s.prompt) return s.prompt.seat === seat ? answerPrompt(s, seat, level, r) : null;
  if (s.combat || s.turn?.seat !== seat) return null;
  const p = s.players[seat];
  const t = s.turn!;
  const plan = makePlan(s, seat, level, opts);
  const sloppy = level === 'facil';
  const smart = level === 'dificil';

  // 1. Conquistar si se puede (puede dar la victoria)
  for (const u of ownUnits(s, seat)) {
    if (!canActivate(s, u)) continue;
    const caps = attackTargets(s, u.id).capitals;
    if (caps.length) return { type: 'conquer', unitId: u.id, capital: caps[0] };
  }

  // 1b. Difícil y amenazada: primero las Murallas
  if (canUseCivil(s) && plan.alarm) {
    const wall = wallChoice(s, seat, level);
    if (wall) return wall;
  }

  // 2. Construir (con conversiones del Mercado si hacen falta)
  if (canUseCivil(s)) {
    const choice = buildChoice(s, seat, smart);
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

  // 2c. Torreón: cuando ya no hay edificio asequible
  if (canUseCivil(s)) {
    const tower = towerChoice(s, seat, smart, sloppy, r);
    if (tower) return tower;
  }

  // 3. Acción militar
  if (canUseMilitary(s)) {
    const started = !!t.military;
    const threat = threatLevel(s, seat);
    const attacks = attackOptions(s, seat, plan, smart);
    const moves = moveOptions(s, seat, plan, smart);
    const thresholdAttack = sloppy ? 0.25 : smart ? 0.05 : 0.12;
    let best = pickBest([...attacks.filter((a) => a.value > thresholdAttack), ...moves.filter((m) => m.value > 0.5)], (x) => x.value + (sloppy ? r() * 1.5 : r() * 0.05));
    if (sloppy && best && r() < 0.2) best = undefined;

    // A21: se puede reclutar 1 tropa y además activar hasta 2 (recluta primero, si conviene)
    if (canRecruitNow(s)) {
      const army = ownUnits(s, seat).length;
      const wantArmy =
        (threat > 0 && openSides(s, seat).length > 0 && army < 20) ||
        army < (sloppy ? 4 : 6) ||
        (plan.marching && army < 12);
      const civilLeft = canUseCivil(s) && !hasBuilding(s, seat, 'ayuntamiento');
      const savingForBuild = civilLeft && remainingBuildings(s, seat).some((b) => {
        // Le falta poco para un edificio: mejor no gastar
        const cost = BUILDING_COST[b];
        return RESOURCES.reduce((n, x) => n + Math.max(0, cost[x] - p.resources[x]), 0) <= 2;
      });
      // Un gran ataque de 3 figuras vale más que reclutar (reclutar deja solo 2 activaciones)
      const bigAttack = (best?.value ?? 0) >= 2.5 && best?.action.type === 'attack' && best.action.unitIds.length >= 3;
      if ((wantArmy && !savingForBuild && !bigAttack) || (plan.alarm && !bigAttack && army < 20)) {
        const rec = recruitChoice(s, seat, plan, r, smart);
        if (rec) return rec;
      }
    }
    if (best?.action.type === 'move' && best.action.with) {
      // Por si alguna compañera no puede llegar: entonces se mueve sola
      try {
        applyAction(s, seat, best.action);
      } catch {
        const { with: _w, ...single } = best.action;
        return single;
      }
    }
    if (best) return best.action;
    if (started && t.military?.open) return { type: 'endMilitary' };
  }

  // 4. Construir después de la acción militar (con Ayuntamiento)
  if (canUseCivil(s)) {
    const choice = buildChoice(s, seat, smart);
    if (choice) return choice.plan.length ? { type: 'convert', ...choice.plan[0] } : { type: 'build', building: choice.b };
  }
  return { type: 'endTurn' };
}
