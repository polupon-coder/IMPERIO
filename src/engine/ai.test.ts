import { describe, expect, it } from 'vitest';
import { chooseAction, duel, pendingSeats } from './index';
import { hunterSeat } from './ai';
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
  }, 60000);

  it.each([4, 5])('partida con niveles mezclados y un jugador al azar (semilla %i)', (seed) => {
    const rep = playBots(seed, ['normal', 'facil', 'azar', 'facil'], 4000); // con un jugador al azar algunas partidas son largas
    expect(rep.problems).toEqual([]);
    expect(rep.winner).not.toBeNull();
  }, 60000);

  it.each([6, 7])('el nivel difícil juega partidas completas y legales (semilla %i)', (seed) => {
    const rep = playBots(seed, ['dificil', 'normal', 'dificil', 'normal']);
    expect(rep.problems).toEqual([]);
    expect(rep.winner).not.toBeNull();
  }, 60000);

  it('con un humano, juegan y terminan; una difícil es la cazadora (la más cercana a su Capital)', () => {
    const rep = playBots(8, ['humano', 'dificil', 'dificil', 'normal']);
    expect(rep.problems).toEqual([]);
    expect(rep.winner).not.toBeNull();
    const hunter = hunterSeat({ humans: [0], hardBots: [1, 2] });
    expect(hunter === 1 || hunter === 2).toBe(true);
    expect(hunterSeat({ humans: [], hardBots: [1] })).toBeNull();
  }, 60000);

  it('solo decide quien tiene una decisión pendiente', () => {
    const s = playPhase1(3);
    const active = pendingSeats(s)[0];
    const other = ([0, 1, 2, 3] as const).find((x) => x !== active)!;
    expect(chooseAction(s, other, 'normal')).toBeNull();
    expect(chooseAction(s, active, 'normal')).not.toBeNull();
  });
});
