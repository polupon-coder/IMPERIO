import { describe, expect, it } from 'vitest';
import {
  CAPITALS,
  RINGS,
  SIDES,
  applyAction,
  attackTargets,
  baseDice,
  bombardPositions,
  capitalsConnectable,
  createGame,
  exchangeOptions,
  idx,
  initialPlacements,
  isExterior,
  legalPlacements,
  moveTargets,
  ringSpots,
  type Action,
  type GameState,
  type Seat,
} from './index';

import { TEST_PLAYERS as PLAYERS, playGame, playPhase1 } from './sim';

describe('Primer jugador y orden', () => {
  it('orden horario empezando por el ganador de la tirada', () => {
    const s = createGame(PLAYERS, 42);
    const first = s.order[0];
    expect(s.order).toEqual([0, 1, 2, 3].map((k) => (first + k) % 4));
    const last = s.firstPlayerRolls.at(-1)!;
    expect(Object.keys(last)).toContain(String(first));
  });
});

describe('Partidas completas (jugadores aleatorios)', () => {
  const seeds = Array.from({ length: 6 }, (_, i) => i + 1);
  it.each(seeds)('semilla %i: toda acción ofrecida es legal y el estado respeta el reglamento', (seed) => {
    const rep = playGame(seed, 250);
    expect(rep.problems).toEqual([]);
  });
});

describe('Fase I completa (simulación aleatoria)', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
  it.each(seeds)('semilla %i termina con un mapa válido', (seed) => {
    const s = playPhase1(seed);
    expect(s.phase).toBe('PHASE_2');
    const count = { llanura: 0, bosque: 0, montana: 0, agua: 0 };
    s.cells.forEach((c, i) => {
      if (Object.values(CAPITALS).includes(i)) expect(c.terrain).toBeNull();
      else count[c.terrain!]++;
    });
    expect(count).toEqual({ llanura: 24, bosque: 12, montana: 12, agua: 12 });
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const ring = RINGS[seat].map((i) => s.cells[i].terrain);
      expect(ring.filter((t) => t === 'agua').length).toBe(1);
      expect(s.players[seat].placementsLeft).toBe(0);
    }
    expect(s.cells.filter((c, i) => isExterior(i) && c.terrain === 'agua').length).toBe(8);
    expect(capitalsConnectable(s.cells)).toBe(true);
    // Tropas iniciales: siempre en el propio anillo, máx. 3 por loseta, nunca Agua ni Artillería en Montaña.
    for (const u of s.units) {
      expect(RINGS[u.owner]).toContain(u.pos);
      expect(s.cells[u.pos].terrain).not.toBe('agua');
      if (u.type === 'artilleria') expect(s.cells[u.pos].terrain).not.toBe('montana');
      expect(s.units.filter((o) => o.pos === u.pos).length).toBeLessThanOrEqual(3);
    }
  });
});

// ------------------------------------------------------------------------------------------------
// Escenarios de Fase II construidos a mano
// ------------------------------------------------------------------------------------------------

function phase2Board(): GameState {
  const s = playPhase1(7);
  // Mapa controlado: todo Llanura salvo lo indicado; sin tropas.
  s.cells.forEach((c, i) => {
    if (!Object.values(CAPITALS).includes(i)) c.terrain = 'llanura';
  });
  s.units = [];
  for (const p of s.players) {
    p.walls = [];
    p.originalWalls = [];
    p.buildings = [];
    p.resources = { comida: 20, madera: 20, piedra: 20, agua: 20 };
  }
  s.prompt = null;
  // Turno del asiento 0
  s.current = s.order.indexOf(0);
  s.turn = { seat: 0, civilUsed: false, militaryUsed: false, military: null, tradeDone: false };
  return s;
}
let uid = 1000;
const put = (s: GameState, owner: Seat, type: any, r: number, c: number) => {
  const id = `t${uid++}`;
  s.units.push({ id, owner, type, pos: idx(r, c) });
  return id;
};

