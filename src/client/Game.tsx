import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAPITALS,
  RINGS,
  BUILDINGS,
  BUILDING_COST,
  MAX_PER_TYPE,
  NAMES,
  RESOURCES,
  SIDES,
  UNIT_COST,
  UNIT_TYPES,
  activationOf,
  attackAvailable,
  attackTargets,
  canAfford,
  canUseCivil,
  canUseMilitary,
  costLabel,
  emptyResources,
  exchangeOptions,
  groupCandidates,
  initialPlacements,
  isUnlocked,
  legalPlacements,
  moveTargets,
  ringSpots,
  stepsLeft,
  unitById,
  unitCount,
  type Action,
  type Building,
  type GameState,
  type Resource,
  type Resources,
  type Seat,
  type Side,
  type Terrain,
  type Unit,
  type UnitType,
} from '../engine';
import { PLAYER_COLORS, TILE_IMAGES, UNIT_IMAGES, WALL_ICON, WALL_SILHOUETTE, WALL_TOKEN, buildingImage, resourceIcon, unitFigure } from './assets';
import { Board, type Mark } from './Board';
import { call, type PublicRoom } from './socket';

type Mode =
  | { kind: 'none' }
  | { kind: 'initial'; terrain: Terrain }
  | { kind: 'reserve'; index: number }
  | { kind: 'exchangeTo'; from: number }
  | { kind: 'unit'; unitId: string; group: string[] }
  | { kind: 'recruit'; unit: UnitType };

const STEP_LABEL: Record<string, string> = {
  INITIAL_PLACEMENT: 'Losetas iniciales',
  PILE_PLACEMENT: 'Colocación de la pila',
  EXCHANGE: 'Intercambio de emergencia',
  BLOCKED: 'Bloqueo',
  FINAL_DEPLOY: 'Despliegue final',
  TURN: 'Turno',
  END: 'Fin',
};
const PHASE_LABEL: Record<string, string> = {
  SETUP: 'Preparación',
  PHASE_1: 'Fase I',
  PHASE_2: 'Fase II',
  GAME_OVER: 'Partida terminada',
};

