// Juego automático aleatorio de la Fase I (tests y simulaciones de robustez).
import {
  BUILDINGS,
  BUILDING_COST,
  MAX_PER_TYPE,
  MAX_STACK,
  MAX_WALLS,
  RESOURCES,
  RINGS,
  SEATS,
  SIDES,
  UNIT_COST,
  UNIT_TYPES,
  applyAction,
  activationLimit,
  towerBuildSpots,
  canTowerAttack,
  towerTargets,
  isCapitalSide,
  canRecruitNow,
  wallBuildCheck,
  CONVERT_RATE,
  attackTargets,
  chooseAction,
  pendingSeats,
  type BotLevel,
  canActivate,
  canAfford,
  canUseCivil,
  canUseMilitary,
  capitalsConnectable,
  createGame,
  exchangeOptions,
  groupCandidates,
  hasBuilding,
  initialPlacements,
  isCapital,
  isLand,
  isUnlocked,
  legalPlacements,
  moveTargets,
  ringSpots,
  unitCount,
  unitsAt,
} from './index';
import type { Action, GameState, Seat } from './types';

export const TEST_PLAYERS = [
  { seat: 0 as Seat, name: 'Rojo', color: 'rojo' as const },
  { seat: 1 as Seat, name: 'Azul', color: 'azul' as const },
  { seat: 2 as Seat, name: 'Amarillo', color: 'amarillo' as const },
  { seat: 3 as Seat, name: 'Verde', color: 'verde' as const },
];