describe('Movimiento', () => {
  it('Infantería en Llanura mueve hasta 2 y no atraviesa enemigos, Agua ni Capitales', () => {
    const s = phase2Board();
    const inf = put(s, 0, 'infanteria', 3, 3);
    s.cells[idx(3, 4)].terrain = 'agua';
    put(s, 1, 'infanteria', 4, 3);
    const t = moveTargets(s, inf);
    expect(t.has(idx(3, 5))).toBe(false); // bloqueado por Agua
    expect(t.has(idx(5, 3))).toBe(false); // bloqueado por enemigo
    expect(t.has(idx(1, 1))).toBe(false); // Capital
    expect(t.get(idx(2, 3))).toBe(1);
    expect(t.get(idx(3, 1))).toBe(2);
  });

  it('Entrar en Bosque termina la activación y no permite atacar', () => {
    let s = phase2Board();
    s.players[0].buildings = ['cuartel'];
    const inf = put(s, 0, 'infanteria', 3, 3);
    s.cells[idx(3, 4)].terrain = 'bosque';
    put(s, 1, 'infanteria', 3, 5);
    s = applyAction(s, 0, { type: 'move', unitId: inf, to: idx(3, 4) });
    expect(moveTargets(s, inf).size).toBe(0);
    expect(attackTargets(s, inf).troops).toEqual([]);
  });

  it('Artillería no entra en Montaña y no mueve + ataca', () => {
    let s = phase2Board();
    s.players[0].buildings = ['herreria', 'biblioteca'];
    const art = put(s, 0, 'artilleria', 3, 3);
    s.cells[idx(3, 4)].terrain = 'montana';
    expect(moveTargets(s, art).has(idx(3, 4))).toBe(false);
    put(s, 1, 'infanteria', 5, 2);
    s = applyAction(s, 0, { type: 'move', unitId: art, to: idx(4, 3) });
    expect(attackTargets(s, art).troops).toEqual([]);
  });

  it('Máximo 3 figuras activadas por Acción Militar', () => {
    let s = phase2Board();
    const ids = [put(s, 0, 'infanteria', 3, 3), put(s, 0, 'infanteria', 3, 4), put(s, 0, 'infanteria', 4, 3), put(s, 0, 'infanteria', 4, 4)];
    s = applyAction(s, 0, { type: 'move', unitId: ids[0], to: idx(3, 2) });
    s = applyAction(s, 0, { type: 'move', unitId: ids[1], to: idx(3, 5) });
    s = applyAction(s, 0, { type: 'move', unitId: ids[2], to: idx(5, 3) });
    expect(() => applyAction(s, 0, { type: 'move', unitId: ids[3], to: idx(4, 5) })).toThrow();
  });
});

describe('Dados', () => {
  it('ventajas en ambos sentidos', () => {
    expect(baseDice('caballeria', 'infanteria', 1)).toEqual([2, 1, true]);
    expect(baseDice('infanteria', 'caballeria', 1)).toEqual([1, 2, true]);
    expect(baseDice('lancero', 'caballeria', 1)).toEqual([2, 1, true]);
    expect(baseDice('caballeria', 'lancero', 1)).toEqual([1, 2, true]);
    expect(baseDice('arquero', 'caballeria', 1)).toEqual([1, 2, true]);
    expect(baseDice('artilleria', 'lancero', 1)).toEqual([1, 2, true]);
    expect(baseDice('lancero', 'artilleria', 1)).toEqual([2, 1, true]);
    expect(baseDice('artilleria', 'artilleria', 1)).toEqual([1, 1, true]);
  });
  it('distancia 2', () => {
    expect(baseDice('artilleria', 'arquero', 2)).toEqual([1, 2, false]);
    expect(baseDice('arquero', 'infanteria', 2)).toEqual([1, 1, false]);
    expect(baseDice('arquero', 'arquero', 2)).toEqual([1, 1, true]);
    expect(baseDice('arquero', 'artilleria', 2)).toEqual([1, 1, true]);
  });
});