export function Game({
  room,
  me,
  onExit,
}: {
  room: PublicRoom;
  me: PublicRoom['players'][number];
  onExit: () => void;
}) {
  const s = room.game!;
  const mySeat = me.seat as Seat;
  const my = s.players[mySeat];
  const active = s.order[s.current];
  const myTurn = active === mySeat;
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [error, setError] = useState('');
  const [tradeOpen, setTradeOpen] = useState(false);

  // Si la selección deja de ser válida tras una actualización, se limpia.
  useEffect(() => {
    if (mode.kind === 'unit' && !unitById(s, mode.unitId)) setMode({ kind: 'none' });
    if (mode.kind === 'initial' && !my.initialTiles.includes(mode.terrain)) setMode({ kind: 'none' });
    if (mode.kind === 'reserve' && !my.reserve[mode.index]) setMode({ kind: 'none' });
    if (!myTurn && (mode.kind === 'unit' || mode.kind === 'recruit' || mode.kind === 'exchangeTo'))
      setMode({ kind: 'none' });
  }, [room.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: Action, keepMode = false) => {
    const r = await call('action', action);
    if (!r.ok) setError(r.error ?? 'Acción no válida');
    else {
      setError('');
      if (!keepMode) setMode({ kind: 'none' });
    }
    return r.ok;
  };

  const front = my.rewardQueue[0];
  const exOpts = useMemo(
    () => (s.step === 'EXCHANGE' && myTurn && s.exchangeTile ? exchangeOptions(s, mySeat, s.exchangeTile) : []),
    [room.version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ------------------------------------------------------------------ resaltados
  const { marks, wallTargets } = useMemo(() => {
    const marks = new Map<number, Mark>();
    let wallTargets: Array<{ capital: Seat; side: Side }> = [];
    const mark = (list: Iterable<number>, m: Mark) => {
      for (const p of list) marks.set(p, m);
    };
    if (s.phase === 'PHASE_1') {
      if (front?.kind === 'deploy') mark(ringSpots(s, mySeat, front.unit), 'legal');
      else if (mode.kind === 'initial') mark(initialPlacements(s, mySeat, mode.terrain), 'legal');
      else if (mode.kind === 'reserve') mark(ringSpots(s, mySeat, my.reserve[mode.index]), 'legal');
      else if (s.step === 'PILE_PLACEMENT' && myTurn && !front) mark(legalPlacements(s, mySeat, s.pile[0]), 'legal');
      else if (s.step === 'EXCHANGE' && myTurn) {
        if (mode.kind === 'exchangeTo') {
          mark(exOpts.filter((o) => o.from === mode.from).map((o) => o.to), 'legal');
          marks.set(mode.from, 'selected');
        } else mark(new Set(exOpts.map((o) => o.from)), 'from');
      }
    } else if (s.phase === 'PHASE_2' && myTurn && !s.prompt && !s.combat) {
      if (mode.kind === 'recruit') mark(ringSpots(s, mySeat, mode.unit), 'legal');
      if (mode.kind === 'unit') {
        mark(moveTargets(s, mode.unitId).keys(), 'move');
        const t = attackTargets(s, mode.unitId);
        mark(t.troops, 'attack');
        for (const c of t.capitals) marks.set(capitalPos(c), 'conquer');
        wallTargets = t.walls;
      }
    }
    return { marks, wallTargets };
  }, [room.version, mode, exOpts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tropas en reserva: se muestran momentáneamente en una casilla vacía del anillo.
  const ghosts = useMemo(() => {
    const g = new Map<number, string[]>();
    if (s.phase !== 'PHASE_1') return g;
    for (const p of s.players) {
      if (!p.reserve.length) continue;
      const ring = ringOf(p.seat);
      const spot = ring.find((i) => s.cells[i].terrain === null) ?? ring[0];
      g.set(spot, [...(g.get(spot) ?? []), ...p.reserve.map((t) => NAMES.unit[t][0])]);
    }
    return g;
  }, [room.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ clics
  const onCell = (pos: number) => {
    const m = marks.get(pos);
    if (s.phase === 'PHASE_1') {
      if (front?.kind === 'deploy' && m) return send({ type: 'deployUnit', pos });
      if (mode.kind === 'initial' && m) return send({ type: 'placeInitial', terrain: mode.terrain, pos });
      if (mode.kind === 'reserve' && m) return send({ type: 'deployReserve', index: mode.index, pos });
      if (s.step === 'PILE_PLACEMENT' && m) return send({ type: 'placeTile', pos });
      if (s.step === 'EXCHANGE' && myTurn) {
        if (m === 'from') return setMode({ kind: 'exchangeTo', from: pos });
        if (mode.kind === 'exchangeTo' && m === 'legal') return send({ type: 'exchange', from: mode.from, to: pos });
        return setMode({ kind: 'none' });
      }
      return;
    }
    if (mode.kind === 'recruit' && m) return send({ type: 'recruit', unit: mode.unit, pos });
    if (mode.kind === 'unit') {
      if (m === 'move') return send({ type: 'move', unitId: mode.unitId, to: pos }, true);
      if (m === 'attack') return send({ type: 'attack', unitIds: [mode.unitId, ...mode.group], target: pos });
      if (m === 'conquer') {
        const cap = ([0, 1, 2, 3] as Seat[]).find((c) => capitalPos(c) === pos)!;
        return send({ type: 'conquer', unitId: mode.unitId, capital: cap });
      }
    }
    setMode({ kind: 'none' });
  };

  const onUnit = (u: Unit) => {
    if (s.phase === 'PHASE_2' && myTurn && u.owner === mySeat && !marks.get(u.pos)) {
      if (mode.kind === 'unit' && mode.unitId === u.id) return setMode({ kind: 'none' });
      return setMode({ kind: 'unit', unitId: u.id, group: [] });
    }
    onCell(u.pos);
  };

  const onWall = (capital: Seat, side: Side) => {
    if (mode.kind === 'unit') send({ type: 'attackWall', unitIds: [mode.unitId, ...mode.group], capital, side });
  };

  const military = s.turn?.military;
  const activated = military ? Object.keys(military.activations) : [];

  return (
    <div className="game">
      <header className="topbar">
        <span className="brand">IMPERIO</span>
        <span className="phase">
          {PHASE_LABEL[s.phase]} · {s.phase === 'PHASE_2' ? `Turno ${s.turnNumber}` : STEP_LABEL[s.step]}
        </span>
        {s.phase !== 'GAME_OVER' && s.step !== 'INITIAL_PLACEMENT' && s.step !== 'FINAL_DEPLOY' && (
          <span
            className="active-player"
            style={{ background: myTurn ? '#3f7d3a' : PLAYER_COLORS[s.players[active].color] }}
          >
            {myTurn ? 'Tu turno' : `Turno de ${s.players[active].name}`}
          </span>
        )}
        {s.phase === 'PHASE_2' && myTurn && (
          <span className="turn-actions">
            <ActionStatus state={s} />
            {s.turn?.military?.open && (
              <button disabled={!!s.prompt || !!s.combat} onClick={() => send({ type: 'endMilitary' })}>
                Terminar acción militar
              </button>
            )}
            <button className="end-turn-top" disabled={!!s.prompt || !!s.combat} onClick={() => send({ type: 'endTurn' })}>
              Terminar turno
            </button>
          </span>
        )}
        <span className="room-code">
          Sala {room.code}
          <button className="link" onClick={onExit}>
            salir
          </button>
        </span>
      </header>

      {tradeOpen && <TradeDialog state={s} mySeat={mySeat} send={send} onClose={() => setTradeOpen(false)} />}
      {s.prompt?.kind === 'trade' && s.prompt.seat === mySeat && <OfferDialog state={s} send={send} />}
      <main className="layout">
        <section className="board-col">
          <Board
            state={s}
            marks={marks}
            wallTargets={wallTargets}
            selectedUnits={mode.kind === 'unit' ? [mode.unitId, ...mode.group] : []}
            activatedUnits={activated}
            ghosts={ghosts}
            onCell={onCell}
            onUnit={onUnit}
            onWall={onWall}
          />
          {s.phase === 'PHASE_2' && myTurn && <TurnHint state={s} mode={mode} setMode={setMode} />}
          <CombatView state={s} />
        </section>

        <aside className="side">
          {s.phase === 'GAME_OVER' && s.winner !== null && (
            <div className="card winner" style={{ borderColor: PLAYER_COLORS[s.players[s.winner].color] }}>
              <h2>¡{s.players[s.winner].name} gana IMPERIO!</h2>
              <p>8 edificios y {s.players[s.winner].conquests.length} Conquista(s).</p>
            </div>
          )}
          {error && (
            <div className="card error-card" onClick={() => setError('')}>
              {error}
            </div>
          )}
          <PromptPanel state={s} mySeat={mySeat} send={send} />
          {/* El panel de jugadores establecido va siempre arriba; las acciones del turno, debajo. */}
          <PlayersPanel
            state={s}
            room={room}
            mySeat={mySeat}
            onBuild={(b) => send({ type: 'build', building: b })}
            onRecruit={(u) => setMode({ kind: 'recruit', unit: u })}
            recruiting={mode.kind === 'recruit' ? mode.unit : null}
          />
          <ChatBar room={room} state={s} mySeat={mySeat} onTrade={() => setTradeOpen(true)} />
          {s.phase === 'PHASE_1' && (
            <Phase1Panel state={s} mySeat={mySeat} mode={mode} setMode={setMode} send={send} />
          )}
        </aside>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const capitalPos = (c: Seat) => CAPITALS[c];
const ringOf = (c: Seat) => RINGS[c];

type Send = (a: Action, keep?: boolean) => Promise<boolean>;

function TileChip({ t }: { t: Terrain }) {
  return (
    <span className="tile-chip">
      <img src={TILE_IMAGES[t]} alt="" />
      {NAMES.terrain[t]}
    </span>
  );
}

function PromptPanel({ state: s, mySeat, send }: { state: GameState; mySeat: Seat; send: Send }) {
  const pr = s.prompt;
  if (!pr) return null;
  const who = s.players[pr.seat];
  if (pr.seat !== mySeat) {
    const what: Record<string, string> = {
      library: 'elegir el recurso de su Biblioteca',
      defenderChoice: 'elegir qué tipo de tropa defiende',
      faith: 'decidir si usa Fe',
      advance: 'decidir si avanza',
      trade: 'responder a una oferta de comercio',
    };
    return (
      <div className="card waiting">
        Esperando a <b>{who.name}</b>: {what[pr.kind]}…
      </div>
    );
  }
  if (pr.kind === 'trade') return null; // se muestra en el panel flotante OfferDialog
  return (
    <div className="card prompt">
      {pr.kind === 'library' && (
        <>
          <h3>Biblioteca</h3>
          <p>Elige 1 recurso cualquiera.</p>
          <div className="row">
            {RESOURCES.map((r) => (
              <button key={r} onClick={() => send({ type: 'libraryChoice', resource: r })}>
                {NAMES.resource[r]}
              </button>
            ))}
          </div>
        </>
      )}
      {pr.kind === 'defenderChoice' && (
        <>
          <h3>¡Te atacan!</h3>
          <p>
            {s.players[s.combat!.attacker].name} ataca con {s.combat!.attackerUnits.length}{' '}
            {NAMES.unit[s.combat!.attackerType]} a distancia {s.combat!.distance}. Elige qué tipo defiende:
          </p>
          <div className="row">
            {pr.options.map((u) => (
              <button key={u} onClick={() => send({ type: 'defenderChoice', unit: u })}>
                {NAMES.unit[u]}
              </button>
            ))}
          </div>
        </>
      )}
      {pr.kind === 'faith' && (
        <>
          <h3>Fe</h3>
          <p>
            Tus dados: <Dice values={pr.role === 'attacker' ? s.combat!.attackerDice : s.combat!.defenderDice} />
            <br />
            Rival: <Dice values={pr.role === 'attacker' ? s.combat!.defenderDice : s.combat!.attackerDice} />
          </p>
          <p>¿Pagas 1 Agua para repetir toda tu tirada? El nuevo resultado es obligatorio.</p>
          <div className="row">
            <button className="primary" onClick={() => send({ type: 'faith', use: true })}>
              Usar Fe (1 Agua)
            </button>
            <button onClick={() => send({ type: 'faith', use: false })}>No</button>
          </div>
        </>
      )}
      {pr.kind === 'advance' && (
        <>
          <h3>Avance tras el combate</h3>
          <p>La loseta ha quedado libre. ¿Avanza toda tu formación?</p>
          <div className="row">
            <button className="primary" onClick={() => send({ type: 'advance', accept: true })}>
              Avanzar
            </button>
            <button onClick={() => send({ type: 'advance', accept: false })}>Quedarse</button>
          </div>
        </>
      )}
    </div>
  );
}

function Phase1Panel({
  state: s,
  mySeat,
  mode,
  setMode,
  send,
}: {
  state: GameState;
  mySeat: Seat;
  mode: Mode;
  setMode: (m: Mode) => void;
  send: Send;
}) {
  const my = s.players[mySeat];
  const front = my.rewardQueue[0];
  const active = s.order[s.current];
  const myTurn = active === mySeat;
  return (
    <div className="card">
      <h3>Creación del Mundo</h3>
      {front?.kind === 'choose' && (
        <div className="prompt-inline">
          <p>Recompensa de {NAMES.terrain[front.from]}: elige</p>
          <div className="row">
            {front.options.map((o) => (
              <button key={o} className="primary" onClick={() => send({ type: 'chooseReward', option: o })}>
                {o === 'muralla' ? (
                  <>
                    <img className="icon wall-icon" src={WALL_ICON} alt="" /> Muralla
                  </>
                ) : (
                  NAMES.unit[o]
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {front?.kind === 'deploy' && (
        <p className="hint">
          Despliega tu <b>{NAMES.unit[front.unit]}</b>: haz clic en una casilla resaltada de tu anillo.
        </p>
      )}
      {front?.kind === 'wall' && (
        <div className="prompt-inline">
          <p>Coloca tu Muralla en un lado de tu Capital:</p>
          <div className="row">
            {SIDES.filter((x) => !my.originalWalls.includes(x)).map((x) => (
              <button key={x} onClick={() => send({ type: 'placeWall', side: x })}>
                {NAMES.side[x]}
              </button>
            ))}
          </div>
        </div>
      )}

      {s.step === 'INITIAL_PLACEMENT' && !front && (
        <>
          {my.initialTiles.length ? (
            <>
              <p>Coloca tus losetas iniciales en tu anillo. Elige una:</p>
              <div className="row">
                {my.initialTiles.map((t, i) => (
                  <button
                    key={t + i}
                    className={mode.kind === 'initial' && mode.terrain === t ? 'selected' : ''}
                    onClick={() => setMode({ kind: 'initial', terrain: t })}
                  >
                    <TileChip t={t} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Esperando a que los demás coloquen sus losetas iniciales…</p>
          )}
        </>
      )}

      {(s.step === 'PILE_PLACEMENT' || s.step === 'EXCHANGE') && (
        <p>
          {myTurn ? 'Te toca' : `Turno de ${s.players[active].name}`} · Loseta{' '}
          <TileChip t={s.step === 'EXCHANGE' ? s.exchangeTile! : s.pile[0]} />
          {myTurn && s.step === 'PILE_PLACEMENT' && !front && ' — haz clic en una casilla resaltada.'}
        </p>
      )}
      {s.step === 'EXCHANGE' && myTurn && (
        <p className="hint">
          Bloqueo absoluto. Elige una loseta terrestre a mover (resaltada) y después su nuevo destino. La loseta
          pendiente ocupará el hueco.
        </p>
      )}
      {s.step === 'BLOCKED' && <p className="error">Bloqueo sin solución prevista por el reglamento.</p>}
      <p className="muted">
        Pila: {s.pile.length} losetas · Te quedan {my.placementsLeft} colocaciones
      </p>

      {my.reserve.length > 0 && (
        <div className="prompt-inline">
          <p>Tropas en reserva (sin casilla legal al recibirlas):</p>
          <div className="row">
            {my.reserve.map((t, i) => (
              <button
                key={i}
                className={mode.kind === 'reserve' && mode.index === i ? 'selected' : ''}
                disabled={ringSpots(s, mySeat, t).length === 0}
                onClick={() => setMode({ kind: 'reserve', index: i })}
              >
                Desplegar {NAMES.unit[t]}
              </button>
            ))}
          </div>
        </div>
      )}
      {s.step === 'FINAL_DEPLOY' && !my.reserve.length && (
        <p className="muted">Esperando a que los demás desplieguen su reserva…</p>
      )}
    </div>
  );
}

/** Qué puede construir y reclutar ahora el jugador activo (para marcarlo en su panel). */
function buildable(s: GameState, seat: Seat, b: Building) {
  const my = s.players[seat];
  if (s.turn?.seat !== seat || s.prompt || s.combat || !canUseCivil(s)) return false;
  if (my.buildings.includes(b)) return false;
  if (b === 'ayuntamiento' && my.buildings.length < 2) return false;
  return canAfford(my.resources, BUILDING_COST[b]);
}
function recruitable(s: GameState, seat: Seat, u: UnitType) {
  const my = s.players[seat];
  if (s.turn?.seat !== seat || s.prompt || s.combat || !canUseMilitary(s) || s.turn.military) return false;
  return (
    isUnlocked(s, seat, u) &&
    unitCount(s, seat, u) < MAX_PER_TYPE &&
    ringSpots(s, seat, u).length > 0 &&
    canAfford(my.resources, UNIT_COST[u])
  );
}

/** Estado de las acciones del turno, para la barra superior. */
function ActionStatus({ state: s }: { state: GameState }) {
  const t = s.turn!;
  const mil = t.military;
  const nAct = mil ? Object.keys(mil.activations).length : 0;
  const civil = t.civilUsed ? 'usada' : canUseCivil(s) ? 'libre' : '—';
  const military = mil?.open ? `${nAct}/3` : t.militaryUsed ? 'usada' : canUseMilitary(s) ? 'libre' : '—';
  return (
    <span
      className="action-status"
      title="Pulsa un edificio de tu panel para construir, una figura de tu Ejército para reclutar o una tropa del tablero para moverla o atacar."
    >
      Civil: <b>{civil}</b> · Militar: <b>{military}</b>
    </span>
  );
}

/** Aviso flotante sobre el tablero: tropa seleccionada o reclutamiento en curso. */
function TurnHint({ state: s, mode, setMode }: { state: GameState; mode: Mode; setMode: (m: Mode) => void }) {
  if (mode.kind !== 'unit' && mode.kind !== 'recruit') return null;
  return (
    <div className="card turn-hint">
      {mode.kind === 'unit' && <UnitPanel state={s} mode={mode} setMode={setMode} />}
      {mode.kind === 'recruit' && (
        <p>
          Elige una casilla resaltada de tu anillo para el {NAMES.unit[mode.unit]}.{' '}
          <button className="link" onClick={() => setMode({ kind: 'none' })}>
            cancelar
          </button>
        </p>
      )}
    </div>
  );
}

function UnitPanel({
  state: s,
  mode,
  setMode,
}: {
  state: GameState;
  mode: Extract<Mode, { kind: 'unit' }>;
  setMode: (m: Mode) => void;
}) {
  const u = unitById(s, mode.unitId);
  if (!u) return null;
  const a = activationOf(s, u);
  const steps = stepsLeft(s, u, a);
  const canAtt = attackAvailable(s, u, a);
  const unlocked = isUnlocked(s, u.owner, u.type);
  const cands = groupCandidates(s, u.id);
  const acts = s.turn?.military?.activations ?? {};
  const budget = 3 - Object.keys(acts).length - (acts[u.id] ? 0 : 1);
  return (
    <div className="unit-panel">
      <p>
        <img className="icon" src={UNIT_IMAGES[u.type]} alt="" /> <b>{NAMES.unit[u.type]}</b> seleccionada ·{' '}
        {steps ? `puede mover ${steps}` : 'sin movimiento'} ·{' '}
        {canAtt ? (unlocked ? 'puede atacar' : 'no puede atacar (falta edificio)') : 'sin ataque'}
      </p>
      {cands.length > 0 && canAtt && unlocked && (
        <div>
          <small>Ataque agrupado (+1 dado por figura):</small>
          <div className="row">
            {cands.map((id, i) => {
              const on = mode.group.includes(id);
              const fresh = !acts[id];
              const disabled = !on && fresh && mode.group.filter((g) => !acts[g]).length >= budget;
              return (
                <label key={id} className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() =>
                      setMode({ ...mode, group: on ? mode.group.filter((g) => g !== id) : [...mode.group, id] })
                    }
                  />
                  {NAMES.unit[u.type]} #{i + 2}
                </label>
              );
            })}
          </div>
        </div>
      )}
      <p className="legend">
        <span className="lg move" /> mover <span className="lg attack" /> atacar <span className="lg conquer" /> conquistar
        · Murallas atacables parpadean
      </p>
    </div>
  );
}

function Sel({ value, onChange }: { value: Resource; onChange: (r: Resource) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Resource)}>
      {RESOURCES.map((r) => (
        <option key={r} value={r}>
          {NAMES.resource[r]}
        </option>
      ))}
    </select>
  );
}

/** Coste o cantidad de recursos con sus iconos (p. ej. 3 [madera] 2 [piedra]). */
function Cost({ r }: { r: Resources }) {
  return (
    <span className="cost">
      {RESOURCES.filter((k) => r[k] > 0).map((k) => (
        <span key={k} title={NAMES.resource[k]}>
          {r[k]}
          <img src={resourceIcon(k)} alt={NAMES.resource[k]} />
        </span>
      ))}
    </span>
  );
}

function Dice({ values }: { values: number[] }) {
  const max = Math.max(...values);
  let marked = false;
  return (
    <span className="dice">
      {values.map((v, i) => {
        const best = v === max && !marked;
        if (best) marked = true;
        return (
          <span key={i} className={`die ${best ? 'best' : ''}`}>
            {v}
          </span>
        );
      })}
    </span>
  );
}

function CombatView({ state: s }: { state: GameState }) {
  const c = s.combat ?? s.lastCombat;
  if (!c) return null;
  const live = !!s.combat && !s.combat.result;
  const A = s.players[c.attacker];
  const D = s.players[c.defender];
  return (
    <div className={`card combat ${live ? 'live' : ''}`}>
      <h3>{live ? 'Combate en curso' : 'Último combate'}</h3>
      <div className="combat-sides">
        <div>
          <span className="dot" style={{ background: PLAYER_COLORS[A.color] }} /> {A.name} ·{' '}
          {c.attackerUnits.length} {NAMES.unit[c.attackerType]}
          <br />
          {c.attackerDice.length > 0 && <Dice values={c.attackerDice} />}
          {c.attackerFaith && <small> (Fe)</small>}
        </div>
        <div className="vs">contra</div>
        <div>
          <span className="dot" style={{ background: PLAYER_COLORS[D.color] }} /> {D.name} ·{' '}
          {c.target.kind === 'wall' ? `Muralla ${NAMES.side[c.target.side]}` : c.defenderType ? NAMES.unit[c.defenderType] : '¿?'}
          <br />
          {c.defenderDice.length > 0 && <Dice values={c.defenderDice} />}
          {c.defenderFaith && <small> (Fe)</small>}
        </div>
      </div>
      {c.summary && <p className="combat-summary">{c.summary}</p>}
    </div>
  );
}

/** Edificios construidos primero (a la izquierda), después los pendientes; ambos en el orden del reglamento. */
const builtFirst = (built: string[]) => [
  ...BUILDINGS.filter((b) => built.includes(b)),
  ...BUILDINGS.filter((b) => !built.includes(b)),
];

function PlayersPanel({
  state: s,
  room,
  mySeat,
  onBuild,
  onRecruit,
  recruiting,
}: {
  state: GameState;
  room: PublicRoom;
  mySeat: Seat;
  onBuild: (b: Building) => void;
  onRecruit: (u: UnitType) => void;
  recruiting: UnitType | null;
}) {
  return (
    <div className="card players">
      {/* Tu panel primero y con ilustraciones; los rivales, en resumen. */}
      {[mySeat, ...s.order.filter((x) => x !== mySeat)].map((seat) => {
        const p = s.players[seat];
        const lobby = room.players.find((x) => x.seat === seat);
        const units = s.units.filter((u) => u.owner === seat);
        const active = s.order[s.current] === seat && s.phase !== 'GAME_OVER';
        const mine = seat === mySeat;
        if (!mine)
          return (
            <div key={seat} className={`player summary ${active ? 'active' : ''}`} style={{ borderColor: PLAYER_COLORS[p.color], ['--owner' as string]: PLAYER_COLORS[p.color] }}>
              <div className="player-head">
                <span className="dot" style={{ background: PLAYER_COLORS[p.color] }} />
                <b>{p.name}</b>
                {lobby && !lobby.online && <span className="offline">desconectado</span>}
                <span className="conquests" title="Conquistas">
                  ⚑ {p.conquests.length}
                </span>
              </div>
              <div className="sum-row bld-chips">
                {builtFirst(p.buildings).map((b) => (
                  <span key={b} className={`bld-chip ${p.buildings.includes(b) ? 'on' : ''}`} title={NAMES.building[b]}>
                    {NAMES.building[b]}
                  </span>
                ))}
              </div>
              <div className="sum-row">
                {UNIT_TYPES.map((u) => {
                  const n = units.filter((x) => x.type === u).length;
                  return (
                    <span key={u} title={NAMES.unit[u]} className={`res unit-pill ${n ? '' : 'zero'}`}>
                      <img src={UNIT_IMAGES[u]} alt={NAMES.unit[u]} /> <b>{n}</b>
                    </span>
                  );
                })}
                <span title="Murallas" className={`res unit-pill ${p.walls.length ? '' : 'zero'}`}>
                  <img src={WALL_SILHOUETTE} alt="Murallas" /> <b>{p.walls.length}</b>
                </span>
              </div>
              <div className="sum-row">
                {RESOURCES.map((r) => (
                  <span key={r} className={`res res-${r}`} title={NAMES.resource[r]}>
                    <img src={resourceIcon(r)} alt={NAMES.resource[r]} /> <b>{p.resources[r]}</b>
                  </span>
                ))}
              </div>
            </div>
          );
        return (
          <div key={seat} className={`player mine ${active ? 'active' : ''}`} style={{ borderColor: PLAYER_COLORS[p.color], ['--owner' as string]: PLAYER_COLORS[p.color] }}>
            <div className="player-head">
              <span className="dot" style={{ background: PLAYER_COLORS[p.color] }} />
              <b>{p.name}</b>
              {seat === mySeat && <em> (tú)</em>}
              {lobby && !lobby.online && <span className="offline">desconectado</span>}
              <span className="conquests" title="Conquistas">
                ⚑ {p.conquests.length}
              </span>
            </div>
            <div className="buildings-head muted">Edificios {p.buildings.length}/8</div>
            <div className="buildings">
              {builtFirst(p.buildings).map((b) => {
                const built = p.buildings.includes(b);
                const can = buildable(s, mySeat, b);
                return (
                  <figure
                    key={b}
                    className={`bld ${built ? 'on' : ''} ${can ? 'can' : ''}`}
                    title={
                      built
                        ? NAMES.building[b]
                        : `${NAMES.building[b]} · ${costLabel(BUILDING_COST[b])}${can ? ' · pulsa para construir' : ''}`
                    }
                    onClick={() => can && onBuild(b)}
                  >
                    <img src={buildingImage(b)} alt={NAMES.building[b]} draggable={false} />
                    <figcaption>{NAMES.building[b]}</figcaption>
                  </figure>
                );
              })}
            </div>
            <div className="buildings-head muted">Ejército</div>
            <div className="army-figures">
              {UNIT_TYPES.map((u) => {
                const n = units.filter((x) => x.type === u).length;
                return (
                  <figure
                    key={u}
                    className={`${n ? 'on' : ''} ${recruitable(s, mySeat, u) ? 'can' : ''} ${recruiting === u ? 'sel' : ''}`}
                    title={`${NAMES.unit[u]}: ${n}/5 · ${costLabel(UNIT_COST[u])}${recruitable(s, mySeat, u) ? ' · pulsa para reclutar' : ''}`}
                    onClick={() => recruitable(s, mySeat, u) && onRecruit(u)}
                  >
                    <span className="mini-token" style={{ borderColor: PLAYER_COLORS[p.color], ['--owner' as string]: PLAYER_COLORS[p.color] }}>
                      <img src={unitFigure(p.color, u)} alt={NAMES.unit[u]} draggable={false} />
                    </span>
                    <figcaption>
                      {NAMES.unit[u]} <b>{n}</b>/5
                    </figcaption>
                  </figure>
                );
              })}
              <figure className={p.walls.length ? 'on' : ''} title="Murallas intactas / originales">
                <span className="mini-token" style={{ borderColor: PLAYER_COLORS[p.color] }}>
                  <img src={WALL_TOKEN} alt="Murallas" draggable={false} />
                </span>
                <figcaption>
                  Murallas <b>{p.walls.length}</b>
                </figcaption>
              </figure>
            </div>
            <div className="buildings-head muted">Recursos</div>
            <div className="army-figures resource-figures">
              {RESOURCES.map((r) => (
                <figure key={r} className="on" title={NAMES.resource[r]}>
                  <img className="res-big" src={resourceIcon(r)} alt={NAMES.resource[r]} draggable={false} />
                  <figcaption>
                    {NAMES.resource[r]} <b>{p.resources[r]}</b>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ---------------------------------------------------------------------------------------------
// Chat, comercio y oferta recibida
// ---------------------------------------------------------------------------------------------

/** El jugador activo con Mercado puede comerciar una vez por turno (§46, A17). */
const canTrade = (s: GameState, seat: Seat) =>
  s.phase === 'PHASE_2' &&
  s.turn?.seat === seat &&
  s.players[seat].buildings.includes('mercado') &&
  !s.turn.tradeDone &&
  !s.prompt &&
  !s.combat;
/** El panel de Comerciar (conversión 2→1 e intercambio) se abre con Mercado durante tu turno. */
const canOpenMarket = (s: GameState, seat: Seat) =>
  s.phase === 'PHASE_2' && s.turn?.seat === seat && s.players[seat].buildings.includes('mercado') && !s.prompt && !s.combat;

type FeedItem = { key: string; ts: number; kind: 'msg' | 'ev'; color: string; who?: string; text: string };

/** Chat y registro de acciones en un único hilo, ordenado en el tiempo. */
function useFeed(room: PublicRoom, s: GameState): FeedItem[] {
  return useMemo(() => {
    const colorOfPlayer = (id: number) => {
      const lp = room.players.find((x) => x.id === id);
      return lp?.color ? PLAYER_COLORS[lp.color] : '#6b5a45';
    };
    const items: FeedItem[] = [];
    let last = 0;
    for (const e of s.log) {
      last = e.ts ?? last; // entradas antiguas sin hora: se colocan tras la anterior
      items.push({
        key: 'e' + e.n,
        ts: last + e.n / 1e6,
        kind: 'ev',
        color: e.seat !== undefined ? PLAYER_COLORS[s.players[e.seat].color] : '#cbb994',
        text: e.text,
      });
    }
    for (const m of room.chat ?? []) {
      const lp = room.players.find((x) => x.id === m.playerId);
      items.push({ key: 'm' + m.n, ts: m.ts, kind: 'msg', color: colorOfPlayer(m.playerId), who: lp?.name ?? '¿?', text: m.text });
    }
    return items.sort((x, y) => x.ts - y.ts);
  }, [room.version, room.chat?.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

function FeedLine({ item }: { item: FeedItem }) {
  return item.kind === 'msg' ? (
    <p>
      <b style={{ color: item.color }}>{item.who}:</b> {item.text}
    </p>
  ) : (
    <p className="ev" style={{ borderLeftColor: item.color }}>
      {item.text}
    </p>
  );
}

function ChatInput({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (t && (await call('chat', { text: t })).ok) setText('');
      }}
    >
      <input value={text} maxLength={300} autoFocus={autoFocus} placeholder="Escribe un mensaje…" onChange={(e) => setText(e.target.value)} />
    </form>
  );
}

function ChatBar({
  room,
  state: s,
  mySeat,
  onTrade,
}: {
  room: PublicRoom;
  state: GameState;
  mySeat: Seat;
  onTrade: () => void;
}) {
  const [open, setOpen] = useState(false);
  const feed = useFeed(room, s);
  const lastItem = feed.at(-1);
  const hasMarket = s.players[mySeat].buildings.includes('mercado');
  const tradeOk = canOpenMarket(s, mySeat);
  const tradeTitle = !hasMarket
    ? 'Necesitas construir el Mercado'
    : tradeOk
      ? 'Convertir recursos o proponer un intercambio'
      : s.turn?.seat !== mySeat
        ? 'Solo puedes comerciar durante tu turno'
        : 'Hay una decisión pendiente';
  return (
    <>
      <div className="card chat-bar">
        <button disabled={!tradeOk} title={tradeTitle} onClick={onTrade}>
          Comerciar
        </button>
        <div className="chat-line">
          {lastItem && (
            <span className="chat-last" title={lastItem.text}>
              {lastItem.kind === 'msg' && <b style={{ color: lastItem.color }}>{lastItem.who}: </b>}
              {lastItem.text}
            </span>
          )}
          <ChatInput />
        </div>
        <button className="chat-expand" title="Ver el historial del chat" onClick={() => setOpen(true)}>
          ▴
        </button>
      </div>
      {open && <ChatHistory feed={feed} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatHistory({ feed, onClose }: { feed: FeedItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [feed.length]);
  return (
    <Modal title="Chat y registro de la partida" onClose={onClose} wide>
      <div className="chat-history" ref={ref}>
        {feed.map((it) => (
          <FeedLine key={it.key} item={it} />
        ))}
      </div>
      <ChatInput className="chat-modal-input" autoFocus />
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal card ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar" title="Cerrar">
          ×
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ResourcePicker({
  value,
  onChange,
  available,
}: {
  value: Resource | null;
  onChange: (r: Resource) => void;
  available: Resources;
}) {
  return (
    <div className="res-picker">
      {RESOURCES.map((r) => (
        <button
          key={r}
          className={value === r ? 'selected' : ''}
          disabled={available[r] < 1}
          title={`${NAMES.resource[r]} (tiene ${available[r]})`}
          onClick={() => onChange(r)}
        >
          <img src={resourceIcon(r)} alt="" />
          <span>{NAMES.resource[r]}</span>
          <small>{available[r]}</small>
        </button>
      ))}
    </div>
  );
}

/** Conversión del Mercado: 2 recursos iguales → 1 cualquiera (§45). */
function ConvertRow({ state: s, mySeat, send }: { state: GameState; mySeat: Seat; send: Send }) {
  const my = s.players[mySeat];
  const [give, setGive] = useState<Resource>('comida');
  const [get, setGet] = useState<Resource>('madera');
  return (
    <>
      <h4>Convertir (2 iguales → 1 cualquiera)</h4>
      <div className="row">
        2 <Sel value={give} onChange={setGive} /> → 1 <Sel value={get} onChange={setGet} />
        <button disabled={my.resources[give] < 2} onClick={() => send({ type: 'convert', give, get }, true)}>
          Convertir
        </button>
      </div>
    </>
  );
}

/** Panel flotante para proponer un intercambio de 1 recurso por 1 recurso. */
function TradeDialog({
  state: s,
  mySeat,
  send,
  onClose,
}: {
  state: GameState;
  mySeat: Seat;
  send: Send;
  onClose: () => void;
}) {
  const [to, setTo] = useState<Seat | null>(null);
  const [give, setGive] = useState<Resource | null>(null);
  const [want, setWant] = useState<Resource | null>(null);
  const one = (r: Resource): Resources => ({ ...emptyResources(), [r]: 1 });
  const target = to !== null ? s.players[to] : null;
  const ready = to !== null && give && want && canTrade(s, mySeat);
  return (
    <Modal title="Comerciar" onClose={onClose}>
      <ConvertRow state={s} mySeat={mySeat} send={send} />
      <h4>Intercambio con un jugador (1 recurso por 1)</h4>
      {s.turn?.tradeDone && <p className="muted">Ya has hecho tu intercambio de este turno.</p>}
      {!s.turn?.tradeDone && (
        <>
      <div className="trade-players">
        {s.players
          .filter((p) => p.seat !== mySeat)
          .map((p) => (
            <button
              key={p.seat}
              className={to === p.seat ? 'selected' : ''}
              style={{ borderColor: PLAYER_COLORS[p.color] }}
              onClick={() => {
                setTo(p.seat);
                setWant(null);
              }}
            >
              <span className="dot" style={{ background: PLAYER_COLORS[p.color] }} /> {p.name}
            </button>
          ))}
      </div>
      <h4>Ofreces</h4>
      <ResourcePicker value={give} onChange={setGive} available={s.players[mySeat].resources} />
      <h4>Quieres a cambio{target ? ` (de ${target.name})` : ''}</h4>
      <ResourcePicker value={want} onChange={setWant} available={target ? target.resources : emptyResources()} />
      <div className="row modal-actions">
        <button
          className="primary"
          disabled={!ready}
          onClick={async () => {
            if (await send({ type: 'proposeTrade', to: to!, give: one(give!), receive: one(want!) }, true)) onClose();
          }}
        >
          Proponer intercambio
        </button>
        <button onClick={onClose}>Cancelar</button>
      </div>
        </>
      )}
      {s.turn?.tradeDone && (
        <div className="row modal-actions">
          <button onClick={onClose}>Cerrar</button>
        </div>
      )}
    </Modal>
  );
}

/** Panel flotante con la oferta recibida. Cerrarlo equivale a rechazarla. */
function OfferDialog({ state: s, send }: { state: GameState; send: Send }) {
  const pr = s.prompt as Extract<NonNullable<GameState['prompt']>, { kind: 'trade' }>;
  const from = s.players[pr.from];
  const reject = () => send({ type: 'respondTrade', accept: false });
  return (
    <Modal title={`Oferta de ${from.name}`} onClose={reject}>
      <div className="offer">
        <div>
          <small>Te da</small>
          <Cost r={pr.give} />
        </div>
        <div className="offer-arrow">⇄</div>
        <div>
          <small>A cambio de</small>
          <Cost r={pr.receive} />
        </div>
      </div>
      <div className="row modal-actions">
        <button className="primary" onClick={() => send({ type: 'respondTrade', accept: true })}>
          Aceptar
        </button>
        <button onClick={reject}>Rechazar</button>
      </div>
    </Modal>
  );
}
