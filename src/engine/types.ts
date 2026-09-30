// Tipos del motor de reglas de IMPERIO.
// Fuente de verdad de las mecánicas: docs/REGLAMENTO.md

export type Terrain = 'llanura' | 'bosque' | 'montana' | 'agua';
export type Resource = 'comida' | 'madera' | 'piedra' | 'agua';
export type UnitType = 'infanteria' | 'arquero' | 'lancero' | 'caballeria' | 'artilleria';
export type Building =
  | 'cuartel'
  | 'arqueria'
  | 'caballerizas'
  | 'herreria'
  | 'iglesia'
  | 'mercado'
  | 'biblioteca'
  | 'ayuntamiento';
export type Side = 'N' | 'S' | 'E' | 'O';
export type Color = 'rojo' | 'azul' | 'amarillo' | 'verde';

/** Asiento = Capital. 0: NO (2,2) · 1: NE (2,7) · 2: SE (7,7) · 3: SO (7,2). Orden horario. */
export type Seat = 0 | 1 | 2 | 3;

export type Resources = Record<Resource, number>;

export interface Cell {
  terrain: Terrain | null;
  /** Jugador que colocó la loseta (solo relevante en Fase I). */
  placedBy: Seat | null;
}

export interface Unit {
  id: string;
  owner: Seat;
  type: UnitType;
  pos: number;
}

/** Recompensa militar pendiente de resolver en Fase I. */
export type RewardItem =
  | { kind: 'choose'; from: Terrain; options: Array<UnitType | 'muralla'> }
  | { kind: 'deploy'; unit: UnitType }
  | { kind: 'wall' };

export interface PlayerState {
  seat: Seat;
  name: string;
  color: Color;
  resources: Resources;
  buildings: Building[];
  /** Asientos de las Capitales que este jugador ha conquistado. */
  conquests: Seat[];
  /** Murallas intactas de la propia Capital. */
  walls: Side[];
  /** Murallas originales (Fase I). */
  originalWalls: Side[];
  /** Losetas iniciales aún por colocar. */
  initialTiles: Terrain[];
  /** Colocaciones de la pila restantes (11 al empezar). */
  placementsLeft: number;
  /** Recompensas que deben resolverse ahora. */
  rewardQueue: RewardItem[];
  /** Tropas recibidas sin posición legal en el momento de recibirlas. */
  reserve: UnitType[];
  /** Número de turno en el que usó Fe por última vez. */
  faithTurn: number | null;
}

export interface Activation {
  startTerrain: Terrain;
  moves: number;
  attacked: boolean;
  done: boolean;
}

export interface MilitaryState {
  open: boolean;
  activations: Record<string, Activation>;
  /** Ataques de Arqueros realizados: origen→objetivo (regla 87). */
  archerShots: string[];
}

export type Prompt =
  | { kind: 'library'; seat: Seat }
  | { kind: 'defenderChoice'; seat: Seat; options: UnitType[] }
  | { kind: 'faith'; seat: Seat; role: 'attacker' | 'defender' }
  | { kind: 'advance'; seat: Seat; from: number; to: number }
  | { kind: 'trade'; seat: Seat; from: Seat; give: Resources; receive: Resources };

export interface Combat {
  attacker: Seat;
  defender: Seat;
  target: { kind: 'troops'; pos: number } | { kind: 'wall'; capital: Seat; side: Side };
  from: number;
  distance: 1 | 2;
  attackerType: UnitType;
  attackerUnits: string[];
  defenderType: UnitType | null;
  attackerDice: number[];
  defenderDice: number[];
  attackerFaith: boolean;
  defenderFaith: boolean;
  /** Si el defensor gana, ¿pierde el atacante una tropa? */
  attackerCanLose: boolean;
  /** Resultado final una vez resuelto. */
  result: 'attacker' | 'defender' | 'tie' | null;
  casualty: string | null;
  summary: string;
}

export interface TurnState {
  seat: Seat;
  civilUsed: boolean;
  militaryUsed: boolean;
  military: MilitaryState | null;
  tradeDone: boolean;
}

export type Phase = 'SETUP' | 'PHASE_1' | 'PHASE_2' | 'GAME_OVER';
export type Step =
  | 'FIRST_PLAYER'
  | 'INITIAL_PLACEMENT'
  | 'PILE_PLACEMENT'
  | 'EXCHANGE'
  | 'BLOCKED'
  | 'FINAL_DEPLOY'
  | 'TURN'
  | 'END';

export interface LogEntry {
  n: number;
  text: string;
  seat?: Seat;
  /** Momento del evento (ms), para intercalarlo con el chat. */
  ts?: number;
}

export interface GameState {
  phase: Phase;
  step: Step;
  players: PlayerState[];
  /** Asientos en orden de turno (horario empezando por el primer jugador). */
  order: Seat[];
  /** Índice en `order` del jugador activo. */
  current: number;
  turnNumber: number;
  cells: Cell[];
  units: Unit[];
  /** Pila común. pile[0] es la loseta superior. */
  pile: Terrain[];
  /** En EXCHANGE: loseta pendiente de colocar mediante intercambio. */
  exchangeTile: Terrain | null;
  firstPlayerRolls: Array<Partial<Record<Seat, number>>>;
  turn: TurnState | null;
  prompt: Prompt | null;
  combat: Combat | null;
  lastCombat: Combat | null;
  winner: Seat | null;
  log: LogEntry[];
  nextUnitId: number;
  rng: number;
}

export type Action =
  // Fase I
  | { type: 'placeInitial'; terrain: Terrain; pos: number }
  | { type: 'placeTile'; pos: number }
  | { type: 'exchange'; from: number; to: number }
  | { type: 'chooseReward'; option: UnitType | 'muralla' }
  | { type: 'deployUnit'; pos: number }
  | { type: 'placeWall'; side: Side }
  | { type: 'deployReserve'; index: number; pos: number }
  // Fase II
  | { type: 'libraryChoice'; resource: Resource }
  | { type: 'build'; building: Building }
  | { type: 'recruit'; unit: UnitType; pos: number }
  | { type: 'move'; unitId: string; to: number }
  | { type: 'attack'; unitIds: string[]; target: number }
  | { type: 'attackWall'; unitIds: string[]; capital: Seat; side: Side }
  | { type: 'conquer'; unitId: string; capital: Seat }
  | { type: 'endMilitary' }
  | { type: 'defenderChoice'; unit: UnitType }
  | { type: 'faith'; use: boolean }
  | { type: 'advance'; accept: boolean }
  | { type: 'convert'; give: Resource; get: Resource }
  | { type: 'proposeTrade'; to: Seat; give: Resources; receive: Resources }
  | { type: 'respondTrade'; accept: boolean }
  | { type: 'endTurn' };