describe('Combate', () => {
  it('ataque agrupado tras mover suma dados y consume activaciones', () => {
    let s = phase2Board();
    s.players[0].buildings = ['cuartel'];
    const a = put(s, 0, 'infanteria', 3, 3);
    const b = put(s, 0, 'infanteria', 3, 4);
    put(s, 1, 'infanteria', 2, 4);
    s = applyAction(s, 0, { type: 'move', unitId: a, to: idx(3, 4) });
    s = applyAction(s, 0, { type: 'attack', unitIds: [a, b], target: idx(2, 4) });
    const c = s.lastCombat ?? s.combat!;
    expect(c.attackerDice.length).toBe(2);
    expect(c.defenderDice.length).toBe(1);
    expect(Object.keys(s.turn!.military!.activations).length).toBe(2);
  });

  it('sin edificio no se puede atacar', () => {
    const s = phase2Board();
    const a = put(s, 0, 'infanteria', 3, 3);
    put(s, 1, 'infanteria', 2, 3);
    expect(attackTargets(s, a).troops).toEqual([]);
  });

  it('el Arquero dispara a distancia 2 en diagonal pero no a través de una Capital', () => {
    const s = phase2Board();
    s.players[0].buildings = ['arqueria'];
    const a = put(s, 0, 'arquero', 0, 1); // (1,2) en notación 1..8
    put(s, 1, 'infanteria', 2, 1); // (3,2): recto a través de la Capital (2,2)
    put(s, 1, 'infanteria', 1, 2); // (2,3): diagonal con una ruta libre por (1,3)
    const t = attackTargets(s, a).troops;
    expect(t).not.toContain(idx(2, 1));
    expect(t).toContain(idx(1, 2));
  });

  it('Artillería a distancia 2: 1 contra 2 y nunca pierde', () => {
    for (let seed = 1; seed < 40; seed++) {
      let s = phase2Board();
      s.rng = seed;
      s.players[0].buildings = ['herreria', 'biblioteca'];
      const art = put(s, 0, 'artilleria', 3, 3);
      put(s, 1, 'arquero', 3, 5);
      s = applyAction(s, 0, { type: 'attack', unitIds: [art], target: idx(3, 5) });
      const c = s.lastCombat!;
      expect(c.attackerDice.length).toBe(1);
      expect(c.defenderDice.length).toBe(2);
      expect(s.units.some((u) => u.id === art)).toBe(true);
    }
  });

  it('pila mixta: el defensor elige el tipo', () => {
    let s = phase2Board();
    s.players[0].buildings = ['cuartel'];
    const a = put(s, 0, 'infanteria', 3, 3);
    put(s, 1, 'lancero', 2, 3);
    put(s, 1, 'lancero', 2, 3);
    put(s, 1, 'arquero', 2, 3);
    s = applyAction(s, 0, { type: 'attack', unitIds: [a], target: idx(2, 3) });
    expect(s.prompt?.kind).toBe('defenderChoice');
    s = applyAction(s, 1, { type: 'defenderChoice', unit: 'lancero' });
    expect(s.lastCombat!.defenderDice.length).toBe(2);
  });

  it('avance de toda la formación tras vaciar la loseta', () => {
    for (let seed = 1; seed < 60; seed++) {
      let s = phase2Board();
      s.rng = seed;
      s.players[0].buildings = ['caballerizas'];
      const cav = put(s, 0, 'caballeria', 3, 3);
      const inf = put(s, 0, 'infanteria', 3, 3);
      put(s, 1, 'infanteria', 3, 4);
      s = applyAction(s, 0, { type: 'attack', unitIds: [cav], target: idx(3, 4) });
      if (s.prompt?.kind !== 'advance') continue;
      s = applyAction(s, 0, { type: 'advance', accept: true });
      expect(s.units.find((u) => u.id === cav)!.pos).toBe(idx(3, 4));
      expect(s.units.find((u) => u.id === inf)!.pos).toBe(idx(3, 4));
      return;
    }
    throw new Error('ninguna semilla produjo victoria');
  });
});

