// Progreso hacia la victoria (0–100) para los gráficos de evolución. No afecta al juego.
import { VICTORY } from './rules';
import type { HistoryPoint } from './types';

/**
 * Un solo índice que integra todo: edificios hasta 40 puntos (5 por edificio), Conquistas hasta 40 (las
 * necesarias para ganar → 40) y tropas hasta 20 (1 por tropa, hasta 20). Quien gana termina con al menos 80.
 */
export const PROGRESS_PARTS = { buildings: 40, conquests: 40, units: 20 };
export function progress(p: HistoryPoint['players'][number]): number {
  const b = (Math.min(p.buildings, 8) / 8) * PROGRESS_PARTS.buildings;
  const c = (Math.min(p.conquests, VICTORY.conquests) / VICTORY.conquests) * PROGRESS_PARTS.conquests;
  const a = Math.min(p.units, PROGRESS_PARTS.units);
  return Math.round(b + c + a);
}
