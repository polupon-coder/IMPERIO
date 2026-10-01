import { useEffect, useState } from 'react';
import { type Color, type Seat } from '../engine';
import { PLAYER_COLORS, coatOfArms } from './assets';
import { Game } from './Game';
import { call, forgetSession, lastCode, loadSessions, saveSession, socket, tabSessions, type PublicRoom } from './socket';

/** Cada Capital tiene siempre el mismo color (igual que en el servidor). */
const SEAT_COLOR: Record<Seat, Color> = { 0: 'verde', 1: 'azul', 2: 'rojo', 3: 'amarillo' };

function codeFromUrl() {
  return new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? null;
}

export function App() {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState('');

  useEffect(() => {
    const onRoom = (r: PublicRoom) => setRoom(r);
    const tryRejoin = async () => {
      setConnected(true);
      const code = codeFromUrl() ?? lastCode();
      if (!code) return;
      // La sesión de esta pestaña manda; la guardada en el navegador solo se usa si ese
      // jugador no está ya jugando en otra pestaña (así se puede probar con varias pestañas).
      const own = tabSessions()[code];
      const token = own ?? loadSessions()[code];
      if (!token) return;
      const r = await call('rejoin', { code, token, onlyIfOffline: !own });
      if (r.ok) {
        saveSession(r.code!, r.token!);
        setMyId(r.playerId!);
        history.replaceState(null, '', `?sala=${r.code}`);
      } else if (own) forgetSession(code);
    };
    socket.on('room', onRoom);
    socket.on('connect', tryRejoin);
    socket.on('disconnect', () => setConnected(false));
    if (socket.connected) tryRejoin();
    return () => {
      socket.off('room', onRoom);
      socket.off('connect', tryRejoin);
    };
  }, []);

  const entered = (r: { ok: boolean; error?: string; code?: string; token?: string; playerId?: number }) => {
    if (!r.ok) return setError(r.error ?? 'Error');
    setError('');
    saveSession(r.code!, r.token!);
    setMyId(r.playerId!);
    history.replaceState(null, '', `?sala=${r.code}`);
  };

  const exit = () => {
    // Con la partida empezada se conserva el acceso: el enlace del Mundo devuelve a su sitio.
    if (room) forgetSession(room.code, !!room.game);
    setRoom(null);
    setMyId(null);
    history.replaceState(null, '', location.pathname);
    socket.disconnect().connect();
  };

  const me = room?.players.find((p) => p.id === myId);
  return (
    <div className="app">
      {!connected && <div className="banner">Conectando con el servidor…</div>}
      {!room || !me ? (
        <Home onEnter={entered} error={error} />
      ) : room.game ? (
        <Game room={room} me={me} onExit={exit} />
      ) : (
        <Lobby room={room} me={me} onExit={exit} />
      )}
    </div>
  );
}