export function lcg(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
export const pick = <T>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

/** Resuelve la cola de recompensas de un jugador con elecciones aleatorias. */
export function resolveQueue(s: GameState, seat: Seat, r: () => number): GameState | null {
  const q = s.players[seat].rewardQueue[0];
  if (!q) return null;
  let a: Action;
  if (q.kind === 'choose') a = { type: 'chooseReward', option: pick(r, q.options) };
  else if (q.kind === 'deploy') a = { type: 'deployUnit', pos: pick(r, ringSpots(s, seat, q.unit)) };
  else a = { type: 'placeWall', side: pick(r, SIDES.filter((x) => !s.players[seat].originalWalls.includes(x))) };
  return applyAction(s, seat, a);
}

export function playPhase1(seed: number): GameState {
  const r = lcg(seed);
  let s = createGame(TEST_PLAYERS, seed);
  let guard = 0;
  while (s.phase === 'PHASE_1') {
    if (++guard > 5000) throw new Error('bucle');
    if (s.step === 'INITIAL_PLACEMENT') {
      for (const p of s.players) {
        const next = resolveQueue(s, p.seat, r);
        if (next) {
          s = next;
          continue;
        }
        if (p.initialTiles.length) {
          const t = pick(r, p.initialTiles);
          s = applyAction(s, p.seat, { type: 'placeInitial', terrain: t, pos: pick(r, initialPlacements(s, p.seat, t)) });
        }
      }
    } else if (s.step === 'PILE_PLACEMENT') {
      const seat = s.order[s.current];
      const next = resolveQueue(s, seat, r);
      if (next) s = next;
      else s = applyAction(s, seat, { type: 'placeTile', pos: pick(r, legalPlacements(s, seat, s.pile[0])) });
    } else if (s.step === 'EXCHANGE') {
      const seat = s.order[s.current];
      const o = pick(r, exchangeOptions(s, seat, s.exchangeTile!));
      s = applyAction(s, seat, { type: 'exchange', from: o.from, to: o.to });
    } else if (s.step === 'FINAL_DEPLOY') {
      const p = s.players.find((x) => x.reserve.length)!;
      s = applyAction(s, p.seat, { type: 'deployReserve', index: 0, pos: pick(r, ringSpots(s, p.seat, p.reserve[0])) });
    } else throw new Error('Estado inesperado ' + s.step);
  }
  return s;
}


// ---------------------------------------------------------------------------------------------
// Partida completa con jugadores aleatorios (Fase I + Fase II) y comprobación de invariantes.
// ---------------------------------------------------------------------------------------------

/** Comprueba que el estado respeta los límites del reglamento. Devuelve la lista de problemas. */
export function checkInvariants(s: GameState): string[] {
  const out: string[] = [];
  for (const p of s.players) {
    for (const r of RESOURCES) if (p.resources[r] < 0 || !Number.isInteger(p.resources[r])) out.push(`${p.name}: ${r}=${p.resources[r]}`);
    if (new Set(p.buildings).size !== p.buildings.length) out.push(`${p.name}: edificio repetido`);
    if (p.walls.some((w) => !p.originalWalls.includes(w))) out.push(`${p.name}: Muralla no original`);
    if (p.originalWalls.length > MAX_WALLS || new Set(p.originalWalls).size !== p.originalWalls.length) out.push(`${p.name}: Murallas originales`);
    if (new Set(p.conquests).size !== p.conquests.length || p.conquests.includes(p.seat)) out.push(`${p.name}: Conquistas`);
    for (const t of UNIT_TYPES) if (unitCount(s, p.seat, t) > MAX_PER_TYPE) out.push(`${p.name}: más de 5 ${t}`);
  }
  const ids = new Set<string>();
  for (const u of s.units) {
    if (ids.has(u.id)) out.push(`id repetido ${u.id}`);
    ids.add(u.id);
    const t = s.cells[u.pos]?.terrain;
    if (isCapital(u.pos) || !isLand(t)) out.push(`${u.id} en casilla no terrestre ${u.pos}`);
    if (u.type === 'artilleria' && t === 'montana') out.push(`${u.id} Artillería en Montaña`);
  }
  for (let pos = 0; pos < 64; pos++) {
    const here = unitsAt(s, pos);
    if (here.length > MAX_STACK) out.push(`más de 3 tropas en ${pos}`);
    if (new Set(here.map((u) => u.owner)).size > 1) out.push(`tropas enemigas juntas en ${pos}`);
  }
  if (s.phase === 'PHASE_2' || s.phase === 'GAME_OVER') {
    if (s.cells.some((c, i) => !isCapital(i) && c.terrain === null)) out.push('casilla vacía en Fase II');
    if (!capitalsConnectable(s.cells)) out.push('Capitales sin conexión terrestre');
    for (const seat of SEATS) if (RINGS[seat].filter((i) => s.cells[i].terrain === 'agua').length !== 1) out.push(`anillo ${seat} sin exactamente 1 Agua`);
  }
  if (s.combat && !s.prompt) out.push('combate abierto sin decisión pendiente');
  for (const p of s.players) {
    if (p.tower == null) continue;
    // A28: solo guarnición propia y como mucho 2 tropas (el Torreón ocupa 1 plaza)
    const garrison = unitsAt(s, p.tower);
    if (garrison.some((u) => u.owner !== p.seat)) out.push(`${p.name}: tropas enemigas sobre el Torreón`);
    if (garrison.length > 2) out.push(`${p.name}: más de 2 tropas en la loseta del Torreón`);
    if (isCapitalSide(p.tower) || isCapital(p.tower) || !isLand(s.cells[p.tower].terrain)) out.push(`${p.name}: Torreón en casilla no válida`);
    if (s.players.some((o) => o !== p && o.tower === p.tower)) out.push('dos Torreones en la misma casilla');
  }
  return out;
}

export type Candidate = { seat: Seat; action: Action };

/** Todas las acciones que la interfaz ofrecería ahora mismo en la Fase II. */
export function phase2Candidates(s: GameState, r: () => number): Candidate[] {
  const pr = s.prompt;
  if (pr) {
    const seat = pr.seat;
    switch (pr.kind) {
      case 'library':
        return RESOURCES.map((resource) => ({ seat, action: { type: 'libraryChoice', resource } }));
      case 'defenderChoice':
        return pr.options.map((unit) => ({ seat, action: { type: 'defenderChoice', unit } }));
      case 'faith':
        return [true, false].map((use) => ({ seat, action: { type: 'faith', use } }));
      case 'advance':
        return [true, false].map((accept) => ({ seat, action: { type: 'advance', accept } }));
      case 'trade':
        return [true, false].map((accept) => ({ seat, action: { type: 'respondTrade', accept } }));
    }
  }
  const t = s.turn!;
  const seat = t.seat;
  const p = s.players[seat];
  const out: Candidate[] = [{ seat, action: { type: 'endTurn' } }];
  const add = (action: Action) => out.push({ seat, action });
  if (canUseCivil(s))
    for (const b of BUILDINGS)
      if (!p.buildings.includes(b) && !(b === 'ayuntamiento' && p.buildings.length < 2) && canAfford(p.resources, BUILDING_COST[b]))
        add({ type: 'build', building: b });
  if (canUseCivil(s)) for (const side of SIDES) if (wallBuildCheck(s, seat, side).ok) add({ type: 'buildWall', side });
  if (canUseCivil(s)) for (const pos of towerBuildSpots(s, seat)) add({ type: 'buildTower', pos });
  if (canTowerAttack(s)) for (const target of towerTargets(s, seat)) add({ type: 'towerAttack', target });
  if (canRecruitNow(s))
    for (const u of UNIT_TYPES)
      if (isUnlocked(s, seat, u) && unitCount(s, seat, u) < MAX_PER_TYPE && canAfford(p.resources, UNIT_COST[u]))
        for (const pos of ringSpots(s, seat, u)) add({ type: 'recruit', unit: u, pos });
  if (t.military?.open) add({ type: 'endMilitary' });
  for (const u of s.units.filter((x) => x.owner === seat)) {
    if (!canActivate(s, u)) continue;
    for (const to of moveTargets(s, u.id).keys()) add({ type: 'move', unitId: u.id, to });
    const tg = attackTargets(s, u.id);
    const acts = Object.keys(s.turn?.military?.activations ?? {}).length;
    const group = groupCandidates(s, u.id).filter(() => r() < 0.6);
    const ids = [u.id];
    for (const g of group) {
      const fresh = [...ids, g].filter((id) => !s.turn?.military?.activations[id]).length;
      if (acts + fresh <= activationLimit(s)) ids.push(g);
    }
    for (const target of tg.troops) add({ type: 'attack', unitIds: ids, target });
    for (const w of tg.walls) add({ type: 'attackWall', unitIds: ids, capital: w.capital, side: w.side });
    for (const target of tg.towers) add({ type: 'attackTower', unitIds: ids, target });
    for (const capital of tg.capitals) add({ type: 'conquer', unitId: u.id, capital });
  }
  if (hasBuilding(s, seat, 'mercado')) {
    for (const give of RESOURCES)
      if (p.resources[give] >= CONVERT_RATE) for (const get of RESOURCES) if (get !== give) add({ type: 'convert', give, get });
    if (!t.tradeDone)
      for (const to of SEATS)
        if (to !== seat)
          for (const g of RESOURCES)
            for (const rc of RESOURCES)
              if (p.resources[g] >= 1 && s.players[to].resources[rc] >= 1) {
                const give = { comida: 0, madera: 0, piedra: 0, agua: 0, [g]: 1 };
                const receive = { comida: 0, madera: 0, piedra: 0, agua: 0, [rc]: 1 };
                add({ type: 'proposeTrade', to, give, receive });
              }
  }
  return out;
}

const WEIGHT: Partial<Record<Action['type'], number>> = {
  conquer: 1000,
  build: 60,
  buildWall: 3,
  buildTower: 2,
  towerAttack: 10,
  attackTower: 10,
  attack: 12,
  attackWall: 12,
  recruit: 6,
  move: 4,
  convert: 0.4,
  proposeTrade: 0.05,
  endMilitary: 1,
  endTurn: 1,
};

function weightedPick(r: () => number, cands: Candidate[]): Candidate {
  const w = cands.map((c) => WEIGHT[c.action.type] ?? 1);
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) if ((x -= w[i]) <= 0) return cands[i];
  return cands.at(-1)!;
}

