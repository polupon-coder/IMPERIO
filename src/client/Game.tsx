import { useEffect, useMemo, useState } from 'react';
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
  type GameState,
  type Resource,
  type Resources,
  type Seat,
  type Side,
  type Terrain,
  type Unit,
  type UnitType,
} from '../engine';
import { PLAYER_COLORS, TILE_IMAGES, UNIT_IMAGES, buildingImage } from './assets';
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
  PHASE_1: 'Fase I · Creación del Mundo',
  PHASE_2: 'Fase II · El Imperio',
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
          <span className="active-player" style={{ background: PLAYER_COLORS[s.players[active].color] }}>
            {myTurn ? 'Tu turno' : `Turno de ${s.players[active].name}`}
          </span>
        )}
        <span className="room-code">
          Sala {room.code}
          <button className="link" onClick={onExit}>
            salir
          </button>
        </span>
      </header>

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
          {s.phase === 'PHASE_1' && (
            <Phase1Panel state={s} mySeat={mySeat} mode={mode} setMode={setMode} send={send} />
          )}
          {s.phase === 'PHASE_2' && myTurn && (
            <TurnPanel state={s} mySeat={mySeat} mode={mode} setMode={setMode} send={send} />
          )}
          <PlayersPanel state={s} room={room} mySeat={mySeat} />
          <LogPanel state={s} />
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
      {pr.kind === 'trade' && (
        <>
          <h3>Oferta de {s.players[pr.from].name}</h3>
          <p>
            Te da: <b>{costLabel(pr.give) || 'nada'}</b>
            <br />A cambio de: <b>{costLabel(pr.receive) || 'nada'}</b>
          </p>
          <div className="row">
            <button className="primary" onClick={() => send({ type: 'respondTrade', accept: true })}>
              Aceptar
            </button>
            <button onClick={() => send({ type: 'respondTrade', accept: false })}>Rechazar</button>
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
                {o === 'muralla' ? 'Muralla' : NAMES.unit[o]}
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

function TurnPanel({
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
  const t = s.turn!;
  const blocked = !!s.prompt || !!s.combat;
  const hasTH = my.buildings.includes('ayuntamiento');
  const civilOk = canUseCivil(s);
  const milOk = canUseMilitary(s);
  const mil = t.military;
  const nAct = mil ? Object.keys(mil.activations).length : 0;

  const civilStatus = t.civilUsed ? 'usada' : civilOk ? 'disponible' : mil?.open ? 'tras la militar' : 'no disponible';
  const milStatus = mil?.open ? `en curso (${nAct}/3 figuras)` : t.militaryUsed ? 'usada' : milOk ? 'disponible' : 'no disponible';

  return (
    <div className="card turn-panel">
      <h3>Tu turno</h3>
      <p className="actions-status">
        {hasTH ? 'Con Ayuntamiento: 1 Acción Civil + 1 Acción Militar.' : 'Sin Ayuntamiento: 1 Acción Civil o 1 Acción Militar.'}
        <br />
        Civil: <b>{civilStatus}</b> · Militar: <b>{milStatus}</b>
      </p>

      {mode.kind === 'unit' && <UnitPanel state={s} mode={mode} setMode={setMode} />}
      {mode.kind === 'recruit' && (
        <p className="hint">
          Elige una casilla resaltada de tu anillo para el {NAMES.unit[mode.unit]}.{' '}
          <button className="link" onClick={() => setMode({ kind: 'none' })}>
            cancelar
          </button>
        </p>
      )}
      {mode.kind === 'none' && milOk && (
        <p className="hint">Haz clic en una de tus tropas para moverla o atacar (Acción Militar A).</p>
      )}
      {mil?.open && (
        <button disabled={blocked} onClick={() => send({ type: 'endMilitary' })}>
          Terminar Acción Militar
        </button>
      )}

      <details open>
        <summary>Construir (Acción Civil)</summary>
        <div className="grid-buttons">
          {BUILDINGS.map((b) => {
            const built = my.buildings.includes(b);
            const cost = BUILDING_COST[b];
            const reqTH = b === 'ayuntamiento' && my.buildings.length < 2;
            const ok = civilOk && !built && !reqTH && canAfford(my.resources, cost) && !blocked;
            return (
              <button
                key={b}
                disabled={!ok}
                className={built ? 'built' : ''}
                title={reqTH ? 'Requiere 2 edificios previos' : costLabel(cost)}
                onClick={() => send({ type: 'build', building: b })}
              >
                <b>{NAMES.building[b]}</b>
                <small>{built ? 'construido' : costLabel(cost)}</small>
              </button>
            );
          })}
        </div>
      </details>

      <details open>
        <summary>Reclutar (Acción Militar B)</summary>
        <div className="grid-buttons">
          {UNIT_TYPES.map((u) => {
            const unlocked = isUnlocked(s, mySeat, u);
            const count = unitCount(s, mySeat, u);
            const spots = ringSpots(s, mySeat, u).length;
            const ok = milOk && !mil && unlocked && count < MAX_PER_TYPE && spots > 0 && canAfford(my.resources, UNIT_COST[u]) && !blocked;
            const why = !unlocked
              ? 'falta edificio'
              : count >= MAX_PER_TYPE
                ? 'máximo 5'
                : spots === 0
                  ? 'sin casilla'
                  : costLabel(UNIT_COST[u]);
            return (
              <button
                key={u}
                disabled={!ok}
                className={mode.kind === 'recruit' && mode.unit === u ? 'selected' : ''}
                onClick={() => setMode({ kind: 'recruit', unit: u })}
              >
                <b>
                  <img className="icon" src={UNIT_IMAGES[u]} alt="" /> {NAMES.unit[u]} ({count}/5)
                </b>
                <small>{why}</small>
              </button>
            );
          })}
        </div>
      </details>

      {my.buildings.includes('mercado') && <MarketPanel state={s} mySeat={mySeat} send={send} blocked={blocked} />}

      <button className="primary end-turn" disabled={blocked} onClick={() => send({ type: 'endTurn' })}>
        Terminar turno
      </button>
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

function MarketPanel({ state: s, mySeat, send, blocked }: { state: GameState; mySeat: Seat; send: Send; blocked: boolean }) {
  const my = s.players[mySeat];
  const [give, setGive] = useState<Resource>('comida');
  const [get, setGet] = useState<Resource>('madera');
  const [to, setTo] = useState<Seat>(((mySeat + 1) % 4) as Seat);
  const [offer, setOffer] = useState<Resources>(emptyResources());
  const [want, setWant] = useState<Resources>(emptyResources());
  const num = (r: Resources, set: (x: Resources) => void, k: Resource) => (
    <input
      type="number"
      min={0}
      value={r[k]}
      onChange={(e) => set({ ...r, [k]: Math.max(0, Number(e.target.value) || 0) })}
    />
  );
  return (
    <details>
      <summary>Mercado (sin gastar acción)</summary>
      <div className="row">
        2 <Sel value={give} onChange={setGive} /> → 1 <Sel value={get} onChange={setGet} />
        <button disabled={blocked || my.resources[give] < 2} onClick={() => send({ type: 'convert', give, get }, true)}>
          Convertir
        </button>
      </div>
      {s.turn!.tradeDone ? (
        <p className="muted">Ya has hecho tu intercambio de este turno.</p>
      ) : (
        <div className="trade">
          <p>
            Comerciar con{' '}
            <select value={to} onChange={(e) => setTo(Number(e.target.value) as Seat)}>
              {s.players
                .filter((p) => p.seat !== mySeat)
                .map((p) => (
                  <option key={p.seat} value={p.seat}>
                    {p.name}
                  </option>
                ))}
            </select>
          </p>
          <table>
            <thead>
              <tr>
                <th />
                {RESOURCES.map((r) => (
                  <th key={r}>{NAMES.resource[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Doy</td>
                {RESOURCES.map((r) => (
                  <td key={r}>{num(offer, setOffer, r)}</td>
                ))}
              </tr>
              <tr>
                <td>Pido</td>
                {RESOURCES.map((r) => (
                  <td key={r}>{num(want, setWant, r)}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <button
            disabled={blocked}
            onClick={async () => {
              if (await send({ type: 'proposeTrade', to, give: offer, receive: want }, true)) {
                setOffer(emptyResources());
                setWant(emptyResources());
              }
            }}
          >
            Proponer intercambio
          </button>
        </div>
      )}
    </details>
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

function PlayersPanel({ state: s, room, mySeat }: { state: GameState; room: PublicRoom; mySeat: Seat }) {
  return (
    <div className="card players">
      {s.order.map((seat) => {
        const p = s.players[seat];
        const lobby = room.players.find((x) => x.seat === seat);
        const units = s.units.filter((u) => u.owner === seat);
        const active = s.order[s.current] === seat && s.phase !== 'GAME_OVER';
        return (
          <div key={seat} className={`player ${active ? 'active' : ''}`} style={{ borderColor: PLAYER_COLORS[p.color] }}>
            <div className="player-head">
              <span className="dot" style={{ background: PLAYER_COLORS[p.color] }} />
              <b>{p.name}</b>
              {seat === mySeat && <em> (tú)</em>}
              {lobby && !lobby.online && <span className="offline">desconectado</span>}
              <span className="conquests" title="Conquistas">
                ⚑ {p.conquests.length}
              </span>
            </div>
            <div className="resources">
              {RESOURCES.map((r) => (
                <span key={r} className={`res res-${r}`} title={NAMES.resource[r]}>
                  {NAMES.resource[r]} <b>{p.resources[r]}</b>
                </span>
              ))}
            </div>
            <div className="buildings-head muted">Edificios {p.buildings.length}/8</div>
            <div className="buildings">
              {BUILDINGS.map((b) => {
                const built = p.buildings.includes(b);
                return (
                  <figure
                    key={b}
                    className={`bld ${built ? 'on' : ''}`}
                    title={`${NAMES.building[b]}${built ? '' : ' (sin construir)'}`}
                  >
                    <img src={buildingImage(b)} alt={NAMES.building[b]} draggable={false} />
                    <figcaption>{NAMES.building[b]}</figcaption>
                  </figure>
                );
              })}
            </div>
            <div className="army">
              {UNIT_TYPES.map((u) => {
                const n = units.filter((x) => x.type === u).length;
                return (
                  <span key={u} title={NAMES.unit[u]} className={n ? '' : 'zero'}>
                    <img className="icon" src={UNIT_IMAGES[u]} alt="" />
                    {n}
                  </span>
                );
              })}
              <span title="Murallas intactas / originales">
                🧱 {p.walls.length}/{p.originalWalls.length}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LogPanel({ state: s }: { state: GameState }) {
  const entries = [...s.log].reverse().slice(0, 80);
  return (
    <div className="card log">
      <h3>Registro</h3>
      <ol>
        {entries.map((e) => (
          <li key={e.n} style={e.seat !== undefined ? { borderLeftColor: PLAYER_COLORS[s.players[e.seat].color] } : {}}>
            {e.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
