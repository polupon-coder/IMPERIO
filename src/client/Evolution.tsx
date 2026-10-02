// Gráficos de evolución al terminar la partida: progreso hacia la victoria, quién iba en cabeza y detalle.
import { useState } from 'react';
import { progress, type GameState, type HistoryPoint, type Seat } from '../engine';
import { PLAYER_COLORS } from './assets';

type Metric = { key: string; title: string; value: (p: HistoryPoint['players'][number]) => number; max?: number; step?: number };

const PROGRESS: Metric = { key: 'progress', title: 'Progreso hacia la victoria · edificios, Conquistas y tropas', value: progress, max: 100, step: 25 };

/** Forma del marcador por asiento: identidad sin depender solo del color (rojo y verde se confunden con daltonismo). */
function Marker({ seat, x, y, color, r = 4.5 }: { seat: Seat; x: number; y: number; color: string; r?: number }) {
  const ring = { stroke: 'var(--chart-surface)', strokeWidth: 2, fill: color, paintOrder: 'stroke' as const };
  if (seat === 0) return <circle cx={x} cy={y} r={r} {...ring} />;
  if (seat === 1) return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1} {...ring} />;
  if (seat === 2) return <path d={`M${x},${y - r * 1.2} L${x + r * 1.15},${y + r * 0.9} L${x - r * 1.15},${y + r * 0.9} Z`} {...ring} />;
  return <path d={`M${x},${y - r * 1.25} L${x + r * 1.25},${y} L${x},${y + r * 1.25} L${x - r * 1.25},${y} Z`} {...ring} />;
}

