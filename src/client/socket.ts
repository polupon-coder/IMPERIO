import { io } from 'socket.io-client';
import type { PublicRoom } from '../server/rooms';

export type { PublicRoom };
export const socket = io({ transports: ['websocket', 'polling'] });

export interface Reply {
  ok: boolean;
  error?: string;
  code?: string;
  token?: string;
  playerId?: number;
}

export const call = (event: string, data?: unknown) =>
  new Promise<Reply>((resolve) => socket.emit(event, data, (r: Reply) => resolve(r)));

const KEY = 'imperio:sessions';
type Sessions = Record<string, string>;

/**
 * Cada pestaña recuerda su propio jugador (sessionStorage), para poder probar con
 * varias pestañas a la vez. localStorage guarda la última sesión como respaldo,
 * para volver a entrar tras cerrar el navegador.
 */
function read(store: Storage): Sessions {
  try {
    return JSON.parse(store.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
/** Solo las sesiones de esta pestaña. */
export const tabSessions = (): Sessions => read(sessionStorage);

export function loadSessions(): Sessions {
  return { ...read(localStorage), ...read(sessionStorage) };
}
export function saveSession(code: string, token: string) {
  for (const store of [sessionStorage, localStorage]) {
    try {
      store.setItem(KEY, JSON.stringify({ ...read(store), [code]: token }));
      store.setItem('imperio:last', code);
    } catch {
      /* sin almacenamiento */
    }
  }
}
export function forgetSession(code: string) {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const s = read(store);
      delete s[code];
      store.setItem(KEY, JSON.stringify(s));
      store.removeItem('imperio:last');
    } catch {
      /* sin almacenamiento */
    }
  }
}
export const lastCode = () => {
  try {
    return sessionStorage.getItem('imperio:last') ?? localStorage.getItem('imperio:last');
  } catch {
    return null;
  }
};
