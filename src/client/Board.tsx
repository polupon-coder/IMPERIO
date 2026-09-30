import {
  NAMES,
  SIDES,
  capitalSeatAt,
  coordLabel,
  ringOwner,
  type GameState,
  type Seat,
  type Side,
  type Unit,
} from '../engine';
import { PLAYER_COLORS, TILE_IMAGES, capitalImage, unitFigure } from './assets';

export type Mark = 'legal' | 'move' | 'attack' | 'conquer' | 'from' | 'selected';

export interface BoardProps {
  state: GameState;
  marks: Map<number, Mark>;
  wallTargets: Array<{ capital: Seat; side: Side }>;
  selectedUnits: string[];
  activatedUnits: string[];
  ghosts: Map<number, string[]>;
  onCell: (pos: number) => void;
  onUnit: (u: Unit) => void;
  onWall: (capital: Seat, side: Side) => void;
}

const MARK_TITLE: Record<Mark, string> = {
  legal: 'Posición legal',
  move: 'Puede moverse aquí',
  attack: 'Objetivo de ataque',
  conquer: 'Conquistar',
  from: 'Seleccionable',
  selected: 'Seleccionada',
};

export function Board(p: BoardProps) {
  const { state: s } = p;
  const colorOf = (seat: Seat) => PLAYER_COLORS[s.players[seat].color];
  return (
    <div className="board-wrap">
      <div className="board">
        {s.cells.map((cell, pos) => {
          const cap = capitalSeatAt(pos);
          const ring = ringOwner(pos);
          const units = s.units.filter((u) => u.pos === pos);
          const mark = p.marks.get(pos);
          const img = cap !== null ? capitalImage(s.players[cap].color) : cell.terrain ? TILE_IMAGES[cell.terrain] : null;
          return (
            <div
              key={pos}
              className={`cell ${cell.terrain ?? (cap !== null ? 'capital' : 'empty')} ${mark ? 'mark-' + mark : ''}`}
              style={
                ring !== null && s.phase === 'PHASE_1'
                  ? { boxShadow: `inset 0 0 0 2px ${colorOf(ring)}55` }
                  : undefined
              }
              title={`${coordLabel(pos)} ${cap !== null ? 'Capital de ' + s.players[cap].name : cell.terrain ? NAMES.terrain[cell.terrain] : 'vacía'}${mark ? ' · ' + MARK_TITLE[mark] : ''}`}
              onClick={() => p.onCell(pos)}
            >
              {img && (
                <img
                  className="tile-img"
                  src={img}
                  alt=""
                  draggable={false}
                />
              )}
              {cap !== null && <Walls state={s} seat={cap} targets={p.wallTargets} onWall={p.onWall} />}
              {units.length > 0 && (
                <div className={`stack n${units.length}`}>
                  {units.map((u) => (
                    <button
                      key={u.id}
                      className={`token ${p.selectedUnits.includes(u.id) ? 'sel' : ''} ${p.activatedUnits.includes(u.id) ? 'used' : ''}`}
                      style={{ ['--owner' as string]: colorOf(u.owner) }}
                      title={`${NAMES.unit[u.type]} de ${s.players[u.owner].name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onUnit(u);
                      }}
                    >
                      <img src={unitFigure(s.players[u.owner].color, u.type)} alt={NAMES.unit[u.type]} draggable={false} />
                    </button>
                  ))}
                </div>
              )}
              {p.ghosts.get(pos)?.map((g, i) => (
                <div key={i} className="ghost" title="Tropa en reserva, pendiente de desplegar">
                  {g}
                </div>
              ))}
              {mark && <div className="mark-overlay" />}
            </div>
          );
        })}
      </div>
      <div className="axis cols">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className="axis rows">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
    </div>
  );
}

function Walls({
  state: s,
  seat,
  targets,
  onWall,
}: {
  state: GameState;
  seat: Seat;
  targets: Array<{ capital: Seat; side: Side }>;
  onWall: (c: Seat, side: Side) => void;
}) {
  const pl = s.players[seat];
  return (
    <>
      {SIDES.map((side) => {
        const intact = pl.walls.includes(side);
        const original = pl.originalWalls.includes(side);
        if (!intact && !original) return null;
        const target = targets.some((t) => t.capital === seat && t.side === side);
        return (
          <div
            key={side}
            className={`wall wall-${side} ${intact ? 'intact' : 'destroyed'} ${target ? 'target' : ''}`}
            style={{ ['--owner' as string]: PLAYER_COLORS[pl.color] }}
            title={`Muralla ${NAMES.side[side]}${intact ? '' : ' (destruida)'}${target ? ' · atacar' : ''}`}
            onClick={(e) => {
              if (!target) return;
              e.stopPropagation();
              onWall(seat, side);
            }}
          />
        );
      })}
    </>
  );
}