export interface GameReport {
  state: GameState;
  actions: number;
  turns: number;
  problems: string[];
}

/** Juega una partida completa. Cada acción que la interfaz ofrecería debe ser aceptada por el motor. */
export function playGame(seed: number, maxTurns = 600): GameReport {
  const r = lcg(seed * 7919 + 1);
  let s = playPhase1(seed);
  const problems = checkInvariants(s).map((x) => 'fin de Fase I: ' + x);
  let actions = 0;
  while (s.phase === 'PHASE_2' && s.turnNumber <= maxTurns) {
    const cands = phase2Candidates(s, r);
    const c = weightedPick(r, cands);
    try {
      s = applyAction(s, c.seat, c.action);
    } catch (e) {
      problems.push(`turno ${s.turnNumber}: acción ofrecida rechazada ${JSON.stringify(c.action)}: ${(e as Error).message}`);
      // Para no quedar en bucle, termina el turno si se puede.
      if (s.prompt || s.combat) break;
      s = applyAction(s, s.turn!.seat, { type: 'endTurn' });
    }
    actions++;
    const bad = checkInvariants(s);
    if (bad.length) {
      problems.push(...bad.map((x) => `turno ${s.turnNumber} tras ${c.action.type}: ${x}`));
      break;
    }
  }
  return { state: s, actions, turns: s.turnNumber, problems };
}

