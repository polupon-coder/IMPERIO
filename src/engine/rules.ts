// Constantes y geometría del tablero. Referencias a secciones de docs/REGLAMENTO.md.
import type { Building, Resource, Resources, Seat, Side, Terrain, UnitType } from './types';

export const SIZE = 8;
export const SEATS: Seat[] = [0, 1, 2, 3];
export const RESOURCES: Resource[] = ['comida', 'madera', 'piedra', 'agua'];
export const UNIT_TYPES: UnitType[] = ['infanteria', 'arquero', 'lancero', 'caballeria', 'artilleria'];
export const BUILDINGS: Building[] = [
  'cuartel',
  'arqueria',
  'caballerizas',
  'herreria',
  'iglesia',
  'mercado',
  'biblioteca',
  'ayuntamiento',
];
export const SIDES: Side[] = ['N', 'S', 'E', 'O'];

export const idx = (r: number, c: number) => r * SIZE + c;
export const rowOf = (i: number) => Math.floor(i / SIZE);
export const colOf = (i: number) => i % SIZE;
export const inBoard = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** §2: Capitales en (2,2), (2,7), (7,7), (7,2) — en base 0 y en orden horario. */
export const CAPITALS: Record<Seat, number> = {
  0: idx(1, 1),
  1: idx(1, 6),
  2: idx(6, 6),
  3: idx(6, 1),
};
export const SEAT_LABEL: Record<Seat, string> = { 0: 'Noroeste', 1: 'Noreste', 2: 'Sureste', 3: 'Suroeste' };

export const capitalSeatAt = (pos: number): Seat | null => {
  for (const s of SEATS) if (CAPITALS[s] === pos) return s;
  return null;
};
export const isCapital = (pos: number) => capitalSeatAt(pos) !== null;

/** §6: anillo = 8 casillas alrededor de la Capital. */
export const RINGS: Record<Seat, number[]> = { 0: [], 1: [], 2: [], 3: [] };
for (const s of SEATS) {
  const r0 = rowOf(CAPITALS[s]);
  const c0 = colOf(CAPITALS[s]);
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) if (dr || dc) RINGS[s].push(idx(r0 + dr, c0 + dc));
}
export const ringOwner = (pos: number): Seat | null => {
  for (const s of SEATS) if (RINGS[s].includes(pos)) return s;
  return null;
};
export const isExterior = (pos: number) => !isCapital(pos) && ringOwner(pos) === null;

export const SIDE_DELTA: Record<Side, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], O: [0, -1] };
/** Casilla exterior adyacente al lado `side` de la Capital. */
export const sideCell = (capital: Seat, side: Side) => {
  const [dr, dc] = SIDE_DELTA[side];
  return idx(rowOf(CAPITALS[capital]) + dr, colOf(CAPITALS[capital]) + dc);
};
/** Lado de la Capital que queda entre ella y una casilla ortogonalmente adyacente. */
export const sideTowards = (capital: Seat, pos: number): Side | null => {
  for (const s of SIDES) if (sideCell(capital, s) === pos) return s;
  return null;
};

export const orthoNeighbors = (i: number): number[] => {
  const r = rowOf(i);
  const c = colOf(i);
  const out: number[] = [];
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ])
    if (inBoard(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
  return out;
};
export const manhattan = (a: number, b: number) =>
  Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));

export const isLand = (t: Terrain | null) => t === 'llanura' || t === 'bosque' || t === 'montana';
export const isSlow = (t: Terrain | null) => t === 'bosque' || t === 'montana';

/** §3 y §18: recurso de cada terreno. */
export const TERRAIN_RESOURCE: Record<Terrain, Resource> = {
  llanura: 'comida',
  bosque: 'madera',
  montana: 'piedra',
  agua: 'agua',
};

/** §3: 24 Llanuras, 12 Bosques, 12 Montañas, 12 Aguas. §7: la pila excluye 4 de cada. */
export const PILE_COMPOSITION: Record<Terrain, number> = { llanura: 20, bosque: 8, montana: 8, agua: 8 };
export const INITIAL_TILES: Terrain[] = ['llanura', 'bosque', 'montana', 'agua'];
export const PILE_PLACEMENTS = 11;

