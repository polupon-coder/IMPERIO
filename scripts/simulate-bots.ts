// Uso: npx tsx scripts/simulate-bots.ts [partidas] [asiento0,asiento1,asiento2,asiento3]
// Partidas entre jugadores máquina (normal, facil o azar). Ej.: normal,facil,azar,azar
import { playBots, type SimPlayer } from '../src/engine/sim';

const n = Number(process.argv[2] ?? 20);
const players = (process.argv[3] ?? 'normal,normal,normal,normal').split(',') as SimPlayer[];
const wins = [0, 0, 0, 0];
let finished = 0, turns = 0, problems = 0;
const unfinished: number[] = [];
const t0 = Date.now();
for (let seed = 1; seed <= n; seed++) {
  // Se rota la asignación de asientos para no favorecer a ninguna Capital
  const rot = seed % 4;
  const seats = [0, 1, 2, 3].map((i) => players[(i + rot) % 4]);
  const rep = playBots(seed, seats);
  if (rep.problems.length) {
    problems++;
    console.log('semilla', seed, rep.problems.slice(0, 3));
  }
  if (rep.winner === null) unfinished.push(seed);
  if (rep.winner !== null) {
    finished++;
    turns += rep.turns;
    wins[(rep.winner + rot) % 4]++; // de vuelta al jugador original
  }
}
console.log({
  partidas: n,
  terminadas: finished,
  rondasMedias: finished ? Math.round(turns / finished / 4) : null,
  victorias: Object.fromEntries(players.map((p, i) => [`${i}:${p}`, wins[i]])),
  problemas: problems,
  sinTerminar: unfinished.join(' '),
  segundos: Math.round((Date.now() - t0) / 1000),
});