describe('Murallas y Conquista', () => {
  it('posiciones de bombardeo (opción B)', () => {
    // Muralla sur de la Capital (2,2): adyacente (3,2), recta (4,2) y diagonales (3,1), (3,3).
    expect(bombardPositions(0, 'S').sort()).toEqual([idx(2, 1), idx(3, 1), idx(2, 0), idx(2, 2)].sort());
  });

  it('conquista automática por un lado sin Muralla y restauración de Murallas originales', () => {
    let s = phase2Board();
    s.players[0].buildings = ['cuartel'];
    s.players[1].originalWalls = ['S', 'O'];
    s.players[1].walls = ['S'];
    const cap = CAPITALS[1]; // (2,7)
    const west = cap - 1;
    const a = put(s, 0, 'infanteria', Math.floor(west / 8), west % 8);
    expect(attackTargets(s, a).capitals).toEqual([1]);
    s = applyAction(s, 0, { type: 'conquer', unitId: a, capital: 1 });
    expect(s.players[0].conquests).toEqual([1]);
    expect(s.players[1].walls.sort()).toEqual(['O', 'S']);
    expect(s.units.find((u) => u.id === a)!.pos).toBe(west); // no entra en la Capital
  });

  it('no se conquista por un lado con Muralla ni dos veces la misma Capital', () => {
    const s = phase2Board();
    s.players[0].buildings = ['cuartel'];
    s.players[1].walls = ['O'];
    const cap = CAPITALS[1];
    const a = put(s, 0, 'infanteria', Math.floor((cap - 1) / 8), (cap - 1) % 8);
    expect(attackTargets(s, a).capitals).toEqual([]);
    expect(attackTargets(s, a).walls).toEqual([{ capital: 1, side: 'O' }]);
    s.players[1].walls = [];
    s.players[0].conquests = [1];
    expect(attackTargets(s, a).capitals).toEqual([]);
  });

  it('tropa convencional contra Muralla: 1 contra 2 y sin bajas', () => {
    for (let seed = 1; seed < 30; seed++) {
      let s = phase2Board();
      s.rng = seed;
      s.players[0].buildings = ['cuartel'];
      s.players[1].walls = ['O'];
      const cap = CAPITALS[1];
      const a = put(s, 0, 'infanteria', Math.floor((cap - 1) / 8), (cap - 1) % 8);
      s = applyAction(s, 0, { type: 'attackWall', unitIds: [a], capital: 1, side: 'O' });
      expect(s.lastCombat!.attackerDice.length).toBe(1);
      expect(s.lastCombat!.defenderDice.length).toBe(2);
      expect(s.units.some((u) => u.id === a)).toBe(true);
    }
  });
});