// ---------------------------------------------------------------------------------------------
// Partidas entre jugadores máquina
// ---------------------------------------------------------------------------------------------

/** 'humano' juega como una máquina normal, pero las difíciles lo tratan como humano. */
export type SimPlayer = BotLevel | 'azar' | 'humano';

export interface BotReport {
  state: GameState;
  turns: number;
  winner: Seat | null;
  problems: string[];
}

/** Juega una partida completa (Fase I incluida) con un tipo de jugador por asiento. */
export function playBots(seed: number, players: SimPlayer[], maxTurns = 2000): BotReport {
  const r = lcg(seed * 104729 + 7);
  let s = createGame(TEST_PLAYERS, seed);
  const problems: string[] = [];
  let guard = 0;
  const seatsOf = (k: SimPlayer) => players.flatMap((x, i) => (x === k ? [i as Seat] : []));
  const opts = { humans: seatsOf('humano'), hardBots: seatsOf('dificil') };
  while (s.phase !== 'GAME_OVER' && s.turnNumber <= maxTurns) {
    if (++guard > 200000) {
      problems.push('demasiadas acciones');
      break;
    }
    const seats = pendingSeats(s);
    if (!seats.length) {
      problems.push(`nadie puede actuar en ${s.phase}/${s.step}`);
      break;
    }
    const seat = seats[Math.floor(r() * seats.length)];
    const kind = players[seat];
    let action: Action | null;
    if (kind === 'azar') {
      if (s.phase === 'PHASE_1') {
        const next = resolveQueue(s, seat, r) ?? phase1Random(s, seat, r);
        if (!next) {
          problems.push('azar sin acción en Fase I');
          break;
        }
        s = next;
        continue;
      }
      action = weightedPick(r, phase2Candidates(s, r)).action;
    } else action = chooseAction(s, seat, kind === 'humano' ? 'normal' : kind, r, opts);
    if (!action) {
      problems.push(`máquina ${kind} sin acción con decisión pendiente (${s.phase}/${s.step}, prompt ${s.prompt?.kind})`);
      break;
    }
    try {
      s = applyAction(s, seat, action);
    } catch (e) {
      problems.push(`turno ${s.turnNumber}: ${kind} propone ${JSON.stringify(action)} y el motor lo rechaza: ${(e as Error).message}`);
      break;
    }
    const bad = checkInvariants(s);
    if (bad.length) {
      problems.push(...bad);
      break;
    }
  }
  return { state: s, turns: s.turnNumber, winner: s.winner, problems };
}

function phase1Random(s: GameState, seat: Seat, r: () => number): GameState | null {
  const p = s.players[seat];
  const ri = p.reserve.findIndex((t) => ringSpots(s, seat, t).length);
  if (ri >= 0) return applyAction(s, seat, { type: 'deployReserve', index: ri, pos: pick(r, ringSpots(s, seat, p.reserve[ri])) });
  if (s.step === 'INITIAL_PLACEMENT' && p.initialTiles.length) {
    const t = pick(r, p.initialTiles);
    return applyAction(s, seat, { type: 'placeInitial', terrain: t, pos: pick(r, initialPlacements(s, seat, t)) });
  }
  if (s.step === 'PILE_PLACEMENT') return applyAction(s, seat, { type: 'placeTile', pos: pick(r, legalPlacements(s, seat, s.pile[0])) });
  if (s.step === 'EXCHANGE') {
    const o = pick(r, exchangeOptions(s, seat, s.exchangeTile!));
    return applyAction(s, seat, { type: 'exchange', from: o.from, to: o.to });
  }
  return null;
}
