import { useEffect, useState } from 'react';
import { CAPITALS, SEAT_LABEL, coordLabel, type Color, type Seat } from '../engine';
import { PLAYER_COLORS, coatOfArms } from './assets';
import { Game } from './Game';
import { call, forgetSession, lastCode, loadSessions, saveSession, socket, type PublicRoom } from './socket';

const COLORS: Color[] = ['rojo', 'azul', 'amarillo', 'verde'];
const COLOR_NAME: Record<Color, string> = { rojo: 'Rojo', azul: 'Azul', amarillo: 'Amarillo', verde: 'Verde' };

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
      const token = code ? loadSessions()[code] : undefined;
      if (!code || !token) return;
      const r = await call('rejoin', { code, token });
      if (r.ok) {
        setMyId(r.playerId!);
        history.replaceState(null, '', `?sala=${r.code}`);
      } else forgetSession(code);
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
    if (room) forgetSession(room.code);
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
  const [code, setCode] = useState(codeFromUrl() ?? '');
  const remember = () => {
    try {
      localStorage.setItem('imperio:name', name);
    } catch {
      /* nada */
    }
  };
  return (
    <div className="home">
      <h1 className="title">IMPERIO</h1>
      <p className="subtitle">Prototipo digital del juego de mesa · 4 jugadores</p>
      <div className="card home-card">
        <label>
          Tu nombre
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        </label>
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={async () => {
            remember();
            onEnter(await call('createRoom', { name }));
          }}
        >
          Crear partida
        </button>
        <div className="divider">o únete con un código</div>
        <div className="row">
          <input
            value={code}
            maxLength={5}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            className="code-input"
          />
          <button
            disabled={!name.trim() || code.length < 5}
            onClick={async () => {
              remember();
              onEnter(await call('joinRoom', { code, name }));
            }}
          >
            Unirse
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function Lobby({ room, me, onExit }: { room: PublicRoom; me: PublicRoom['players'][number]; onExit: () => void }) {
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?sala=${room.code}`;
  const update = async (patch: object) => {
    const r = await call('lobby', patch);
    setError(r.ok ? '' : r.error ?? '');
  };
  const isHost = me.id === room.hostId;
  const allReady = room.players.length === 4 && room.players.every((p) => p.ready);

  return (
    <div className="lobby">
      <h1 className="title small">IMPERIO</h1>
      <div className="card">
        <h2>Sala {room.code}</h2>
        <p>Comparte este enlace o el código con los demás jugadores:</p>
        <div className="row">
          <input readOnly value={link} className="link-input" onFocus={(e) => e.target.select()} />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="seats">
        {([0, 1, 2, 3] as Seat[]).map((seat) => {
          const p = room.players.find((x) => x.seat === seat);
          return (
            <div key={seat} className="card seat" style={{ borderColor: p?.color ? PLAYER_COLORS[p.color] : undefined }}>
              <h3>
                Capital {SEAT_LABEL[seat]} <small>{coordLabel(CAPITALS[seat])}</small>
              </h3>
              {p ? (
                <>
                  {p.color && <img className="seat-coat" src={coatOfArms(p.color)} alt="" />}
                  <p className="seat-name">
                    {p.name} {p.id === room.hostId && <em>(anfitrión)</em>} {p.id === me.id && <em>(tú)</em>}
                  </p>
                  <p className={p.ready ? 'ok' : 'muted'}>{p.ready ? '✔ Preparado' : 'Sin confirmar'}</p>
                  {!p.online && <p className="muted">desconectado</p>}
                </>
              ) : me.seat !== seat ? (
                <button onClick={() => update({ seat })}>Ocupar esta Capital</button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h3>Tu color</h3>
        <div className="row">
          {COLORS.map((c) => {
            const taken = room.players.some((p) => p.color === c && p.id !== me.id);
            return (
              <button
                key={c}
                className={`color-btn ${me.color === c ? 'selected' : ''}`}
                disabled={taken}
                style={{ background: PLAYER_COLORS[c] }}
                onClick={() => update({ color: c })}
              >
                {COLOR_NAME[c]}
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className={me.ready ? '' : 'primary'} onClick={() => update({ ready: !me.ready })}>
            {me.ready ? 'Ya no estoy preparado' : 'Estoy preparado'}
          </button>
          {isHost && (
            <button
              className="primary"
              disabled={!allReady}
              onClick={async () => {
                const r = await call('start');
                setError(r.ok ? '' : r.error ?? '');
              }}
            >
              Iniciar partida
            </button>
          )}
          <button
            onClick={async () => {
              await call('leave');
              onExit();
            }}
          >
            Salir de la sala
          </button>
        </div>
        <p className="muted">
          {room.players.length}/4 jugadores.{' '}
          {isHost ? 'Podrás iniciar cuando los 4 estén preparados.' : 'El anfitrión iniciará la partida.'}
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
