// Uso: npx tsx scripts/simulate-phase1.ts [desde] [hasta]
// Juega Fases I aleatorias y cuenta intercambios de emergencia, tropas en reserva y errores.
import { playPhase1 } from '../src/engine/sim';

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 200);
const stats = { partidas: 0, fondo: 0, intercambio: 0, reserva: 0, errores: 0, lentas: 0 };
for (let seed = from; seed < to; seed++) {
  const t0 = Date.now();
  try {
    const log = playPhase1(seed).log.map((x) => x.text);
    stats.partidas++;
    if (log.some((t) => t.includes('fondo'))) stats.fondo++;
    if (log.some((t) => t.includes('intercambio de emergencia'))) stats.intercambio++;
    if (log.some((t) => t.includes('reserva'))) stats.reserva++;
  } catch (e) {
    stats.errores++;
    console.log('semilla', seed, String(e));
  }
  const dt = Date.now() - t0;
  if (dt > 2000) {
    stats.lentas++;
    console.log('semilla lenta', seed, dt, 'ms');
  }
}
console.log(stats);
