// Motor de IMPERIO: creación de partida y aplicación de acciones.
// Todas las acciones se validan aquí; el servidor es la única autoridad que las aplica.
import {
  activationOf,
  activeSeat,
  attackAvailable,
  attackTargets,
  baseDice,
  canActivate,
  canAttackNow,
  canUseCivil,
  canUseMilitary,
  hasBuilding,
  isUnlocked,
  moveTargets,
  stepsLeft,
  unitById,
} from './military';
import { canStand, exchangeOptions, initialPlacements, legalPlacements, ringSpots, unitsAt } from './phase1';
import {
  BUILDING_COST,
  CAPITALS,
  INITIAL_TILES,
  MAX_PER_TYPE,
  MAX_WALLS,
  NAMES,
  PILE_COMPOSITION,
  PILE_PLACEMENTS,
  RESOURCES,
  RINGS,
  SEATS,
  SIDES,
  TERRAIN_RESOURCE,
  UNIT_COST,
  UNIT_TYPES,
  canAfford,
  coordLabel,
  emptyResources,
  isLand,
  manhattan,
  pay,
  ringOwner,
} from './rules';
import { rollD6, rollDice, shuffle } from './rng';
import type {
  Action,
  Color,
  Combat,
  GameState,
  Resources,
  RewardItem,
  Seat,
  Terrain,
  UnitType,
} from './types';

export class RuleError extends Error {}
function fail(msg: string): never {
  throw new RuleError(msg);
}

export interface NewPlayer {
  seat: Seat;
  name: string;
  color: Color;
}

const pname = (s: GameState, seat: Seat) => s.players[seat].name;

