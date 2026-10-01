// Fase II — movimiento, objetivos de ataque y dados.
import { canStand, unitsAt } from './phase1';
import {
  CAPITALS,
  RANGED,
  SEATS,
  UNIT_REQUIRES,
  capitalSeatAt,
  colOf,
  idx,
  isCapital,
  isSlow,
  manhattan,
  orthoNeighbors,
  rowOf,
  sideCell,
  sideTowards,
} from './rules';
import type { Activation, GameState, Seat, Side, Unit, UnitType } from './types';

export const unitById = (s: GameState, id: string) => s.units.find((u) => u.id === id);

export const isUnlocked = (s: GameState, seat: Seat, type: UnitType) =>
  UNIT_REQUIRES[type].every((b) => s.players[seat].buildings.includes(b));

export const hasBuilding = (s: GameState, seat: Seat, b: string) =>
  s.players[seat].buildings.includes(b as never);

export const activeSeat = (s: GameState): Seat => s.order[s.current];

/** Estado de activación actual de una tropa (o el que tendría al activarse ahora). */
export function activationOf(s: GameState, u: Unit): Activation {
  const existing = s.turn?.military?.activations[u.id];
  if (existing) return existing;
  return { startTerrain: s.cells[u.pos].terrain!, moves: 0, attacked: false, done: false };
}

/** §27–28: ¿puede usar (o seguir usando) la Acción Militar? */
export function canUseMilitary(s: GameState): boolean {
  const t = s.turn;
  if (s.phase !== 'PHASE_2' || !t || s.prompt || s.combat) return false;
  if (t.military?.open) return true;
  if (t.militaryUsed) return false;
  return hasBuilding(s, t.seat, 'ayuntamiento') || !t.civilUsed;
}

export function canUseCivil(s: GameState): boolean {
  const t = s.turn;
  if (s.phase !== 'PHASE_2' || !t || s.prompt || s.combat) return false;
  if (t.military?.open) return false;
  if (t.civilUsed) return false;
  return hasBuilding(s, t.seat, 'ayuntamiento') || !t.militaryUsed;
}

/** §57 y A21: hasta 3 figuras por Acción Militar, o 2 si en ella se ha reclutado. */
export const activationLimit = (s: GameState) => (s.turn?.military?.recruited ? 2 : 3);

/**
 * A21: solo se activan (mover/atacar) tropas activas, es decir, con su edificio construido.
 * La tropa recién reclutada no actúa ese turno.
 */
export function canActivate(s: GameState, u: Unit, extra = 0): boolean {
  if (!canUseMilitary(s) || u.owner !== s.turn!.seat) return false;
  if (!isUnlocked(s, u.owner, u.type)) return false;
  const m = s.turn!.military;
  if (m?.recruited === u.id) return false;
  const acts = m?.activations ?? {};
  if (acts[u.id]) return true;
  return Object.keys(acts).length + extra < activationLimit(s);
}

/** A21: reclutar 1 tropa por Acción Militar, antes o después de activar (si se han activado 2 como mucho). */
export function canRecruitNow(s: GameState): boolean {
  if (!canUseMilitary(s)) return false;
  const m = s.turn!.military;
  if (!m) return true;
  return m.open && !m.recruited && Object.keys(m.activations).length <= 2;
}

/** Pasos de movimiento que le quedan a la tropa (§64–75). */
export function stepsLeft(s: GameState, u: Unit, a: Activation): number {
  if (a.done || a.attacked) return 0;
  if (isSlow(a.startTerrain)) return a.moves === 0 ? 1 : 0; // §67
  if (a.moves > 0 && isSlow(s.cells[u.pos].terrain)) return 0; // §66
  return Math.max(0, 2 - a.moves);
}

/** ¿Le queda el ataque a la tropa en esta activación? (sin comprobar desbloqueo) */
export function attackAvailable(s: GameState, u: Unit, a: Activation): boolean {
  if (a.done || a.attacked) return false;
  if (isSlow(a.startTerrain)) return a.moves === 0; // §67–68
  if (a.moves > 0 && isSlow(s.cells[u.pos].terrain)) return false; // §66
  if (u.type === 'artilleria') return a.moves === 0; // §72, §99
  if (u.type === 'caballeria') return a.moves <= 2; // §70
  return a.moves <= 1; // §69
}

export const canAttackNow = (s: GameState, u: Unit) =>
  attackAvailable(s, u, activationOf(s, u)) && isUnlocked(s, u.owner, u.type);

/** Casillas alcanzables → pasos necesarios. Nunca a través de enemigos, Agua ni Capitales. */
export function moveTargets(s: GameState, unitId: string): Map<number, number> {
  const out = new Map<number, number>();
  const u = unitById(s, unitId);
  if (!u || !canActivate(s, u)) return out;
  const a = activationOf(s, u);
  const max = stepsLeft(s, u, a);
  let frontier = [u.pos];
  const seen = new Set([u.pos]);
  for (let step = 1; step <= max; step++) {
    const next: number[] = [];
    for (const p of frontier) {
      for (const n of orthoNeighbors(p)) {
        if (seen.has(n)) continue;
        const t = s.cells[n].terrain;
        if (isCapital(n) || t === null || t === 'agua') continue; // §75, Capital bloqueada
        if (u.type === 'artilleria' && t === 'montana') continue; // §74
        if (unitsAt(s, n).some((o) => o.owner !== u.owner)) continue; // §62
        seen.add(n);
        if (canStand(s, u.owner, u.type, n, u.id)) out.set(n, step);
        if (t === 'llanura') next.push(n); // entrar en terreno lento termina la activación
      }
    }
    frontier = next;
  }
  return out;
}