function Home({ onEnter, error }: { onEnter: (r: any) => void; error: string }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('imperio:name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');
  const remember = () => {
    try {
      localStorage.setItem('imperio:name', name);
    } catch {
      /* nada */
    }
  };
  const invited = codeFromUrl();
  const [joining, setJoining] = useState(false);
  const [open, setOpen] = useState(false);
  const join = async () => {
    remember();
    onEnter(await call('joinRoom', { code: invited ?? code, name }));
  };
  return (
    <div className="home">
      <div className="home-sheet home-battle">
        <img className="home-title" src="/assets/ui/victoria-titulo.webp" alt="Imperio" />
        <p className="home-credit">Un juego de Pol Lupon</p>
        <button className="seal home-play" onClick={() => setOpen(true)}>
          Jugar
        </button>
      </div>
      {(open || !!error) && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal card home-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Jugar">
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar" title="Cerrar">
              ×
            </button>
        <div className="home-form">
          <input
            autoFocus
            className="ink-input name-input"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            aria-label="Tu nombre"
          />
          {joining && !invited ? (
            <div className="home-actions">
              <input
                autoFocus
                value={code}
                maxLength={5}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 5 && join()}
                placeholder="Código del Mundo"
                aria-label="Código del Mundo"
                className="ink-input code-input"
              />
              <button className="seal" disabled={code.length < 5} onClick={join}>
                Entrar
              </button>
              <button className="link home-back" onClick={() => setJoining(false)}>
                volver
              </button>
            </div>
          ) : invited ? (
            <div className="home-actions">
              <button className="seal" disabled={!name.trim()} onClick={join}>
                Entrar al
                <br />
                Mundo {invited}
              </button>
            </div>
          ) : (
            <div className="home-actions">
              <button
                className="seal"
                disabled={!name.trim()}
                onClick={async () => {
                  remember();
                  onEnter(await call('createRoom', { name }));
                }}
              >
                Crear
                <br />
                partida
              </button>
              <button className="seal" disabled={!name.trim()} onClick={() => setJoining(true)}>
                Unirse
              </button>
            </div>
          )}
          {error && <p className="error center">{error}</p>}
        </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Posición en pantalla de cada Capital (como en el tablero): NO, NE arriba; SO, SE abajo. */
const SEAT_ORDER: Seat[] = [0, 1, 3, 2];

function Lobby({ room, me, onExit }: { room: PublicRoom; me: PublicRoom['players'][number]; onExit: () => void }) {
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?sala=${room.code}`;
  const update = async (patch: object) => {
    const r = await call('lobby', patch);
    setError(r.ok ? '' : r.error ?? '');
  };
  const isHost = me.id === room.hostId;
  const botCall = async (event: string, data: object) => {
    const r = await call(event, data);
    setError(r.ok ? '' : r.error ?? '');
  };
  const allReady = room.players.length === 4 && room.players.every((p) => p.ready);

  return (
    <div className="lobby">
      <div className="parchment lobby-sheet">
        <h1 className="lobby-title">Mundo {room.code}</h1>
        <div className="row share">
          <input readOnly value={link} className="ink-input link-input" onFocus={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
        </div>
        <div className="seats">
          {SEAT_ORDER.map((seat) => {
            const p = room.players.find((x) => x.seat === seat);
            const color = SEAT_COLOR[seat];
            return (
              <div key={seat} className={`seat ${p ? 'taken' : 'free'}`} style={{ ['--owner' as string]: PLAYER_COLORS[color] }}>
                <img className="seat-coat" src={coatOfArms(color)} alt="" />
                <div className="seat-info">
                  {p?.bot ? (
                    <>
                      <div className="seat-name">{p.name}</div>
                      <div className="seat-meta">
                        <em>sistema · {p.bot === 'facil' ? 'fácil' : 'normal'}</em>
                      </div>
                      <div className="ok">✔ Preparado</div>
                      {isHost && (
                        <button className="link" onClick={() => botCall('removeBot', { playerId: p.id })}>
                          Quitar sistema
                        </button>
                      )}
                    </>
                  ) : p ? (
                    <>
                      <div className="seat-name">{p.name}</div>
                      <div className="seat-meta">
                        {p.id === room.hostId && <em>anfitrión</em>} {p.id === me.id && <em>(tú)</em>}
                        {!p.online && <span className="offline"> desconectado</span>}
                      </div>
                      <div className={p.ready ? 'ok' : 'muted'}>{p.ready ? '✔ Preparado' : 'Sin confirmar'}</div>
                    </>
                  ) : (
                    <>
                      <div className="seat-name muted">Trono vacante</div>
                      <div className="seat-free-actions">
                        {me.seat !== seat && <button onClick={() => update({ seat })}>Ocupar esta Capital</button>}
                        {isHost && (
                          <span className="add-bot">
                            COM:
                            <button onClick={() => botCall('addBot', { seat, level: 'facil' })}>fácil</button>
                            <button onClick={() => botCall('addBot', { seat, level: 'normal' })}>normal</button>
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="row lobby-actions">
          <button
            className={`seal ${me.ready ? 'dim' : 'green'}`}
            title={me.ready ? 'Pulsa de nuevo si aún no estás preparado' : ''}
            onClick={() => update({ ready: !me.ready })}
          >
            {me.ready ? (
              <>
                No estoy
                <br />
                preparado
              </>
            ) : (
              <>
                Estoy
                <br />
                preparado
              </>
            )}
          </button>
          {isHost && (
            <button
              className={`seal ${allReady ? 'green' : ''}`}
              disabled={!allReady}
              onClick={async () => {
                const r = await call('start');
                setError(r.ok ? '' : r.error ?? '');
              }}
            >
              Iniciar
              <br />
              partida
            </button>
          )}
        </div>
        <p className="muted center">
          {room.players.length}/4 jugadores.{' '}
          {isHost
            ? 'Podrás iniciar la partida cuando los 4 estén preparados. Puedes completar las Capitales vacías con el sistema.'
            : 'El anfitrión iniciará la partida.'}{' '}
          <button
            className="link"
            onClick={async () => {
              await call('leave');
              onExit();
            }}
          >
            Salir del mundo
          </button>
        </p>
        {error && <p className="error center">{error}</p>}
      </div>
    </div>
  );
}
