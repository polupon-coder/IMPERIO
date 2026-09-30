// Prueba de extremo a extremo: 4 clientes Socket.IO crean sala, eligen color, juegan la Fase I
// completa y comprueban la reconexión. Requiere el servidor en marcha (PORT, por defecto 3001).
import { io, type Socket } from 'socket.io-client';
import { exchangeOptions, initialPlacements, legalPlacements, ringSpots, SIDES, type Action, type GameState, type Seat } from '../src/engine';

const URL = `http://localhost:${process.env.PORT ?? 3001}`;
const emit = (s: Socket, ev: string, data?: unknown) => new Promise<any>((r) => s.emit(ev, data, r));
const ok = async (p: Promise<any>) => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r;
};
let rnd = 7;
const pick = <T>(a: T[]) => a[(rnd = (rnd * 1103515245 + 12345) % 2147483648) % a.length];

async function main() {
  const clients = Array.from({ length: 4 }, () => io(URL, { transports: ['websocket'] }));
  let state: any = null;
  clients[0].on('room', (r) => (state = r));
  const host = await ok(emit(clients[0], 'createRoom', { name: 'Ana' }));
  const tokens = [host.token];
  for (const [i, name] of ['Bea', 'Carlos', 'Dani'].entries())
    tokens.push((await ok(emit(clients[i + 1], 'joinRoom', { code: host.code, name }))).token);
  // Una Capital ocupada no puede elegirse
  const bad = await emit(clients[1], 'lobby', { seat: 0 });
  if (bad.ok) throw new Error('Debería rechazar una Capital ocupada');
  for (const c of clients) await ok(emit(c, 'lobby', { ready: true }));
  await ok(emit(clients[0], 'start'));
  await new Promise((r) => setTimeout(r, 100));
  const seatOf = (i: number) => state.players[i].seat as Seat;

  const act = (i: number, a: Action) => ok(emit(clients[i], 'action', a));
  let guard = 0;
  while (state.game.phase === 'PHASE_1') {
    if (++guard > 3000) throw new Error('bucle');
    const g: GameState = state.game;
    let done = false;
    for (let i = 0; i < 4 && !done; i++) {
      const seat = seatOf(i);
      const p = g.players[seat];
      const q = p.rewardQueue[0];
      if (q) {
        if (q.kind === 'choose') await act(i, { type: 'chooseReward', option: pick(q.options) });
        else if (q.kind === 'deploy') await act(i, { type: 'deployUnit', pos: pick(ringSpots(g, seat, q.unit)) });
        else await act(i, { type: 'placeWall', side: pick(SIDES.filter((x) => !p.originalWalls.includes(x))) });
        done = true;
      } else if (g.step === 'INITIAL_PLACEMENT' && p.initialTiles.length) {
        const t = pick(p.initialTiles);
        await act(i, { type: 'placeInitial', terrain: t, pos: pick(initialPlacements(g, seat, t)) });
        done = true;
      } else if (g.step === 'PILE_PLACEMENT' && g.order[g.current] === seat) {
        await act(i, { type: 'placeTile', pos: pick(legalPlacements(g, seat, g.pile[0])) });
        done = true;
      } else if (g.step === 'EXCHANGE' && g.order[g.current] === seat) {
        const o = pick(exchangeOptions(g, seat, g.exchangeTile!));
        await act(i, { type: 'exchange', from: o.from, to: o.to });
        done = true;
      } else if (g.step === 'FINAL_DEPLOY' && p.reserve.length) {
        await act(i, { type: 'deployReserve', index: 0, pos: pick(ringSpots(g, seat, p.reserve[0])) });
        done = true;
      }
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  console.log('Fase I completada vía red. Fase:', state.game.phase, '· turno', state.game.turnNumber);

  // Un jugador sin permiso no puede actuar
  const activeIdx = [0, 1, 2, 3].find((i) => seatOf(i) === state.game.order[state.game.current])!;
  const other = (activeIdx + 1) % 4;
  const denied = await emit(clients[other], 'action', { type: 'endTurn' });
  if (denied.ok) throw new Error('Debería rechazar acción fuera de turno');
  if (state.game.prompt?.kind === 'library') throw new Error('inesperado');
  await act(activeIdx, { type: 'endTurn' });
  await new Promise((r) => setTimeout(r, 50));
  console.log('Turno pasado. Turno actual:', state.game.turnNumber);

  // Reconexión: el cliente 2 se desconecta y vuelve con su token
  clients[2].disconnect();
  const again = io(URL, { transports: ['websocket'] });
  const rj = await ok(emit(again, 'rejoin', { code: host.code, token: tokens[2] }));
  console.log('Reconexión OK, jugador', rj.playerId, '· rng oculto:', state.game.rng === 0);
  again.disconnect();
  for (const c of clients) c.disconnect();
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error('FALLO', e);
    process.exit(1);
  },
);