export const MAX_PER_TYPE = 5; // §55
export const MAX_STACK = 3; // §56
export const MAX_WALLS = 4; // §22

const R = (madera: number, piedra: number, comida: number, agua: number): Resources => ({
  madera,
  piedra,
  comida,
  agua,
});

/** §31–38 */
export const BUILDING_COST: Record<Building, Resources> = {
  cuartel: R(3, 2, 2, 1),
  arqueria: R(4, 1, 2, 1),
  caballerizas: R(2, 2, 4, 2),
  herreria: R(2, 4, 1, 2),
  iglesia: R(2, 4, 2, 2),
  mercado: R(2, 2, 3, 3),
  biblioteca: R(3, 3, 2, 3),
  ayuntamiento: R(5, 5, 3, 3),
};

/** Aclaración A18: el Mercado convierte 3 recursos iguales en 1 cualquiera. */
export const CONVERT_RATE = 3;
/** Aclaración A19: la Fe cuesta 2 Agua. */
export const FAITH_COST = 2;
/** Aclaración A20: Murallas en la Fase II (Acción Civil). */
export const WALL_BUILD_COST: Resources = R(1, 4, 0, 0);
export const WALL_REPAIR_COST: Resources = R(0, 3, 0, 0);
/** Una Muralla destruida en el turno T solo se repara a partir del turno T + 5 (pasa una ronda). */
export const WALL_REPAIR_WAIT = 4;

/** §49–53 */
export const UNIT_COST: Record<UnitType, Resources> = {
  infanteria: R(0, 0, 2, 1),
  arquero: R(2, 0, 1, 1),
  lancero: R(1, 1, 1, 1),
  caballeria: R(1, 0, 3, 1),
  artilleria: R(2, 3, 1, 1),
};

/** §41 */
export const UNIT_REQUIRES: Record<UnitType, Building[]> = {
  infanteria: ['cuartel'],
  arquero: ['arqueria'],
  caballeria: ['caballerizas'],
  lancero: ['herreria'],
  artilleria: ['herreria'], // A22
};

/** Unidades con alcance 2 (§84, §94). */
export const RANGED: UnitType[] = ['arquero', 'artilleria'];

export const NAMES = {
  terrain: { llanura: 'Llanura', bosque: 'Bosque', montana: 'Montaña', agua: 'Agua' } as Record<Terrain, string>,
  resource: { comida: 'Comida', madera: 'Madera', piedra: 'Piedra', agua: 'Agua' } as Record<Resource, string>,
  unit: {
    infanteria: 'Infantería',
    arquero: 'Arquero',
    lancero: 'Lancero',
    caballeria: 'Caballería',
    artilleria: 'Artillería',
  } as Record<UnitType, string>,
  building: {
    cuartel: 'Cuartel',
    arqueria: 'Arquería',
    caballerizas: 'Caballerizas',
    herreria: 'Herrería',
    iglesia: 'Iglesia',
    mercado: 'Mercado',
    biblioteca: 'Biblioteca',
    ayuntamiento: 'Ayuntamiento',
  } as Record<Building, string>,
  side: { N: 'norte', S: 'sur', E: 'este', O: 'oeste' } as Record<Side, string>,
  color: { rojo: 'Rojo', azul: 'Azul', amarillo: 'Amarillo', verde: 'Verde' },
};

export const coordLabel = (i: number) => `(${rowOf(i) + 1},${colOf(i) + 1})`;

export const emptyResources = (): Resources => ({ comida: 0, madera: 0, piedra: 0, agua: 0 });
export const canAfford = (have: Resources, cost: Resources) => RESOURCES.every((r) => have[r] >= cost[r]);
export const pay = (have: Resources, cost: Resources) => {
  for (const r of RESOURCES) have[r] -= cost[r];
};
export const costLabel = (cost: Resources) =>
  RESOURCES.filter((r) => cost[r] > 0)
    .map((r) => `${cost[r]} ${NAMES.resource[r]}`)
    .join(', ');
