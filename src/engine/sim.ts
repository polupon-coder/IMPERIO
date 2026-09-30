// Juego automático aleatorio de la Fase I (tests y simulaciones de robustez).
import { SIDES, applyAction, createGame, exchangeOptions, initialPlacements, legalPlacements, ringSpots } from './index';
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