describe('Economía y turno', () => {
  it('sin Ayuntamiento: una sola acción; construirlo habilita la militar', () => {
    let s = phase2Board();
    s.players[0].buildings = ['cuartel', 'mercado'];
    s = applyAction(s, 0, { type: 'build', building: 'ayuntamiento' });
    expect(s.players[0].buildings).toContain('ayuntamiento');
    s = applyAction(s, 0, { type: 'recruit', unit: 'infanteria', pos: RINGS[0].find((p) => s.cells[p].terrain === 'llanura')! });
    expect(() => applyAction(s, 0, { type: 'build', building: 'iglesia' })).toThrow();
  });

  it('sin Ayuntamiento, tras reclutar no se puede construir', () => {
    let s = phase2Board();
    s.players[0].buildings = ['cuartel'];
    s = applyAction(s, 0, { type: 'recruit', unit: 'infanteria', pos: RINGS[0][0] });
    expect(() => applyAction(s, 0, { type: 'build', building: 'iglesia' })).toThrow();
  });

  it('un único intercambio aceptado por turno', () => {
    let s = phase2Board();
    s.players[0].buildings = ['mercado'];
    const give = { comida: 1, madera: 0, piedra: 0, agua: 0 };
    const receive = { comida: 0, madera: 1, piedra: 0, agua: 0 };
    s = applyAction(s, 0, { type: 'proposeTrade', to: 1, give, receive });
    s = applyAction(s, 1, { type: 'respondTrade', accept: true });
    expect(s.players[0].resources.madera).toBe(21);
    expect(() => applyAction(s, 0, { type: 'proposeTrade', to: 2, give, receive })).toThrow();
  });

  it('el intercambio es siempre de 1 recurso por 1 recurso', () => {
    const s = phase2Board();
    s.players[0].buildings = ['mercado'];
    const two = { comida: 2, madera: 0, piedra: 0, agua: 0 };
    const one = { comida: 0, madera: 1, piedra: 0, agua: 0 };
    const none = { comida: 0, madera: 0, piedra: 0, agua: 0 };
    expect(() => applyAction(s, 0, { type: 'proposeTrade', to: 1, give: two, receive: one })).toThrow();
    expect(() => applyAction(s, 0, { type: 'proposeTrade', to: 1, give: none, receive: one })).toThrow();
  });

  it('quien propone puede retirar una oferta sin respuesta', () => {
    let s = phase2Board();
    s.players[0].buildings = ['mercado'];
    const give = { comida: 1, madera: 0, piedra: 0, agua: 0 };
    const receive = { comida: 0, madera: 1, piedra: 0, agua: 0 };
    s = applyAction(s, 0, { type: 'proposeTrade', to: 1, give, receive });
    expect(() => applyAction(s, 0, { type: 'endTurn' })).toThrow();
    expect(() => applyAction(s, 2, { type: 'cancelTrade' })).toThrow();
    s = applyAction(s, 0, { type: 'cancelTrade' });
    expect(s.prompt).toBeNull();
    expect(s.turn!.tradeDone).toBe(false);
    s = applyAction(s, 0, { type: 'endTurn' });
  });

  it('Mercado: 3 recursos iguales por 1 (A18)', () => {
    let s = phase2Board();
    s.players[0].buildings = ['mercado'];
    s.players[0].resources.comida = 2;
    expect(() => applyAction(s, 0, { type: 'convert', give: 'comida', get: 'piedra' })).toThrow();
    s.players[0].resources.comida = 3;
    s = applyAction(s, 0, { type: 'convert', give: 'comida', get: 'piedra' });
    expect(s.players[0].resources.comida).toBe(0);
    expect(s.players[0].resources.piedra).toBe(21);
  });

  it('Murallas en la Fase II: levantar, máximo 4 y no con enemigos en el lado (A20)', () => {
    let s = phase2Board();
    s = applyAction(s, 0, { type: 'buildWall', side: 'N' });
    expect(s.players[0].walls).toEqual(['N']);
    expect(s.players[0].originalWalls).toEqual(['N']);
    expect(s.players[0].resources.piedra).toBe(16);
    expect(s.players[0].resources.madera).toBe(19);
    expect(() => applyAction(s, 0, { type: 'buildWall', side: 'S' })).toThrow(); // ya usó la Acción Civil
    const t = phase2Board();
    put(t, 1, 'infanteria', 2, 1); // lado sur de la Capital 0 (fila 3, col 2)
    expect(() => applyAction(t, 0, { type: 'buildWall', side: 'S' })).toThrow();
    const u = phase2Board();
    u.players[0].originalWalls = ['N', 'S', 'E', 'O'];
    u.players[0].walls = ['N', 'S', 'E'];
    u.players[0].wallDestroyedTurn = {};
    expect(applyAction(u, 0, { type: 'buildWall', side: 'O' }).players[0].walls).toContain('O'); // reparar
  });

  it('reparar una Muralla destruida exige esperar una ronda y cuesta 3 Piedra (A20)', () => {
    const s = phase2Board();
    s.players[0].originalWalls = ['N'];
    s.players[0].walls = [];
    s.players[0].wallDestroyedTurn = { N: s.turnNumber - 2 };
    expect(() => applyAction(s, 0, { type: 'buildWall', side: 'N' })).toThrow();
    s.players[0].wallDestroyedTurn = { N: s.turnNumber - 6 };
    const r = applyAction(s, 0, { type: 'buildWall', side: 'N' });
    expect(r.players[0].walls).toEqual(['N']);
    expect(r.players[0].resources.piedra).toBe(17);
    expect(r.players[0].resources.madera).toBe(20);
  });

  it('el Mercado no convierte un recurso en sí mismo', () => {
    const s = phase2Board();
    s.players[0].buildings = ['mercado'];
    expect(() => applyAction(s, 0, { type: 'convert', give: 'comida', get: 'comida' })).toThrow();
  });

  it('victoria inmediata con 8 edificios y 1 Conquista', () => {
    let s = phase2Board();
    s.players[0].buildings = ['cuartel', 'arqueria', 'caballerizas', 'herreria', 'iglesia', 'mercado', 'biblioteca'];
    s.players[0].conquests = [2];
    s.players[0].resources = { comida: 50, madera: 50, piedra: 50, agua: 50 };
    s = applyAction(s, 0, { type: 'build', building: 'ayuntamiento' });
    expect(s.phase).toBe('GAME_OVER');
    expect(s.winner).toBe(0);
  });
});
