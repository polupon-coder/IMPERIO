// Fase I — Creación del Mundo: legalidad de colocación de losetas y despliegue inicial.
import {
  CAPITALS,
  MAX_STACK,
  RINGS,
  SEATS,
  isCapital,
  isExterior,
  isLand,
  orthoNeighbors,
  ringOwner,
} from './rules';
import type { Cell, GameState, Seat, Terrain, UnitType } from './types';

export const waterRemaining = (s: GameState) =>
  s.pile.filter((t) => t === 'agua').length + (s.exchangeTile === 'agua' ? 1 : 0);

export const exteriorFree = (cells: Cell[]) =>
  cells.reduce((n, c, i) => n + (isExterior(i) && c.terrain === null ? 1 : 0), 0);

export const ringHoles = (cells: Cell[], seat: Seat) => RINGS[seat].filter((i) => cells[i].terrain === null);
export const ringWaterCount = (cells: Cell[], seat: Seat) =>
  RINGS[seat].filter((i) => cells[i].terrain === 'agua').length;

/**
 * §11: las cuatro Capitales deben poder quedar conectadas por tierra (adyacencia ortogonal).
 * Las casillas vacías cuentan como posible tierra futura. El camino puede pasar por otra Capital.
 */
export function capitalsConnectable(cells: Cell[]): boolean {
  const start = CAPITALS[0];
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of orthoNeighbors(cur)) {
      if (seen.has(n)) continue;
      const passable = isCapital(n) || cells[n].terrain === null || isLand(cells[n].terrain);
      if (!passable) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return SEATS.every((s) => seen.has(CAPITALS[s]));
}

/** §10–13: casillas legales sin tener en cuenta la expansión personal (§9). */
export function baseLegalSquares(s: GameState, seat: Seat, terrain: Terrain): number[] {
  const player = s.players[seat];
  const holes = ringHoles(s.cells, seat).length;
  const forced = player.placementsLeft <= holes; // §13
  const waterAfter = waterRemaining(s) - (terrain === 'agua' ? 1 : 0);
  const extFree = exteriorFree(s.cells);
  const out: number[] = [];
  for (let pos = 0; pos < s.cells.length; pos++) {
    if (isCapital(pos) || s.cells[pos].terrain !== null) continue;
    const owner = ringOwner(pos);
    if (owner !== null && owner !== seat) continue; // anillo rival
    if (forced && owner !== seat) continue;
    if (owner === seat && terrain === 'agua' && ringWaterCount(s.cells, seat) >= 1) continue; // segunda Agua
    if (owner === null && isLand(terrain) && extFree - 1 < waterAfter) continue; // §12 reserva de Agua
    if (terrain === 'agua') {
      const cells = s.cells.slice();
      cells[pos] = { terrain: 'agua', placedBy: seat };
      if (!capitalsConnectable(cells)) continue; // §11
    }
    out.push(pos);
  }
  return out;
}

/** §9 y §17: además, contigua ortogonalmente a una loseta propia salvo expansión de emergencia. */
export function legalPlacements(s: GameState, seat: Seat, terrain: Terrain): number[] {
  const base = baseLegalSquares(s, seat, terrain);
  const connected = base.filter((pos) => orthoNeighbors(pos).some((n) => s.cells[n].placedBy === seat));
  return connected.length ? connected : base;
}

/** §5: losetas iniciales en 4 de las 8 casillas del propio anillo. */
export function initialPlacements(s: GameState, seat: Seat, terrain: Terrain): number[] {
  const player = s.players[seat];
  if (!player.initialTiles.includes(terrain)) return [];
  return RINGS[seat].filter((pos) => {
    if (s.cells[pos].terrain !== null) return false;
    if (terrain === 'agua' && ringWaterCount(s.cells, seat) >= 1) return false;
    return true;
  });
}

export const unitsAt = (s: GameState, pos: number) => s.units.filter((u) => u.pos === pos);

/** Dueño del Torreón que ocupa la casilla (A23), o null. */
export const towerAt = (s: GameState, pos: number): Seat | null => s.players.find((p) => p.tower === pos)?.seat ?? null;

/** Una tropa puede estar en la casilla (terreno, pila de 3, sin enemigos). */
export function canStand(s: GameState, seat: Seat, type: UnitType, pos: number, ignoreUnit?: string): boolean {
  const t = s.cells[pos]?.terrain;
  if (isCapital(pos) || !isLand(t)) return false;
  if (type === 'artilleria' && t === 'montana') return false;
  if (towerAt(s, pos) !== null) return false; // A23: nadie entra en la casilla de un Torreón
  const here = unitsAt(s, pos).filter((u) => u.id !== ignoreUnit);
  if (here.some((u) => u.owner !== seat)) return false;
  return here.length < MAX_STACK;
}

/** §20 / §54: posiciones de despliegue o reclutamiento en el propio anillo. */
export const ringSpots = (s: GameState, seat: Seat, type: UnitType) =>
  RINGS[seat].filter((pos) => canStand(s, seat, type, pos));

export interface ExchangeOption {
  from: number;
  to: number;
}

/**
 * §16 Intercambio de emergencia: mover una loseta terrestre (primero de fuera de los anillos; si no es
 * posible, del propio anillo) a una casilla libre legal, y colocar la loseta pendiente en el hueco.
 */
export function exchangeOptions(s: GameState, seat: Seat, tile: Terrain): ExchangeOption[] {
  const player = s.players[seat];
  // La loseta pendiente está contada en waterRemaining (en la pila o como exchangeTile).
  const waterAfter = waterRemaining(s) - (tile === 'agua' ? 1 : 0);
  const all = s.cells.map((_, i) => i);
  const froms = (exterior: boolean) =>
    all.filter((i) => isLand(s.cells[i].terrain) && (exterior ? isExterior(i) : ringOwner(i) === seat));
  const tos = all.filter(
    (i) => !isCapital(i) && s.cells[i].terrain === null && (isExterior(i) || ringOwner(i) === seat),
  );

  const valid = (from: number, to: number) => {
    const cells = s.cells.slice();
    cells[to] = { ...cells[from] };
    cells[from] = { terrain: tile, placedBy: seat };
    for (const r of SEATS) if (ringWaterCount(cells, r) > 1) return false;
    if (!capitalsConnectable(cells)) return false;
    if (player.placementsLeft - 1 < ringHoles(cells, seat).length) return false;
    if (exteriorFree(cells) < waterAfter) return false;
    // Las tropas desplegadas en la casilla deben seguir siendo legales sobre el nuevo terreno.
    for (const u of unitsAt(s, from)) {
      if (!isLand(tile) || (u.type === 'artilleria' && tile === 'montana')) return false;
    }
    return true;
  };

  for (const exterior of [true, false]) {
    const out: ExchangeOption[] = [];
    for (const from of froms(exterior)) for (const to of tos) if (valid(from, to)) out.push({ from, to });
    if (out.length) return out;
  }
  return [];
}
