// Uso: npx tsx scripts/simulate-games.ts [desde] [hasta]
// Juega partidas completas con jugadores aleatorios y busca errores, bloqueos y estados ilegales.
import { playGame } from '../src/engine/sim';

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 100);
const stats = { partidas: 0, victorias: 0, sinTerminar: 0, conquistas: 0, combates: 0, fe: 0, errores: 0, turnos: 0 };
for (let seed = from; seed < to; seed++) {
  try {
    const rep = playGame(seed);
    stats.partidas++;
    stats.turnos += rep.turns;
    if (rep.state.phase === 'GAME_OVER') stats.victorias++;
    else stats.sinTerminar++;
    const log = rep.state.log.map((x) => x.text);
    stats.conquistas += rep.state.players.reduce((n, p) => n + p.conquests.length, 0);
    stats.combates += log.filter((t) => t.includes(' contra [')).length;
    stats.fe += log.filter((t) => t.includes('usa Fe')).length;
    if (rep.problems.length) {
      stats.errores++;
      console.log('semilla', seed, rep.problems.slice(0, 5));
    }
  } catch (e) {
    stats.errores++;
    console.log('semilla', seed, 'excepción', (e as Error).stack);
  }
}
console.log({ ...stats, turnosMedios: Math.round(stats.turnos / Math.max(1, stats.partidas)) });
