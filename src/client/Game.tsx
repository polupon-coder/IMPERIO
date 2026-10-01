import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  CONVERT_RATE,
  FAITH_COST,
  wallBuildCheck,
  activationLimit,
  canRecruitNow,
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
import { PLAYER_COLORS, TILE_IMAGES, UNIT_IMAGES, WALL_ICON, WALL_SILHOUETTE, WALL_TOKEN, buildingImage, resourceIcon, unitFigure, coatOfArms } from './assets';
import { Board, type Mark } from './Board';
import { RulesSheet } from './Rules';
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
/** Número romano (rondas). */
const roman = (n: number) => {
  const map: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of map) while (n >= v) {
    out += r;
    n -= v;
  }
  return out;
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
  const [victoryOpen, setVictoryOpen] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [groupAsk, setGroupAsk] = useState<{ kind: 'move' | 'attack'; lead: string; ids: string[]; run: (ids: string[]) => void } | null>(null);
  const [wallsOpen, setWallsOpen] = useState(false);

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
      const lead = mode.unitId;
      if (m === 'move') {
        const runMove = async (ids: string[]) => {
          for (const id of ids) if (!(await send({ type: 'move', unitId: id, to: pos }, true))) break;
        };
        const others = moveCompanions(s, lead, pos);
        if (others.length) return setGroupAsk({ kind: 'move', lead, ids: others, run: runMove });
        return runMove([lead]);
      }
      if (m === 'attack') {
        const runAttack = (ids: string[]) => send({ type: 'attack', unitIds: ids, target: pos });
        const others = attackCompanions(s, lead);
        if (others.length) return setGroupAsk({ kind: 'attack', lead, ids: others, run: runAttack });
        return runAttack([lead]);
      }
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
    if (mode.kind !== 'unit') return;
    const lead = mode.unitId;
    const run = (ids: string[]) => send({ type: 'attackWall', unitIds: ids, capital, side });
    const others = attackCompanions(s, lead);
    if (others.length) return setGroupAsk({ kind: 'attack', lead, ids: others, run });
    run([lead]);
  };

  const military = s.turn?.military;
  const activated = military ? Object.keys(military.activations) : [];

  return (
    <div className="game">
      <header className="topbar">
        <span className="brand">Imperio</span>
        <span className="phase">
          {PHASE_LABEL[s.phase]} · {s.phase === 'PHASE_2' ? `Ronda ${roman(Math.ceil(s.turnNumber / 4))}` : STEP_LABEL[s.step]}
        </span>
        {s.phase !== 'GAME_OVER' && s.step !== 'INITIAL_PLACEMENT' && s.step !== 'FINAL_DEPLOY' && (
          <span
            className="active-player"
            style={{ background: myTurn ? '#3f7d3a' : PLAYER_COLORS[s.players[active].color] }}
          >
            {myTurn ? 'Tu turno' : `Turno de ${s.players[active].name}`}
          </span>
        )}
        {s.phase === 'PHASE_2' && myTurn && <ActionStatus state={s} />}
        {s.phase === 'PHASE_2' && myTurn && (
          <span className="turn-actions">
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
        <button className="rules-btn" onClick={() => setRulesOpen(true)}>
          Reglas
        </button>
        <span className="room-code">
          Mundo {room.code}
          <button className="link" onClick={onExit}>
            salir
          </button>
        </span>
      </header>

      {tradeOpen && <TradeDialog state={s} mySeat={mySeat} send={send} onClose={() => setTradeOpen(false)} />}
      {s.prompt?.kind === 'trade' && s.prompt.seat === mySeat && <OfferDialog state={s} send={send} />}
      <RewardDialog state={s} mySeat={mySeat} send={send} />
      <CombatDialog state={s} mySeat={mySeat} send={send} />
      <Announcements state={s} mySeat={mySeat} />
      {groupAsk && (
        <Modal title={groupAsk.kind === 'move' ? '¿Mover juntas?' : '¿Atacar juntas?'} onClose={() => setGroupAsk(null)}>
          <p className="center">
            {groupAsk.kind === 'move'
              ? `En esta casilla hay ${groupAsk.ids.length === 1 ? 'otra tropa que puede' : `otras ${groupAsk.ids.length} tropas que pueden`} ir al mismo destino.`
              : `En esta casilla ${groupAsk.ids.length === 1 ? 'hay otra figura' : `hay otras ${groupAsk.ids.length} figuras`} del mismo tipo que ${groupAsk.ids.length === 1 ? 'puede' : 'pueden'} atacar con ella (+1 dado por figura).`}
            <br />
            <small className="muted">Cada figura gasta una de las 3 activaciones de la Acción Militar.</small>
          </p>
          <div className="row modal-actions center-actions">
            <button
              className="primary"
              onClick={() => {
                const g = groupAsk;
                setGroupAsk(null);
                g.run([g.lead, ...g.ids]);
              }}
            >
              {groupAsk.kind === 'move' ? 'Mover' : 'Atacar con'} {groupAsk.ids.length + 1}
            </button>
            <button
              onClick={() => {
                const g = groupAsk;
                setGroupAsk(null);
                g.run([g.lead]);
              }}
            >
              Solo esta
            </button>
          </div>
        </Modal>
      )}
      {wallsOpen && <WallsDialog state={s} mySeat={mySeat} send={send} onClose={() => setWallsOpen(false)} />}
      {rulesOpen && (
        <Modal title="Reglas de Imperio" onClose={() => setRulesOpen(false)} wide>
          <RulesSheet />
        </Modal>
      )}
      {s.phase === 'GAME_OVER' && s.winner !== null && victoryOpen && (
        <VictoryDialog room={room} state={s} onClose={() => setVictoryOpen(false)} onExit={onExit} />
      )}
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
        </section>

        <aside className="side">
          {s.phase === 'GAME_OVER' && s.winner !== null && (
            <div className="card winner">
              <h2>¡{s.players[s.winner].name} gana Imperio!</h2>
              <button onClick={() => setVictoryOpen(true)}>Ver la proclama</button>
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
          {/* El panel de jugadores establecido va siempre arriba; las acciones del turno, debajo. */}
          <PlayersPanel
            state={s}
            room={room}
            mySeat={mySeat}
            onBuild={(b) => send({ type: 'build', building: b })}
            onRecruit={(u) => setMode({ kind: 'recruit', unit: u })}
            onWalls={() => setWallsOpen(true)}
            recruiting={mode.kind === 'recruit' ? mode.unit : null}
          />
          <ChatBar room={room} state={s} mySeat={mySeat} onTrade={() => setTradeOpen(true)} />
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
  if (!pr || pr.kind === 'faith' || pr.kind === 'defenderChoice' || pr.kind === 'advance') return null;
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
        {pr.kind === 'trade' && pr.from === mySeat && (
          <button className="link" onClick={() => send({ type: 'cancelTrade' })}>
            Retirar oferta
          </button>
        )}
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
    <div className="card phase1-guide">
      {front?.kind === 'deploy' && (
        <p className="hint">
          Coloca tu <b>{NAMES.unit[front.unit]}</b>: pulsa una casilla resaltada de tu anillo.
        </p>
      )}
      {s.step === 'INITIAL_PLACEMENT' && !front && (
        <>
          {my.initialTiles.length ? (
            <>
              <p>
                <b>Coloca tus 4 losetas iniciales alrededor de tu Capital.</b> Elige una y pulsa una casilla
                resaltada de tu anillo:
              </p>
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

      {(s.step === 'PILE_PLACEMENT' || s.step === 'EXCHANGE') && myTurn && !front && (
        <div className="drawn">
          <img src={TILE_IMAGES[s.step === 'EXCHANGE' ? s.exchangeTile! : s.pile[0]]} alt="" />
          <p>
            Te ha tocado: <b>{NAMES.terrain[s.step === 'EXCHANGE' ? s.exchangeTile! : s.pile[0]]}</b>.
            {s.step === 'PILE_PLACEMENT' && <> ¿Dónde la quieres poner? Pulsa una casilla resaltada.</>}
          </p>
        </div>
      )}
      {(s.step === 'PILE_PLACEMENT' || s.step === 'EXCHANGE') && !myTurn && (
        <p className="muted">
          {s.players[active].name} está colocando{' '}
          <TileChip t={s.step === 'EXCHANGE' ? s.exchangeTile! : s.pile[0]} />
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
  if (s.turn?.seat !== seat || s.prompt || s.combat || !canRecruitNow(s)) return false;
  return (
    isUnlocked(s, seat, u) &&
    unitCount(s, seat, u) < MAX_PER_TYPE &&
    ringSpots(s, seat, u).length > 0 &&
    canAfford(my.resources, UNIT_COST[u])
  );
}

/** Máquina, desconectado y, para el anfitrión, ceder a la máquina el sitio de un desconectado. */
function SeatStatus({ lobby, room, mySeat }: { lobby?: PublicRoom['players'][number]; room: PublicRoom; mySeat: Seat }) {
  if (!lobby) return null;
  if (lobby.bot) return <span className="bot-tag" title={`Juega la máquina (${lobby.bot === 'facil' ? 'fácil' : 'normal'})`}>máquina</span>;
  if (lobby.online) return null;
  const me = room.players.find((x) => x.seat === mySeat);
  const host = me && me.id === room.hostId && room.game?.phase !== 'GAME_OVER';
  return (
    <>
      <span className="offline">desconectado</span>
      {host && (
        <button className="link takeover" title="La máquina jugará por este jugador hasta que vuelva" onClick={() => call('takeover', { playerId: lobby.id, level: 'normal' })}>
          ceder a la máquina
        </button>
      )}
    </>
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

/** Tropas propias de la misma casilla que pueden ir también a `to` (respetando activaciones y pila de 3). */
function moveCompanions(s: GameState, leadId: string, to: number): string[] {
  const u = unitById(s, leadId);
  if (!u) return [];
  const acts = s.turn?.military?.activations ?? {};
  let budget = activationLimit(s) - Object.keys(acts).length - (acts[u.id] ? 0 : 1);
  let room = 3 - s.units.filter((x) => x.pos === to && x.owner === u.owner).length - 1;
  const out: string[] = [];
  for (const o of s.units) {
    if (o.id === u.id || o.owner !== u.owner || o.pos !== u.pos || room <= 0) continue;
    const fresh = !acts[o.id];
    if (fresh && budget <= 0) continue;
    if (!moveTargets(s, o.id).has(to)) continue;
    out.push(o.id);
    room--;
    if (fresh) budget--;
  }
  return out;
}

/** Figuras del mismo tipo y casilla que pueden unirse al ataque (respetando las 3 activaciones). */
function attackCompanions(s: GameState, leadId: string): string[] {
  const u = unitById(s, leadId);
  if (!u) return [];
  const acts = s.turn?.military?.activations ?? {};
  let budget = activationLimit(s) - Object.keys(acts).length - (acts[u.id] ? 0 : 1);
  const out: string[] = [];
  for (const id of groupCandidates(s, leadId)) {
    const fresh = !acts[id];
    if (fresh && budget <= 0) continue;
    out.push(id);
    if (fresh) budget--;
  }
  return out;
}

/** Barra superior: si quedan la Acción Civil y la Acción Militar del turno. */
function ActionStatus({ state: s }: { state: GameState }) {
  const t = s.turn;
  if (!t) return null;
  const town = s.players[t.seat].buildings.includes('ayuntamiento');
  const civil = t.civilUsed ? 'gastada' : !town && t.militaryUsed ? 'no disponible' : t.military?.open ? 'tras la militar' : 'disponible';
  const military = t.military?.open ? 'en curso' : t.militaryUsed ? 'gastada' : !town && t.civilUsed ? 'no disponible' : 'disponible';
  const cls = (v: string) => (v === 'disponible' ? 'on' : v === 'en curso' || v === 'tras la militar' ? 'busy' : 'off');
  const tip = town ? 'Con Ayuntamiento: 1 Acción Civil + 1 Acción Militar' : 'Sin Ayuntamiento: 1 Acción Civil o 1 Acción Militar';
  return (
    <span className="action-status" title={tip}>
      <span className={`act ${cls(civil)}`}>Civil: {civil}</span>
      <span className={`act ${cls(military)}`}>Militar: {military}</span>
    </span>
  );
}

/** Levantar o reparar Murallas de la propia Capital (A20). */
function WallsDialog({ state: s, mySeat, send, onClose }: { state: GameState; mySeat: Seat; send: Send; onClose: () => void }) {
  const p = s.players[mySeat];
  const civil = s.turn?.seat === mySeat && canUseCivil(s);
  return (
    <Modal title="Murallas de tu Capital" onClose={onClose}>
      <p className="muted center">
        Con la Acción Civil: levantar una nueva (<Cost r={{ comida: 0, madera: 1, piedra: 4, agua: 0 }} />) o reparar una destruida (
        <Cost r={{ comida: 0, madera: 0, piedra: 3, agua: 0 }} />). Máximo 4.
      </p>
      {!civil && <p className="error center">No te queda Acción Civil en este turno.</p>}
      <div className="walls-list">
        {SIDES.map((side) => {
          const intact = p.walls.includes(side);
          const check = wallBuildCheck(s, mySeat, side);
          const label = { N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste' }[side];
          const state = intact ? 'en pie' : p.originalWalls.includes(side) ? 'destruida' : 'sin Muralla';
          return (
            <div key={side} className="wall-row">
              <b>{label}</b> <span className="muted">· {state}</span>
              {!intact && (
                <button
                  disabled={!civil || !check.ok}
                  title={!civil ? 'No te queda Acción Civil este turno' : check.ok ? '' : check.reason}
                  onClick={async () => {
                    if (await send({ type: 'buildWall', side })) onClose();
                  }}
                >
                  {check.repair ? 'Reparar' : 'Levantar'} <Cost r={check.cost} />
                </button>
              )}
              {!intact && !check.ok && civil && <small className="error">{check.reason}</small>}
            </div>
          );
        })}
      </div>
    </Modal>
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
  return (
    <div className="unit-panel">
      <p>
        <img className="icon" src={UNIT_IMAGES[u.type]} alt="" /> <b>{NAMES.unit[u.type]}</b> seleccionada ·{' '}
        {!unlocked
          ? 'inactiva: falta su edificio, solo defiende'
          : s.turn?.military?.recruited === u.id
            ? 'recién reclutada: actuará el próximo turno'
            : `${steps ? `puede mover ${steps}` : 'sin movimiento'} · ${canAtt ? 'puede atacar' : 'sin ataque'}`}
      </p>
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

function Dice({ values, big }: { values: number[]; big?: boolean }) {
  const max = Math.max(...values);
  let marked = false;
  return (
    <span className={`dice ${big ? 'big' : ''}`}>
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
  onWalls,
  recruiting,
}: {
  state: GameState;
  room: PublicRoom;
  mySeat: Seat;
  onBuild: (b: Building) => void;
  onRecruit: (u: UnitType) => void;
  onWalls: () => void;
  recruiting: UnitType | null;
}) {
  const [confirm, setConfirm] = useState<{ kind: 'build'; b: Building } | { kind: 'recruit'; u: UnitType } | null>(null);
  const myTurnNow = s.phase === 'PHASE_2' && s.turn?.seat === mySeat;
  // Escala el contenido para que el panel quepa siempre entero en el alto disponible.
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      inner.style.zoom = '1';
      if (window.innerWidth <= 900) return;
      const cs = getComputedStyle(outer);
      const avail = outer.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      let z = 1;
      for (let i = 0; i < 3; i++) {
        const h = inner.getBoundingClientRect().height;
        if (h <= avail) break;
        z = z * (avail / h) * 0.995;
        inner.style.zoom = String(z);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (outerRef.current) ro.observe(outerRef.current);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  });
  return (
    <div className="card players" ref={outerRef}>
      {confirm && (
        <ConfirmDialog
          state={s}
          mySeat={mySeat}
          item={confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === 'build') onBuild(confirm.b);
            else onRecruit(confirm.u);
            setConfirm(null);
          }}
        />
      )}
      {/* Tu panel primero y con ilustraciones; los rivales, en resumen. */}
      <div className="players-fit" ref={innerRef}>
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
                <img className="coat" src={coatOfArms(p.color)} alt="" />
                <b>{p.name}</b>
                <SeatStatus lobby={lobby} room={room} mySeat={mySeat} />
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
                    <span
                      key={u}
                      title={`${NAMES.unit[u]}${isUnlocked(s, seat, u) ? '' : ' · sin activar'}`}
                      className={`res unit-pill ${n ? '' : 'zero'} ${isUnlocked(s, seat, u) ? '' : 'locked'}`}
                    >
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
              <img className="coat coat-big" src={coatOfArms(p.color)} alt="" />
              <b>{p.name}</b>
              {seat === mySeat && <em> (tú)</em>}
              <SeatStatus lobby={lobby} room={room} mySeat={mySeat} />
              <span className="conquests" title="Conquistas">
                ⚑ {p.conquests.length}
              </span>
            </div>
            <div className="buildings">
              {builtFirst(p.buildings).map((b) => {
                const built = p.buildings.includes(b);
                const can = buildable(s, mySeat, b);
                return (
                  <figure
                    key={b}
                    className={`bld ${built ? 'on' : ''} ${can ? 'can' : ''}`}
                    onClick={() => !built && myTurnNow && setConfirm({ kind: 'build', b })}
                  >
                    <CostTip title={NAMES.building[b]} cost={BUILDING_COST[b]} note={built ? 'Construido' : undefined} />
                    <img src={buildingImage(b)} alt={NAMES.building[b]} draggable={false} />
                    <figcaption>{NAMES.building[b]}</figcaption>
                  </figure>
                );
              })}
            </div>
            <div className="army-figures">
              {UNIT_TYPES.map((u) => {
                const n = units.filter((x) => x.type === u).length;
                return (
                  <figure
                    key={u}
                    className={`${n ? 'on' : ''} ${recruitable(s, mySeat, u) ? 'can' : ''} ${recruiting === u ? 'sel' : ''} ${isUnlocked(s, mySeat, u) ? '' : 'locked'}`}
                    onClick={() => myTurnNow && setConfirm({ kind: 'recruit', u })}
                  >
                    <CostTip title={NAMES.unit[u]} cost={UNIT_COST[u]} />
                    <span className="mini-token" style={{ borderColor: PLAYER_COLORS[p.color], ['--owner' as string]: PLAYER_COLORS[p.color] }}>
                      <img src={unitFigure(p.color, u)} alt={NAMES.unit[u]} draggable={false} />
                    </span>
                    <figcaption>
                      {NAMES.unit[u]} <b>{n}</b>/5
                    </figcaption>
                  </figure>
                );
              })}
              <figure
                className={`${p.walls.length ? 'on' : ''} ${mine && myTurnNow ? 'clickable' : ''}`}
                title={mine && myTurnNow ? 'Levantar o reparar Murallas' : 'Murallas intactas / originales'}
                onClick={() => mine && myTurnNow && onWalls()}
              >
                <span className="mini-token" style={{ borderColor: PLAYER_COLORS[p.color] }}>
                  <img src={WALL_TOKEN} alt="Murallas" draggable={false} />
                </span>
                <figcaption>
                  Murallas <b>{p.walls.length}</b>/4
                </figcaption>
              </figure>
            </div>
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
/** El panel de Comerciar (conversión 3→1 e intercambio) se abre con Mercado durante tu turno. */
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
  noClose,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  noClose?: boolean;
}) {
  // Portal al <body>: la ventana flota sobre toda la página aunque se abra desde un panel.
  return createPortal(
    <div className="modal-backdrop" onClick={noClose ? undefined : onClose}>
      <div className={`modal card ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {!noClose && (
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            ×
          </button>
        )}
        <h3>{title}</h3>
        <div className="ornament" />
        {children}
      </div>
    </div>,
    document.body,
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

/** Coste en recursos que aparece al pasar el cursor por un edificio o una tropa. */
function CostTip({ title, cost, note }: { title: string; cost: Resources; note?: string }) {
  return (
    <span className="cost-tip" role="tooltip">
      <b>{title}</b>
      {note ? <small>{note}</small> : <Cost r={cost} />}
    </span>
  );
}

/** Ventana flotante para confirmar la construcción de un edificio o el reclutamiento de una tropa. */
function ConfirmDialog({
  state: s,
  mySeat,
  item,
  onClose,
  onConfirm,
}: {
  state: GameState;
  mySeat: Seat;
  item: { kind: 'build'; b: Building } | { kind: 'recruit'; u: UnitType };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const my = s.players[mySeat];
  const build = item.kind === 'build';
  const name = build ? NAMES.building[item.b] : NAMES.unit[item.u];
  const cost = build ? BUILDING_COST[item.b] : UNIT_COST[item.u];
  const ok = build ? buildable(s, mySeat, item.b) : recruitable(s, mySeat, item.u);
  let why = '';
  if (!ok) {
    if (!canAfford(my.resources, cost)) why = 'No tienes recursos suficientes.';
    else if (build && item.b === 'ayuntamiento' && my.buildings.length < 2) why = 'El Ayuntamiento requiere 2 edificios previos.';
    else if (build) why = 'No te queda Acción Civil en este turno.';
    else if (!isUnlocked(s, mySeat, item.u)) why = 'Falta el edificio necesario para reclutar esta tropa.';
    else if (unitCount(s, mySeat, item.u) >= MAX_PER_TYPE) why = 'Ya tienes 5 unidades de este tipo.';
    else if (!ringSpots(s, mySeat, item.u).length) why = 'No hay ninguna casilla libre válida en tu anillo.';
    else why = 'No te queda Acción Militar en este turno.';
  }
  return (
    <Modal title={build ? `¿Construir ${name}?` : `¿Reclutar ${name}?`} onClose={onClose}>
      <div className="confirm-body">
        <img
          className={build ? 'confirm-bld' : 'confirm-unit'}
          src={build ? buildingImage(item.b) : unitFigure(my.color, item.u)}
          alt=""
          style={build ? undefined : { borderColor: PLAYER_COLORS[my.color] }}
        />
        <div>
          <p>Coste:</p>
          <Cost r={cost} />
          {!build && ok && <p className="muted">Después elige una casilla de tu anillo en el tablero.</p>}
          {why && <p className="error">{why}</p>}
        </div>
      </div>
      <div className="row modal-actions">
        <button className="primary" disabled={!ok} onClick={onConfirm}>
          {build ? 'Construir' : 'Reclutar'}
        </button>
        <button onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

/** Conversión del Mercado: 3 recursos iguales → 1 cualquiera (§45, A18). */
function ConvertRow({ state: s, mySeat, send }: { state: GameState; mySeat: Seat; send: Send }) {
  const my = s.players[mySeat];
  const [give, setGive] = useState<Resource>('comida');
  const [get, setGet] = useState<Resource>('madera');
  return (
    <>
      <h4>Convertir ({CONVERT_RATE} iguales → 1 cualquiera)</h4>
      <div className="row">
        {CONVERT_RATE} <Sel value={give} onChange={setGive} /> → 1 <Sel value={get} onChange={setGet} />
        <button disabled={my.resources[give] < CONVERT_RATE || give === get} onClick={() => send({ type: 'convert', give, get }, true)}>
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

// ---------------------------------------------------------------------------------------------
// Ventanas flotantes: recompensas de la Fase I, dados y anuncios
// ---------------------------------------------------------------------------------------------

/** Recompensa militar de la Fase I: elegir tropa/Muralla, colocar Muralla o avisar del despliegue. */
function RewardDialog({ state: s, mySeat, send }: { state: GameState; mySeat: Seat; send: Send }) {
  const my = s.players[mySeat];
  const front = my.rewardQueue[0];
  const key = front ? `${front.kind}:${my.placementsLeft}:${my.initialTiles.length}:${s.units.length}` : '';
  const [seen, setSeen] = useState('');
  if (s.phase !== 'PHASE_1' || !front) return null;
  if (front.kind === 'deploy') {
    if (seen === key) return null;
    return (
      <Modal title="Recompensa del anillo" onClose={() => setSeen(key)}>
        <div className="confirm-body">
          <img className="confirm-unit" src={unitFigure(my.color, front.unit)} alt="" style={{ borderColor: PLAYER_COLORS[my.color] }} />
          <p>
            Recibes <b>1 {NAMES.unit[front.unit]}</b>. Colócala en una casilla resaltada de tu anillo.
          </p>
        </div>
        <div className="row modal-actions">
          <button className="primary" onClick={() => setSeen(key)}>
            Elegir casilla
          </button>
        </div>
      </Modal>
    );
  }
  if (front.kind === 'choose')
    return (
      <Modal title={`Recompensa de ${NAMES.terrain[front.from]}`} onClose={() => {}} noClose>
        <p>¿Qué quieres recibir?</p>
        <div className="reward-options">
          {front.options.map((o) => (
            <button key={o} onClick={() => send({ type: 'chooseReward', option: o })}>
              <img
                className="confirm-unit"
                src={o === 'muralla' ? WALL_TOKEN : unitFigure(my.color, o)}
                alt=""
                style={{ borderColor: PLAYER_COLORS[my.color] }}
              />
              <span>{o === 'muralla' ? 'Muralla' : NAMES.unit[o]}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  return (
    <Modal title="Coloca tu Muralla" onClose={() => {}} noClose>
      <p>¿En qué lado de tu Capital la levantas?</p>
      <div className="row">
        {SIDES.filter((x) => !my.originalWalls.includes(x)).map((x) => (
          <button key={x} onClick={() => send({ type: 'placeWall', side: x })}>
            {NAMES.side[x][0].toUpperCase() + NAMES.side[x].slice(1)}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Tiradas de dados en ventana flotante para todos; Fe, defensa y avance para quien le toque. */
function CombatDialog({ state: s, mySeat, send }: { state: GameState; mySeat: Seat; send: Send }) {
  const c = s.combat ?? s.lastCombat;
  const key = c ? `${s.turnNumber}:${c.from}:${c.summary}:${c.attackerDice.join()}:${c.defenderDice.join()}` : '';
  const [closed, setClosed] = useState('');
  if (!c || (!s.combat && closed === key)) return null;
  if (!s.combat && s.lastCombat && s.log.length && !s.log.slice(-6).some((e) => e.text === c.summary)) return null;
  const pr = s.prompt;
  const mine = pr && pr.seat === mySeat && (pr.kind === 'faith' || pr.kind === 'defenderChoice' || pr.kind === 'advance') ? pr : null;
  const waiting = pr && pr.seat !== mySeat && (pr.kind === 'faith' || pr.kind === 'defenderChoice' || pr.kind === 'advance') ? pr : null;
  const A = s.players[c.attacker];
  const D = s.players[c.defender];
  const onClose = () => {
    if (mine?.kind === 'faith') send({ type: 'faith', use: false });
    else if (mine?.kind === 'advance') send({ type: 'advance', accept: false });
    else if (!mine) setClosed(key);
  };
  return (
    <Modal title={s.combat && !s.combat.result ? 'Combate' : 'Resultado del combate'} onClose={onClose} noClose={mine?.kind === 'defenderChoice'}>
      <div className="dice-board">
        <div className="side-dice">
          <p>
            <span className="dot" style={{ background: PLAYER_COLORS[A.color] }} /> <b>{A.name}</b>
            <br />
            <small>
              {c.attackerUnits.length} {NAMES.unit[c.attackerType]}
            </small>
          </p>
          {c.attackerDice.length > 0 ? <Dice values={c.attackerDice} big /> : <p className="muted">…</p>}
          {c.attackerFaith && <small className="faith-used">Fe usada</small>}
        </div>
        <div className="vs">contra</div>
        <div className="side-dice">
          <p>
            <span className="dot" style={{ background: PLAYER_COLORS[D.color] }} /> <b>{D.name}</b>
            <br />
            <small>
              {c.target.kind === 'wall' ? `Muralla ${NAMES.side[c.target.side]}` : c.defenderType ? NAMES.unit[c.defenderType] : 'elige defensor…'}
            </small>
          </p>
          {c.defenderDice.length > 0 ? <Dice values={c.defenderDice} big /> : <p className="muted">…</p>}
          {c.defenderFaith && <small className="faith-used">Fe usada</small>}
        </div>
      </div>
      {c.summary && <p className="combat-summary">{c.summary.replace(/^.*?\]\. /, '')}</p>}
      {mine?.kind === 'faith' && (
        <div className="faith-ask">
          <p>
            Tienes Iglesia: ¿pagas <b>{FAITH_COST} Agua</b> para usar la Fe y repetir toda tu tirada? El nuevo resultado es
            obligatorio.
          </p>
          <div className="row modal-actions">
            <button className="primary" onClick={() => send({ type: 'faith', use: true })}>
              Usar Fe ({FAITH_COST} Agua)
            </button>
            <button onClick={() => send({ type: 'faith', use: false })}>No</button>
          </div>
        </div>
      )}
      {mine?.kind === 'defenderChoice' && (
        <>
          <p>¡Te atacan! Elige qué tipo de tropa defiende:</p>
          <div className="row">
            {mine.options.map((u) => (
              <button key={u} onClick={() => send({ type: 'defenderChoice', unit: u })}>
                {NAMES.unit[u]}
              </button>
            ))}
          </div>
        </>
      )}
      {mine?.kind === 'advance' && (
        <>
          <p>La loseta ha quedado libre. ¿Avanza toda tu formación?</p>
          <div className="row modal-actions">
            <button className="primary" onClick={() => send({ type: 'advance', accept: true })}>
              Avanzar
            </button>
            <button onClick={() => send({ type: 'advance', accept: false })}>Quedarse</button>
          </div>
        </>
      )}
      {waiting && (
        <p className="muted">
          Esperando a {s.players[waiting.seat].name}
          {waiting.kind === 'faith' ? ' (decide si usa la Fe)' : waiting.kind === 'defenderChoice' ? ' (elige defensor)' : ' (decide si avanza)'}…
        </p>
      )}
    </Modal>
  );
}

/** Avisos: recursos ganados, comienzo de la Fase II y Conquistas. */
function Announcements({ state: s, mySeat }: { state: GameState; mySeat: Seat }) {
  const prev = useRef<GameState | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; node: React.ReactNode }>>([]);
  const [banner, setBanner] = useState<{ title: string; text: string } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = s;
    if (!before) return;
    // Recursos ganados
    const got = RESOURCES.filter((r) => s.players[mySeat].resources[r] > before.players[mySeat].resources[r]);
    if (got.length) {
      const gain = emptyResources();
      for (const r of got) gain[r] = s.players[mySeat].resources[r] - before.players[mySeat].resources[r];
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, node: <>Ganas <Cost r={gain} /></> }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    }
    // Comienza la Fase II
    if (before.phase === 'PHASE_1' && s.phase === 'PHASE_2')
      setBanner({ title: 'Empieza la Fase II', text: 'El mapa está completo. Comienza la lucha por el Imperio.' });
    // Conquistas (si la conquista da la victoria, ya lo anuncia la proclama)
    if (s.phase !== 'GAME_OVER') for (const p of s.players) {
      const nb = before.players[p.seat].conquests.length;
      if (p.conquests.length > nb) {
        const victim = s.players[p.conquests[p.conquests.length - 1]];
        setBanner({
          title: '¡Conquista!',
          text:
            p.seat === mySeat
              ? `Has conquistado la Capital de ${victim.name}.`
              : victim.seat === mySeat
                ? `${p.name} ha conquistado tu Capital.`
                : `${p.name} ha conquistado la Capital de ${victim.name}.`,
        });
      }
    }
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.node}
          </div>
        ))}
      </div>
      {banner && (
        <Modal title={banner.title} onClose={() => setBanner(null)}>
          <p className="banner-text">{banner.text}</p>
          <div className="row modal-actions">
            <button className="primary" onClick={() => setBanner(null)}>
              Continuar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Proclama de victoria: escudo del león arriba y el rótulo «Imperio» abajo. */
function VictoryDialog({
  room,
  state: s,
  onClose,
  onExit,
}: {
  room: PublicRoom;
  state: GameState;
  onClose: () => void;
  onExit: () => void;
}) {
  const w = s.players[s.winner!];
  const color = PLAYER_COLORS[w.color];
  const [chatOpen, setChatOpen] = useState(false);
  const feed = useFeed(room, s);
  return (
    <Modal title="Proclama Real" onClose={onClose} wide>
      <div className="victory">
        <p className="victory-line">Sea sabido por todos los reinos que</p>
        <div className="victory-name" style={{ color }}>
          <img className="coat" src={coatOfArms(w.color)} alt="" /> {w.name}
        </div>
        <p className="victory-line">reina desde hoy sobre el</p>
        <img className="victory-title" src="/assets/ui/victoria-titulo.webp" alt="Imperio" />
        <div className="row victory-actions">
          <button className="seal small green" onClick={onClose}>
            Ver el
            <br />
            tablero
          </button>
          <button className="seal small" onClick={() => setChatOpen(true)}>
            Chat
          </button>
          <button className="seal small" onClick={onExit}>
            Volver a la
            <br />
            portada
          </button>
        </div>
        {chatOpen && <ChatHistory feed={feed} onClose={() => setChatOpen(false)} />}
      </div>
    </Modal>
  );
}