function log(s: GameState, text: string, seat?: Seat) {
  s.log.push({ n: (s.log.at(-1)?.n ?? 0) + 1, text, seat, ts: Date.now() });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

// ---------------------------------------------------------------------------------------------
// Creación y primer jugador (§4)
// ---------------------------------------------------------------------------------------------

export function createGame(players: NewPlayer[], seed: number): GameState {
  if (players.length !== 4) fail('Se necesitan exactamente 4 jugadores.');
  if (new Set(players.map((p) => p.seat)).size !== 4) fail('Cada jugador debe ocupar una Capital distinta.');
  if (new Set(players.map((p) => p.color)).size !== 4) fail('Cada jugador debe tener un color distinto.');

  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const s: GameState = {
    phase: 'SETUP',
    step: 'FIRST_PLAYER',
    players: sorted.map((p) => ({
      seat: p.seat,
      name: p.name,
      color: p.color,
      resources: emptyResources(),
      buildings: [],
      conquests: [],
      walls: [],
      originalWalls: [],
      initialTiles: [...INITIAL_TILES],
      placementsLeft: PILE_PLACEMENTS,
      rewardQueue: [],
      reserve: [],
      faithTurn: null,
    })),
    order: [0, 1, 2, 3],
    current: 0,
    turnNumber: 0,
    cells: Array.from({ length: 64 }, () => ({ terrain: null, placedBy: null })),
    units: [],
    pile: [],
    exchangeTile: null,
    firstPlayerRolls: [],
    turn: null,
    prompt: null,
    combat: null,
    lastCombat: null,
    winner: null,
    log: [],
    nextUnitId: 1,
    rng: seed | 0,
  };

  for (const t of Object.keys(PILE_COMPOSITION) as Terrain[])
    for (let i = 0; i < PILE_COMPOSITION[t]; i++) s.pile.push(t);
  shuffle(s, s.pile);

  // §4: todos tiran 1d6; los empates se repiten solo entre los empatados. Después, sentido horario.
  let contenders: Seat[] = [...SEATS];
  for (;;) {
    const rolls: Partial<Record<Seat, number>> = {};
    for (const seat of contenders) rolls[seat] = rollD6(s);
    s.firstPlayerRolls.push(rolls);
    log(s, 'Tirada de primer jugador: ' + contenders.map((c) => `${pname(s, c)} ${rolls[c]}`).join(' · '));
    const max = Math.max(...contenders.map((c) => rolls[c]!));
    contenders = contenders.filter((c) => rolls[c] === max);
    if (contenders.length === 1) break;
    log(s, 'Empate: repiten ' + contenders.map((c) => pname(s, c)).join(', '));
  }
  const first = contenders[0];
  s.order = [0, 1, 2, 3].map((k) => ((first + k) % 4) as Seat);
  log(s, `Empieza ${pname(s, first)}. Orden de turno (horario): ${s.order.map((x) => pname(s, x)).join(' → ')}`);

  s.phase = 'PHASE_1';
  s.step = 'INITIAL_PLACEMENT';
  log(s, 'Fase I — Creación del Mundo. Cada jugador coloca a la vez sus 4 losetas iniciales en su anillo.');
  return s;
}

// ---------------------------------------------------------------------------------------------
// Utilidades de estado
// ---------------------------------------------------------------------------------------------

function gain(s: GameState, seat: Seat, t: Terrain) {
  s.players[seat].resources[TERRAIN_RESOURCE[t]] += 1;
}

function addUnit(s: GameState, owner: Seat, type: UnitType, pos: number) {
  s.units.push({ id: `u${s.nextUnitId++}`, owner, type, pos });
}

/** Unidades del tipo que tiene o va a tener el jugador (vivas + reserva + cola). */
export function unitCount(s: GameState, seat: Seat, type: UnitType) {
  const p = s.players[seat];
  return (
    s.units.filter((u) => u.owner === seat && u.type === type).length +
    p.reserve.filter((t) => t === type).length +
    p.rewardQueue.filter((r) => r.kind === 'deploy' && r.unit === type).length
  );
}
const underLimit = (s: GameState, seat: Seat, type: UnitType) => unitCount(s, seat, type) < MAX_PER_TYPE;

function wallsCommitted(s: GameState, seat: Seat) {
  const p = s.players[seat];
  return p.originalWalls.length + p.rewardQueue.filter((r) => r.kind === 'wall').length;
}

// ---------------------------------------------------------------------------------------------
// Fase I — recompensas militares (§19–23)
// ---------------------------------------------------------------------------------------------

function rewardFromChoice(option: UnitType | 'muralla'): RewardItem {
  return option === 'muralla' ? { kind: 'wall' } : { kind: 'deploy', unit: option };
}

function pushReward(s: GameState, seat: Seat, t: Terrain) {
  const p = s.players[seat];
  let options: Array<UnitType | 'muralla'> = [];
  if (t === 'llanura') options = ['infanteria'];
  if (t === 'bosque') options = ['arquero', 'lancero'];
  if (t === 'montana') options = ['muralla', 'artilleria'];
  const possible = options.filter((o) =>
    o === 'muralla' ? wallsCommitted(s, seat) < MAX_WALLS : underLimit(s, seat, o),
  );
  if (!possible.length) {
    log(s, `${p.name} no puede recibir la recompensa de ${NAMES.terrain[t]} (límites alcanzados).`, seat);
    return;
  }
  if (possible.length === 1 && options.length > 1)
    log(s, `${p.name}: solo es posible ${possible[0] === 'muralla' ? 'Muralla' : NAMES.unit[possible[0]]}.`, seat);
  p.rewardQueue.push(
    possible.length === 1 ? rewardFromChoice(possible[0]) : { kind: 'choose', from: t, options: possible },
  );
  normalizeQueue(s, seat);
}

/** Aclaración 4: la tropa sin posición legal al recibirla queda en reserva para desplegarla después. */
function normalizeQueue(s: GameState, seat: Seat) {
  const p = s.players[seat];
  for (;;) {
    const front = p.rewardQueue[0];
    if (front?.kind === 'deploy' && ringSpots(s, seat, front.unit).length === 0) {
      p.rewardQueue.shift();
      p.reserve.push(front.unit);
      log(s, `${p.name}: ${NAMES.unit[front.unit]} sin casilla legal ahora; queda en reserva.`, seat);
      continue;
    }
    break;
  }
}

function afterReward(s: GameState, seat: Seat) {
  if (s.step === 'INITIAL_PLACEMENT') return checkInitialDone(s);
  if (s.step === 'PILE_PLACEMENT' && seat === activeSeat(s) && !s.players[seat].rewardQueue.length)
    endPileTurn(s);
}

// ---------------------------------------------------------------------------------------------
// Fase I — flujo
// ---------------------------------------------------------------------------------------------

function checkInitialDone(s: GameState) {
  if (s.players.some((p) => p.initialTiles.length || p.rewardQueue.length)) return;
  s.step = 'PILE_PLACEMENT';
  s.current = 0;
  log(s, 'Losetas iniciales colocadas. Empiezan los turnos con la pila común (11 losetas por jugador).');
  startPileTurn(s);
}

/** §8, §14, §15 (aclaración 5), §16. */
function startPileTurn(s: GameState) {
  const seat = activeSeat(s);
  const n = s.pile.length;
  let tried = 0;
  while (tried < n && legalPlacements(s, seat, s.pile[0]).length === 0) {
    s.pile.push(s.pile.shift()!);
    tried++;
  }
  if (tried > 0 && tried < n)
    log(s, `${tried} loseta(s) sin posición legal para ${pname(s, seat)} pasan al fondo de la pila.`, seat);
  if (tried < n) {
    s.step = 'PILE_PLACEMENT';
    return;
  }
  // Bloqueo absoluto → intercambio de emergencia.
  for (let i = 0; i < s.pile.length; i++) {
    if (exchangeOptions(s, seat, s.pile[i]).length) {
      s.exchangeTile = s.pile.splice(i, 1)[0];
      s.step = 'EXCHANGE';
      log(s, `Bloqueo absoluto: ${pname(s, seat)} debe hacer un intercambio de emergencia con ${NAMES.terrain[s.exchangeTile]}.`, seat);
      return;
    }
  }
  s.step = 'BLOCKED';
  log(s, 'Bloqueo sin solución: ninguna loseta puede colocarse ni mediante intercambio. Situación no cubierta por el reglamento.');
}

function endPileTurn(s: GameState) {
  if (s.players.every((p) => p.placementsLeft === 0)) return endPhase1(s);
  do s.current = (s.current + 1) % 4;
  while (s.players[activeSeat(s)].placementsLeft === 0);
  startPileTurn(s);
}

function endPhase1(s: GameState) {
  log(s, 'Las 60 losetas están colocadas. Fin de la Fase I.');
  s.step = 'FINAL_DEPLOY';
  checkFinalDeploy(s);
}

/** Tropas en reserva: se despliegan si tienen casilla; si no, no se reciben (§20). */
function checkFinalDeploy(s: GameState) {
  for (const p of s.players) {
    p.reserve = p.reserve.filter((t) => {
      if (ringSpots(s, p.seat, t).length) return true;
      log(s, `${p.name}: ${NAMES.unit[t]} no tiene posición legal y no se recibe.`, p.seat);
      return false;
    });
  }
  if (s.players.some((p) => p.reserve.length)) return;
  s.phase = 'PHASE_2';
  s.step = 'TURN';
  s.current = 0;
  for (const c of s.cells) c.placedBy = null; // §9: al comenzar la Fase II ninguna loseta pertenece a nadie
  log(s, 'Fase II — El Imperio.');
  startTurn(s);
}

// ---------------------------------------------------------------------------------------------
// Fase II — turno
// ---------------------------------------------------------------------------------------------

function startTurn(s: GameState) {
  s.turnNumber++;
  const seat = activeSeat(s);
  const p = s.players[seat];
  s.turn = { seat, civilUsed: false, militaryUsed: false, military: null, tradeDone: false };
  // §25: producción del anillo
  const got = emptyResources();
  for (const pos of RINGS[seat]) {
    const t = s.cells[pos].terrain;
    if (t) got[TERRAIN_RESOURCE[t]]++;
  }
  for (const r of RESOURCES) p.resources[r] += got[r];
  log(
    s,
    `Turno ${s.turnNumber} — ${p.name}. Producción: ` +
      RESOURCES.filter((r) => got[r])
        .map((r) => `+${got[r]} ${NAMES.resource[r]}`)
        .join(', '),
    seat,
  );
  // §26: Biblioteca construida antes del comienzo del turno
  if (hasBuilding(s, seat, 'biblioteca')) s.prompt = { kind: 'library', seat };
}

function requireTurn(s: GameState, seat: Seat) {
  if (s.phase !== 'PHASE_2' || !s.turn) fail('No es la fase de turnos.');
  if (s.turn!.seat !== seat) fail('No es tu turno.');
  if (s.prompt || s.combat) fail('Hay una decisión pendiente.');
}

function ensureMilitary(s: GameState) {
  const t = s.turn!;
  if (!t.military) {
    t.military = { open: true, activations: {}, archerShots: [] };
    t.militaryUsed = true;
  }
  return t.military;
}

function activate(s: GameState, unitId: string) {
  const m = ensureMilitary(s);
  const u = unitById(s, unitId)!;
  if (!m.activations[unitId]) m.activations[unitId] = activationOf(s, u);
  return m.activations[unitId];
}

function maybeCloseMilitary(s: GameState) {
  const m = s.turn?.military;
  if (!m || !m.open) return;
  const ids = Object.keys(m.activations);
  if (ids.length < 3) return;
  const allDone = ids.every((id) => {
    const u = unitById(s, id);
    if (!u) return true;
    const a = m.activations[id];
    return a.done || (stepsLeft(s, u, a) === 0 && !(attackAvailable(s, u, a) && isUnlocked(s, u.owner, u.type)));
  });
  if (allDone) {
    m.open = false;
    log(s, 'Acción militar completada.', s.turn!.seat);
  }
}

function checkVictory(s: GameState, seat: Seat) {
  const p = s.players[seat];
  if (p.buildings.length === 8 && p.conquests.length >= 1) {
    s.phase = 'GAME_OVER';
    s.step = 'END';
    s.winner = seat;
    s.prompt = null;
    log(s, `¡${p.name} completa 8 edificios y tiene ${p.conquests.length} Conquista(s): gana IMPERIO!`, seat);
  }
}

// ---------------------------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------------------------

const faithEligible = (s: GameState, seat: Seat) => {
  const p = s.players[seat];
  return hasBuilding(s, seat, 'iglesia') && p.resources.agua >= 1 && p.faithTurn !== s.turnNumber;
};

function rollCombat(s: GameState) {
  const c = s.combat!;
  const n = c.attackerUnits.length;
  let a: number, b: number;
  if (c.target.kind === 'troops') {
    const pos = c.target.pos;
    const m = unitsAt(s, pos).filter((u) => u.type === c.defenderType).length;
    const [ba, bb, canLose] = baseDice(c.attackerType, c.defenderType!, c.distance);
    a = ba + n - 1; // §59
    b = bb + m - 1;
    c.attackerCanLose = canLose;
  } else if (c.attackerType === 'artilleria') {
    a = 2 + n - 1; // §101
    b = 1;
    c.attackerCanLose = true; // §102
  } else {
    a = 1 + n - 1; // §103–104
    b = 2;
    c.attackerCanLose = false; // aclaración 12: tropa contra Muralla sin derrota
  }
  c.attackerDice = rollDice(s, a);
  c.defenderDice = rollDice(s, b);
  combatStage(s, 'attacker');
}

function combatStage(s: GameState, stage: 'attacker' | 'defender' | 'resolve') {
  const c = s.combat!;
  if (stage === 'attacker') {
    if (faithEligible(s, c.attacker)) {
      s.prompt = { kind: 'faith', seat: c.attacker, role: 'attacker' };
      return;
    }
    stage = 'defender';
  }
  if (stage === 'defender') {
    // aclaración 13: la Muralla no tiene Fe
    if (c.target.kind === 'troops' && faithEligible(s, c.defender)) {
      s.prompt = { kind: 'faith', seat: c.defender, role: 'defender' };
      return;
    }
  }
  resolveCombat(s);
}

function removeUnit(s: GameState, id: string) {
  s.units = s.units.filter((u) => u.id !== id);
}

function resolveCombat(s: GameState) {
  const c = s.combat!;
  const a = Math.max(...c.attackerDice);
  const b = Math.max(...c.defenderDice);
  c.result = a > b ? 'attacker' : b > a ? 'defender' : 'tie';
  const att = pname(s, c.attacker);
  const def = pname(s, c.defender);
  const aName = `${c.attackerUnits.length} ${NAMES.unit[c.attackerType]}`;
  let text = '';
  if (c.target.kind === 'troops') {
    const pos = c.target.pos;
    const defName = NAMES.unit[c.defenderType!];
    text = `${att} (${aName}) ataca a ${def} (${defName}) en ${coordLabel(pos)} a distancia ${c.distance}: [${c.attackerDice.join(',')}] contra [${c.defenderDice.join(',')}]. `;
    if (c.result === 'attacker') {
      const victim = unitsAt(s, pos).filter((u) => u.type === c.defenderType).at(-1)!;
      removeUnit(s, victim.id);
      c.casualty = victim.id;
      text += `Gana el atacante: ${def} pierde 1 ${defName}.`;
    } else if (c.result === 'defender') {
      if (c.attackerCanLose) {
        const victim = c.attackerUnits.filter((id) => unitById(s, id)).at(-1)!;
        removeUnit(s, victim);
        c.casualty = victim;
        text += `Gana el defensor: ${att} pierde 1 ${NAMES.unit[c.attackerType]}.`;
      } else text += 'Gana el defensor, pero no puede causar daño al atacante.';
    } else text += 'Empate: no ocurre nada.';
  } else {
    const { capital, side } = c.target;
    text = `${att} (${aName}) ataca la Muralla ${NAMES.side[side]} de la Capital de ${def}: [${c.attackerDice.join(',')}] contra [${c.defenderDice.join(',')}]. `;
    if (c.result === 'attacker') {
      s.players[capital].walls = s.players[capital].walls.filter((w) => w !== side);
      text += 'Muralla destruida.';
    } else if (c.result === 'defender') {
      if (c.attackerCanLose) {
        const victim = c.attackerUnits.filter((id) => unitById(s, id)).at(-1)!;
        removeUnit(s, victim);
        c.casualty = victim;
        text += `La Muralla resiste: ${att} pierde 1 Artillería.`;
      } else text += 'La Muralla resiste.';
    } else text += 'Empate: no ocurre nada.';
  }
  c.summary = text;
  log(s, text, c.attacker);
  s.lastCombat = structuredClone(c);

  // §63 + aclaración 10: avance de toda la formación tras vaciar la loseta en cuerpo a cuerpo.
  if (c.target.kind === 'troops' && c.distance === 1 && c.result === 'attacker') {
    const to = c.target.pos;
    if (!unitsAt(s, to).length && advancers(s, c.attacker, c.from, to).length) {
      s.prompt = { kind: 'advance', seat: c.attacker, from: c.from, to };
      return;
    }
  }
  s.combat = null;
  maybeCloseMilitary(s);
}

function advancers(s: GameState, seat: Seat, from: number, to: number) {
  return unitsAt(s, from).filter((u) => u.owner === seat && canStand(s, seat, u.type, to));
}

// ---------------------------------------------------------------------------------------------
// Aplicación de acciones
// ---------------------------------------------------------------------------------------------

export function applyAction(state: GameState, seat: Seat, action: Action): GameState {
  const s: GameState = structuredClone(state);
  if (s.phase === 'GAME_OVER') fail('La partida ha terminado.');
  const p = s.players[seat];
  if (!p) fail('Jugador desconocido.');

  switch (action.type) {
    // ----------------------------------------------------------------- Fase I
    case 'placeInitial': {
      if (s.step !== 'INITIAL_PLACEMENT') fail('No es momento de colocar losetas iniciales.');
      if (p.rewardQueue.length) fail('Primero resuelve la recompensa pendiente.');
      if (!initialPlacements(s, seat, action.terrain).includes(action.pos)) fail('Posición no legal.');
      s.cells[action.pos] = { terrain: action.terrain, placedBy: seat };
      p.initialTiles.splice(p.initialTiles.indexOf(action.terrain), 1);
      gain(s, seat, action.terrain);
      log(s, `${p.name} coloca ${NAMES.terrain[action.terrain]} inicial en ${coordLabel(action.pos)}.`, seat);
      if (isLand(action.terrain)) pushReward(s, seat, action.terrain);
      checkInitialDone(s);
      break;
    }
    case 'placeTile': {
      if (s.step !== 'PILE_PLACEMENT' || activeSeat(s) !== seat) fail('No es tu turno de colocar.');
      if (p.rewardQueue.length) fail('Primero resuelve la recompensa pendiente.');
      const tile = s.pile[0];
      if (!legalPlacements(s, seat, tile).includes(action.pos)) fail('Posición no legal para esta loseta.');
      s.pile.shift();
      s.cells[action.pos] = { terrain: tile, placedBy: seat };
      p.placementsLeft--;
      gain(s, seat, tile);
      log(s, `${p.name} coloca ${NAMES.terrain[tile]} en ${coordLabel(action.pos)}.`, seat);
      if (ringOwner(action.pos) === seat && isLand(tile)) pushReward(s, seat, tile);
      if (!p.rewardQueue.length) endPileTurn(s);
      break;
    }
    case 'exchange': {
      if (s.step !== 'EXCHANGE' || activeSeat(s) !== seat) fail('No hay intercambio pendiente.');
      const tile = s.exchangeTile!;
      const ok = exchangeOptions(s, seat, tile).some((o) => o.from === action.from && o.to === action.to);
      if (!ok) fail('Intercambio no legal.');
      const moved = s.cells[action.from].terrain!;
      s.cells[action.to] = { ...s.cells[action.from] };
      s.cells[action.from] = { terrain: tile, placedBy: seat };
      s.exchangeTile = null;
      p.placementsLeft--;
      gain(s, seat, tile); // §16: la loseta pendiente sí genera recurso; sin recompensa militar
      log(
        s,
        `${p.name} mueve ${NAMES.terrain[moved]} de ${coordLabel(action.from)} a ${coordLabel(action.to)} y coloca ${NAMES.terrain[tile]} en ${coordLabel(action.from)}.`,
        seat,
      );
      s.step = 'PILE_PLACEMENT';
      endPileTurn(s);
      break;
    }
    case 'chooseReward': {
      const front = p.rewardQueue[0];
      if (s.phase !== 'PHASE_1' || front?.kind !== 'choose') fail('No hay elección pendiente.');
      if (!(front as { options: string[] }).options.includes(action.option)) fail('Opción no válida.');
      p.rewardQueue[0] = rewardFromChoice(action.option);
      log(s, `${p.name} elige ${action.option === 'muralla' ? 'Muralla' : NAMES.unit[action.option]}.`, seat);
      normalizeQueue(s, seat);
      afterReward(s, seat);
      break;
    }
    case 'deployUnit': {
      const front = p.rewardQueue[0];
      if (s.phase !== 'PHASE_1' || front?.kind !== 'deploy') fail('No hay tropa que desplegar.');
      const unit = (front as { unit: UnitType }).unit;
      if (!ringSpots(s, seat, unit).includes(action.pos)) fail('Casilla no válida para desplegar.');
      addUnit(s, seat, unit, action.pos);
      p.rewardQueue.shift();
      log(s, `${p.name} despliega ${NAMES.unit[unit]} en ${coordLabel(action.pos)}.`, seat);
      normalizeQueue(s, seat);
      afterReward(s, seat);
      break;
    }
    case 'placeWall': {
      const front = p.rewardQueue[0];
      if (s.phase !== 'PHASE_1' || front?.kind !== 'wall') fail('No hay Muralla que colocar.');
      if (!SIDES.includes(action.side) || p.originalWalls.includes(action.side)) fail('Lado no disponible.');
      p.originalWalls.push(action.side);
      p.walls.push(action.side);
      p.rewardQueue.shift();
      log(s, `${p.name} levanta una Muralla en el lado ${NAMES.side[action.side]} de su Capital.`, seat);
      normalizeQueue(s, seat);
      afterReward(s, seat);
      break;
    }
    case 'deployReserve': {
      if (s.phase !== 'PHASE_1') fail('Solo durante la Fase I.');
      const unit = p.reserve[action.index];
      if (!unit) fail('Tropa no encontrada en la reserva.');
      if (!ringSpots(s, seat, unit).includes(action.pos)) fail('Casilla no válida para desplegar.');
      addUnit(s, seat, unit, action.pos);
      p.reserve.splice(action.index, 1);
      log(s, `${p.name} despliega ${NAMES.unit[unit]} de la reserva en ${coordLabel(action.pos)}.`, seat);
      if (s.step === 'FINAL_DEPLOY') checkFinalDeploy(s);
      break;
    }

    // ----------------------------------------------------------------- Fase II
    case 'libraryChoice': {
      if (s.prompt?.kind !== 'library' || s.prompt.seat !== seat) fail('No hay recurso de Biblioteca pendiente.');
      if (!RESOURCES.includes(action.resource)) fail('Recurso no válido.');
      p.resources[action.resource]++;
      s.prompt = null;
      log(s, `${p.name} obtiene 1 ${NAMES.resource[action.resource]} de su Biblioteca.`, seat);
      break;
    }
    case 'build': {
      requireTurn(s, seat);
      if (!canUseCivil(s)) fail('No te queda Acción Civil disponible.');
      const b = action.building;
      if (!BUILDING_COST[b]) fail('Edificio desconocido.');
      if (p.buildings.includes(b)) fail('Ya tienes ese edificio.');
      if (b === 'ayuntamiento' && p.buildings.length < 2) fail('El Ayuntamiento requiere 2 edificios previos.');
      if (!canAfford(p.resources, BUILDING_COST[b])) fail('Recursos insuficientes.');
      pay(p.resources, BUILDING_COST[b]);
      p.buildings.push(b);
      s.turn!.civilUsed = true;
      log(s, `${p.name} construye ${NAMES.building[b]}.`, seat);
      checkVictory(s, seat);
      break;
    }
    case 'recruit': {
      requireTurn(s, seat);
      if (!canUseMilitary(s) || s.turn!.military) fail('No puedes reclutar ahora.');
      const t = action.unit;
      if (!UNIT_TYPES.includes(t)) fail('Tropa desconocida.');
      if (!isUnlocked(s, seat, t)) fail('Falta el edificio necesario.');
      if (unitCount(s, seat, t) >= MAX_PER_TYPE) fail('Ya tienes 5 unidades de ese tipo.');
      if (!canAfford(p.resources, UNIT_COST[t])) fail('Recursos insuficientes.');
      if (!ringSpots(s, seat, t).includes(action.pos)) fail('Casilla no válida para reclutar.');
      pay(p.resources, UNIT_COST[t]);
      addUnit(s, seat, t, action.pos);
      s.turn!.militaryUsed = true;
      log(s, `${p.name} recluta ${NAMES.unit[t]} en ${coordLabel(action.pos)}.`, seat);
      break;
    }
    case 'move': {
      requireTurn(s, seat);
      const u = unitById(s, action.unitId);
      if (!u || u.owner !== seat) fail('Tropa no válida.');
      if (!canActivate(s, u!)) fail('No puedes activar más tropas en esta Acción Militar.');
      const steps = moveTargets(s, u!.id).get(action.to);
      if (!steps) fail('Movimiento no legal.');
      const a = activate(s, u!.id);
      const from = u!.pos;
      a.moves += steps!;
      u!.pos = action.to;
      a.done = stepsLeft(s, u!, a) === 0 && !attackAvailable(s, u!, a);
      log(s, `${p.name} mueve ${NAMES.unit[u!.type]} de ${coordLabel(from)} a ${coordLabel(action.to)}.`, seat);
      maybeCloseMilitary(s);
      break;
    }
    case 'attack':
    case 'attackWall': {
      requireTurn(s, seat);
      if (!Array.isArray(action.unitIds)) fail('Selecciona al menos una tropa.');
      const ids = [...new Set(action.unitIds)];
      if (!ids.length) fail('Selecciona al menos una tropa.');
      const units = ids.map((id) => unitById(s, id));
      if (units.some((u) => !u || u.owner !== seat)) fail('Tropa no válida.');
      const lead = units[0]!;
      if (units.some((u) => u!.pos !== lead.pos || u!.type !== lead.type))
        fail('Un ataque agrupado exige tropas del mismo tipo en la misma loseta.');
      const acts = s.turn!.military?.activations ?? {};
      const fresh = ids.filter((id) => !acts[id]).length;
      if (!canUseMilitary(s) || Object.keys(acts).length + fresh > 3)
        fail('Solo puedes activar 3 figuras por Acción Militar.');
      if (units.some((u) => !canAttackNow(s, u!))) fail('Alguna tropa no puede atacar (activación o edificio).');
      const targets = attackTargets(s, lead.id);
      let combat: Combat;
      const base = {
        attacker: seat,
        from: lead.pos,
        attackerType: lead.type,
        attackerUnits: ids,
        attackerDice: [],
        defenderDice: [],
        attackerFaith: false,
        defenderFaith: false,
        attackerCanLose: true,
        result: null,
        casualty: null,
        summary: '',
      };
      if (action.type === 'attack') {
        if (!targets.troops.includes(action.target)) fail('Objetivo no legal.');
        const defenders = unitsAt(s, action.target);
        const types = [...new Set(defenders.map((u) => u.type))];
        combat = {
          ...base,
          defender: defenders[0].owner,
          target: { kind: 'troops', pos: action.target },
          distance: manhattan(lead.pos, action.target) as 1 | 2,
          defenderType: types.length === 1 ? types[0] : null,
        };
        if (lead.type === 'arquero') ensureMilitary(s).archerShots.push(`${lead.pos}>${action.target}`);
        s.combat = combat;
        for (const id of ids) Object.assign(activate(s, id), { attacked: true, done: true });
        if (!combat.defenderType) {
          s.prompt = { kind: 'defenderChoice', seat: combat.defender, options: types };
          break;
        }
      } else {
        if (!targets.walls.some((w) => w.capital === action.capital && w.side === action.side))
          fail('Muralla no atacable desde aquí.');
        combat = {
          ...base,
          defender: action.capital,
          target: { kind: 'wall', capital: action.capital, side: action.side },
          distance: manhattan(lead.pos, CAPITALS[action.capital]) === 1 ? 1 : 2,
          defenderType: null,
        };
        s.combat = combat;
        for (const id of ids) Object.assign(activate(s, id), { attacked: true, done: true });
      }
      rollCombat(s);
      break;
    }
    case 'conquer': {
      requireTurn(s, seat);
      const u = unitById(s, action.unitId);
      if (!u || u.owner !== seat) fail('Tropa no válida.');
      if (!canActivate(s, u!)) fail('No puedes activar más tropas en esta Acción Militar.');
      if (!attackTargets(s, u!.id).capitals.includes(action.capital)) fail('Esta tropa no puede conquistar esa Capital.');
      Object.assign(activate(s, u!.id), { attacked: true, done: true });
      p.conquests.push(action.capital);
      const victim = s.players[action.capital];
      victim.walls = [...victim.originalWalls]; // §115
      log(
        s,
        `¡${p.name} conquista la Capital de ${victim.name} con ${NAMES.unit[u!.type]} desde ${coordLabel(u!.pos)}!` +
          (victim.originalWalls.length ? ' Sus Murallas originales se restauran.' : ''),
        seat,
      );
      checkVictory(s, seat);
      if ((s.phase as string) !== 'GAME_OVER') maybeCloseMilitary(s);
      break;
    }
    case 'endMilitary': {
      requireTurn(s, seat);
      const m = s.turn!.military;
      if (!m?.open) fail('No hay Acción Militar en curso.');
      m.open = false;
      log(s, `${p.name} termina su Acción Militar.`, seat);
      break;
    }
    case 'defenderChoice': {
      const pr = s.prompt;
      if (pr?.kind !== 'defenderChoice' || pr.seat !== seat) fail('No te toca elegir defensor.');
      if (!pr.options.includes(action.unit)) fail('Tipo no presente en la loseta.');
      s.prompt = null;
      s.combat!.defenderType = action.unit;
      log(s, `${p.name} defiende con ${NAMES.unit[action.unit]}.`, seat);
      rollCombat(s);
      break;
    }
    case 'faith': {
      const pr = s.prompt;
      if (pr?.kind !== 'faith' || pr.seat !== seat) fail('No te toca decidir Fe.');
      const c = s.combat!;
      s.prompt = null;
      if (action.use) {
        p.resources.agua -= 1;
        p.faithTurn = s.turnNumber;
        if (pr.role === 'attacker') {
          const old = c.attackerDice;
          c.attackerDice = rollDice(s, old.length);
          c.attackerFaith = true;
          log(s, `${p.name} usa Fe (1 Agua): [${old.join(',')}] → [${c.attackerDice.join(',')}].`, seat);
        } else {
          const old = c.defenderDice;
          c.defenderDice = rollDice(s, old.length);
          c.defenderFaith = true;
          log(s, `${p.name} usa Fe (1 Agua): [${old.join(',')}] → [${c.defenderDice.join(',')}].`, seat);
        }
      }
      combatStage(s, pr.role === 'attacker' ? 'defender' : 'resolve');
      break;
    }
    case 'advance': {
      const pr = s.prompt;
      if (pr?.kind !== 'advance' || pr.seat !== seat) fail('No hay avance pendiente.');
      s.prompt = null;
      if (action.accept) {
        const movers = advancers(s, seat, pr.from, pr.to);
        for (const u of movers) if (canStand(s, seat, u.type, pr.to)) u.pos = pr.to;
        log(s, `${p.name} avanza con su formación a ${coordLabel(pr.to)}.`, seat);
      }
      s.combat = null;
      maybeCloseMilitary(s);
      break;
    }
    case 'convert': {
      requireTurn(s, seat);
      if (!hasBuilding(s, seat, 'mercado')) fail('Necesitas Mercado.');
      if (!RESOURCES.includes(action.give) || !RESOURCES.includes(action.get)) fail('Recurso no válido.');
      if (action.give === action.get) fail('Elige un recurso distinto.');
      if (p.resources[action.give] < 2) fail('Necesitas 2 recursos iguales.');
      p.resources[action.give] -= 2;
      p.resources[action.get] += 1;
      log(s, `${p.name} convierte 2 ${NAMES.resource[action.give]} en 1 ${NAMES.resource[action.get]}.`, seat);
      break;
    }
    case 'proposeTrade': {
      requireTurn(s, seat);
      if (!hasBuilding(s, seat, 'mercado')) fail('Necesitas Mercado para negociar.');
      if (s.turn!.tradeDone) fail('Solo se permite un intercambio por turno.');
      if (action.to === seat || !s.players[action.to]) fail('Elige otro jugador.');
      const give = sanitize(action.give);
      const receive = sanitize(action.receive);
      const total = (x: Resources) => RESOURCES.reduce((n, r) => n + x[r], 0);
      // Aclaración A17: cada intercambio es exactamente 1 recurso por 1 recurso.
      if (total(give) !== 1 || total(receive) !== 1) fail('El intercambio debe ser de 1 recurso por 1 recurso.');
      if (!canAfford(p.resources, give)) fail('No tienes esos recursos.');
      if (!canAfford(s.players[action.to].resources, receive)) fail('El otro jugador no tiene esos recursos.');
      s.prompt = { kind: 'trade', seat: action.to, from: seat, give, receive };
      log(s, `${p.name} propone un intercambio a ${pname(s, action.to)}.`, seat);
      break;
    }
    case 'respondTrade': {
      const pr = s.prompt;
      if (pr?.kind !== 'trade' || pr.seat !== seat) fail('No hay oferta para ti.');
      s.prompt = null;
      const from = s.players[pr.from];
      if (action.accept) {
        if (!canAfford(from.resources, pr.give) || !canAfford(p.resources, pr.receive))
          fail('Ya no hay recursos suficientes para este intercambio.');
        pay(from.resources, pr.give);
        pay(p.resources, pr.receive);
        for (const r of RESOURCES) {
          p.resources[r] += pr.give[r];
          from.resources[r] += pr.receive[r];
        }
        s.turn!.tradeDone = true;
        log(s, `${p.name} acepta el intercambio de ${from.name}.`, seat);
      } else log(s, `${p.name} rechaza el intercambio de ${from.name}.`, seat);
      break;
    }
    case 'cancelTrade': {
      // Quien propone puede retirar la oferta mientras no se responda (evita que la partida quede parada).
      const pr = s.prompt;
      if (pr?.kind !== 'trade' || pr.from !== seat) fail('No tienes ninguna oferta pendiente.');
      s.prompt = null;
      log(s, `${p.name} retira su oferta de intercambio.`, seat);
      break;
    }
    case 'endTurn': {
      requireTurn(s, seat);
      log(s, `${p.name} termina su turno.`, seat);
      s.current = (s.current + 1) % 4;
      startTurn(s);
      break;
    }
    default:
      fail('Acción desconocida.');
  }
  return s;
}

function sanitize(r: Resources): Resources {
  const out = emptyResources();
  for (const k of RESOURCES) {
    const v = Math.floor(Number(r?.[k] ?? 0));
    if (!Number.isFinite(v) || v < 0) fail('Cantidad no válida.');
    out[k] = v;
  }
  return out;
}
