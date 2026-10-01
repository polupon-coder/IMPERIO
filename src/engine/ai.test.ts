import { describe, expect, it } from 'vitest';
import { chooseAction, duel, pendingSeats } from './index';
import { playBots, playPhase1 } from './sim';

describe('Jugadores máquina', () => {
  it('probabilidades de combate exactas', () => {
    const [w, l] = duel(1, 1);
    expect(w).toBeCloseTo(15 / 36);
    expect(l).toBeCloseTo(15 / 36);
    const [w2] = duel(2, 1);
    expect(w2).toBeGreaterThan(0.5);
  });

  it.each([1, 2, 3])('partida completa entre máquinas normales (semilla %i): siempre legal y termina', (seed) => {
    const rep = playBots(seed, ['normal', 'normal', 'normal', 'normal']);
    expect(rep.problems).toEqual([]);
    expect(rep.winner).not.toBeNull();
  });

  it.each([4, 5])('partida con niveles mezclados y un jugador al azar (semilla %i)', (seed) => {
    const rep = playBots(seed, ['normal', 'facil', 'azar', 'facil']);
    expect(rep.problems).toEqual([]);
    expect(rep.winner).not.toBeNull();
  });

  it('solo decide quien tiene una decisión pendiente', () => {
    const s = playPhase1(3);
    const active = pendingSeats(s)[0];
    const other = ([0, 1, 2, 3] as const).find((x) => x !== active)!;
    expect(chooseAction(s, other, 'normal')).toBeNull();
    expect(chooseAction(s, active, 'normal')).not.toBeNull();
  });
});