/** ¿Algún tramo ortogonal cruza una Muralla intacta o entra en una Capital? */
function routeBlocked(s: GameState, route: number[]): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    for (const [cap, other] of [
      [a, b],
      [b, a],
    ]) {
      const seat = capitalSeatAt(cap);
      if (seat === null) continue;
      const side = sideTowards(seat, other);
      if (side && s.players[seat].walls.includes(side)) return true;
    }
  }
  // Una Capital es una casilla bloqueada a todos los efectos: no se dispara a través de ella.
  return route.slice(1, -1).some((p) => isCapital(p));
}

/** §84–86: línea de tiro a distancia 2 (al menos una ruta ortogonal libre). */
export function hasLineOfFire(s: GameState, from: number, to: number): boolean {
  const d = manhattan(from, to);
  if (d <= 1) return true;
  if (d !== 2) return false;
  const [r1, c1, r2, c2] = [rowOf(from), colOf(from), rowOf(to), colOf(to)];
  const mids = r1 === r2 || c1 === c2 ? [idx((r1 + r2) / 2, (c1 + c2) / 2)] : [idx(r1, c2), idx(r2, c1)];
  return mids.some((m) => !routeBlocked(s, [from, m, to]));
}

/**
 * Opción B (aclaración 15): la Artillería bombardea la Muralla del lado `side` desde la casilla
 * adyacente a ese lado o desde cualquier casilla ortogonalmente contigua a ella (distancia 2 de la
 * Capital con una ruta mínima que entra por ese lado).
 */
export function bombardPositions(capital: Seat, side: Side): number[] {
  const front = sideCell(capital, side);
  return [front, ...orthoNeighbors(front).filter((p) => p !== CAPITALS[capital])];
}

export interface AttackTargets {
  troops: number[];
  walls: Array<{ capital: Seat; side: Side }>;
  capitals: Seat[];
}

/** Objetivos legales de un ataque desde la posición y tipo de la tropa líder. */
export function attackTargets(s: GameState, unitId: string): AttackTargets {
  const res: AttackTargets = { troops: [], walls: [], capitals: [] };
  const u = unitById(s, unitId);
  if (!u || !canActivate(s, u) || !canAttackNow(s, u)) return res;
  const ranged = RANGED.includes(u.type);
  const shots = s.turn?.military?.archerShots ?? [];
  for (let p = 0; p < s.cells.length; p++) {
    const here = unitsAt(s, p);
    if (!here.length || here[0].owner === u.owner) continue;
    const d = manhattan(u.pos, p);
    if (d === 1 || (ranged && d === 2 && hasLineOfFire(s, u.pos, p))) {
      if (u.type === 'arquero' && shots.includes(`${u.pos}>${p}`)) continue; // §87
      res.troops.push(p);
    }
  }
  for (const c of SEATS) {
    if (c === u.owner) continue;
    for (const side of s.players[c].walls) {
      const ok =
        u.type === 'artilleria' ? bombardPositions(c, side).includes(u.pos) : sideCell(c, side) === u.pos;
      if (ok) res.walls.push({ capital: c, side });
    }
    // §109–112, §117
    const side = sideTowards(c, u.pos);
    if (side && !s.players[c].walls.includes(side) && !s.players[u.owner].conquests.includes(c))
      res.capitals.push(c);
  }
  return res;
}

/** Figuras del mismo tipo en la misma loseta que pueden unirse al ataque de la líder (§58). */
export function groupCandidates(s: GameState, unitId: string): string[] {
  const u = unitById(s, unitId);
  if (!u) return [];
  return s.units
    .filter((o) => o.id !== u.id && o.owner === u.owner && o.pos === u.pos && o.type === u.type)
    .filter((o) => canActivate(s, o) && canAttackNow(s, o))
    .map((o) => o.id);
}

/**
 * Dados base (§76–105 con las aclaraciones). Devuelve [atacante, defensor, atacantePuedePerder].
 */
export function baseDice(att: UnitType, def: UnitType, distance: 1 | 2): [number, number, boolean] {
  if (distance === 2) {
    // Aclaración 12: Artillería a distancia 2 contra cualquier tropa: 1 contra 2, sin derrota.
    if (att === 'artilleria') return [1, 2, false];
    // Arquero a distancia 2: 1 contra 1; solo un defensor con alcance 2 puede causarle baja (§89–92).
    return [1, 1, RANGED.includes(def)];
  }
  if (att === 'artilleria' && def === 'artilleria') return [1, 1, true];
  if (att === 'artilleria') return [1, 2, true]; // §95
  if (def === 'artilleria') return [2, 1, true]; // §95
  const adv: Array<[UnitType, UnitType]> = [
    ['caballeria', 'infanteria'], // §79
    ['caballeria', 'arquero'], // §80 (cuerpo a cuerpo)
    ['lancero', 'caballeria'], // §81–82
  ];
  for (const [strong, weak] of adv) {
    if (att === strong && def === weak) return [2, 1, true];
    if (att === weak && def === strong) return [1, 2, true];
  }
  return [1, 1, true];
}