function niceMax(v: number) {
  if (v <= 5) return Math.max(1, Math.ceil(v));
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

function LineChart({ s, history, metric, height, big }: { s: GameState; history: HistoryPoint[]; metric: Metric; height: number; big?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  // En el móvil (y en los pequeños) se dibuja más estrecho para que el texto no encoja
  const narrow = typeof window !== 'undefined' && window.innerWidth <= 900;
  const wide = big && !narrow;
  const W = wide ? 640 : 340;
  const H = wide ? height : Math.round(height * (big ? 0.72 : 1));
  const pad = { l: wide ? 34 : 30, r: wide ? 96 : 12, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = history.length;
  const dataMax = Math.max(1, ...history.flatMap((h) => h.players.map((p) => metric.value(p))));
  const max = metric.max ?? niceMax(dataMax);
  const step = metric.step ?? ([4, 5, 2].map((d) => max / d).find((v) => Number.isInteger(v)) ?? max / 4);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const seats = s.order.slice().sort((a, b) => a - b) as Seat[];
  const xTicks = history.map((h, i) => ({ i, r: h.round })).filter((t, k, a) => k === 0 || k === a.length - 1 || t.r % Math.max(1, Math.ceil(n / 8)) === 0);

  // Etiquetas finales solo si no chocan (si no, quedan la leyenda y la información al pasar el ratón)
  const ends = seats.map((seat) => ({ seat, y: y(metric.value(history[n - 1].players[seat])) })).sort((a, b) => a.y - b.y);
  const labelOk = ends.every((e, k) => k === 0 || e.y - ends[k - 1].y >= 13);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = n > 1 ? Math.round(((px - pad.l) / iw) * (n - 1)) : 0;
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hp = hover !== null ? history[hover] : null;

  return (
    <figure className={`evo-chart ${big ? 'big' : ''}`}>
      <figcaption>{metric.title}</figcaption>
      <div className="evo-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.title} por ronda`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="evo-grid" />
              <text x={pad.l - 6} y={y(t) + 4} className="evo-axis" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.i} x={x(t.i)} y={H - 6} className="evo-axis" textAnchor="middle">
              {t.r}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="evo-cross" />}
          {seats.map((seat) => {
            const color = PLAYER_COLORS[s.players[seat].color];
            const pts = history.map((h, i) => `${x(i)},${y(metric.value(h.players[seat]))}`).join(' ');
            return (
              <g key={seat}>
                <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {history.map((h, i) =>
                  i === n - 1 || i === hover || (big && n <= 24) ? (
                    <Marker key={i} seat={seat} x={x(i)} y={y(metric.value(h.players[seat]))} color={color} r={i === hover ? 5.5 : 4.5} />
                  ) : null,
                )}
              </g>
            );
          })}
          {wide &&
            labelOk &&
            ends.map((e) => (
              <text key={e.seat} x={pad.l + iw + 10} y={e.y + 4} className="evo-label">
                {s.players[e.seat].name}
              </text>
            ))}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hp && (
          <div className="evo-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
            <b>Ronda {hp.round}</b>
            {seats
              .map((seat) => ({ seat, v: metric.value(hp.players[seat]) }))
              .sort((a, b) => b.v - a.v)
              .map(({ seat, v }) => (
                <div key={seat} className="evo-tip-row">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <Marker seat={seat} x={7} y={7} color={PLAYER_COLORS[s.players[seat].color]} r={4} />
                  </svg>
                  <span>{s.players[seat].name}</span>
                  <b>{v}</b>
                  {big && (
                    <small className="evo-tip-parts">
                      {hp.players[seat].buildings} ed. · {hp.players[seat].conquests} conq. · {hp.players[seat].units} trop.
                    </small>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Quién iba en cabeza en cada ronda según el progreso (empate: gris). */
function leaders(history: HistoryPoint[], seats: Seat[]) {
  return history.map((h) => {
    const vals = seats.map((seat) => ({ seat, v: progress(h.players[seat]) }));
    const best = Math.max(...vals.map((x) => x.v));
    const top = vals.filter((x) => x.v === best);
    return top.length === 1 && best > 0 ? top[0].seat : null;
  });
}

export function EvolutionDialogBody({ state: s }: { state: GameState }) {
  const history = s.history ?? [];
  const [table, setTable] = useState(false);
  const seats = s.order.slice().sort((a, b) => a - b) as Seat[];
  if (history.length < 2) return <p className="center muted">No hay datos suficientes de esta partida.</p>;
  const lead = leaders(history, seats);
  const counts = seats.map((seat) => ({ seat, n: lead.filter((l) => l === seat).length })).sort((a, b) => b.n - a.n);
  return (
    <div className="evolution">
      <div className="evo-legend">
        {seats.map((seat) => (
          <span key={seat}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <Marker seat={seat} x={7} y={7} color={PLAYER_COLORS[s.players[seat].color]} r={4} />
            </svg>
            {s.players[seat].name}
          </span>
        ))}
        <button className="link" onClick={() => setTable((t) => !t)}>
          {table ? 'Ver gráficos' : 'Ver tabla'}
        </button>
      </div>
      {table ? (
        <div className="evo-table-wrap">
          <table className="evo-table">
            <thead>
              <tr>
                <th>Ronda</th>
                {seats.map((seat) => (
                  <th key={seat}>{s.players[seat].name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.round}>
                  <td>{h.round}</td>
                  {seats.map((seat) => (
                    <td key={seat}>
                      {progress(h.players[seat])} <small>({h.players[seat].buildings} ed. · {h.players[seat].conquests} conq. · {h.players[seat].units} trop.)</small>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <LineChart s={s} history={history} metric={PROGRESS} height={300} big />
          <div className="evo-lead">
            <span className="evo-lead-title">En cabeza</span>
            <div className="evo-strip">
              {lead.map((l, i) => (
                <span
                  key={i}
                  title={`Ronda ${history[i].round}: ${l === null ? 'empate' : s.players[l].name}`}
                  style={{ background: l === null ? '#cbbd9f' : PLAYER_COLORS[s.players[l].color] }}
                />
              ))}
            </div>
          </div>
          <p className="evo-summary">
            {counts
              .filter((c) => c.n > 0)
              .map((c) => `${s.players[c.seat].name} fue en cabeza ${c.n} ${c.n === 1 ? 'ronda' : 'rondas'}`)
              .join(' · ')}
            .
          </p>
          <p className="evo-note">
            Un solo índice que lo integra todo: edificios hasta 40 puntos (5 por edificio), Conquistas hasta 40 (20 por
            Conquista) y tropas hasta 20 (1 por tropa). Quien gana termina con al menos 80.
          </p>
        </>
      )}
    </div>
  );
}
