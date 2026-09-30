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

export function loadSessions(): Sessions {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveSession(code: string, token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSessions(), [code]: token }));
    localStorage.setItem('imperio:last', code);
  } catch {
    /* sin almacenamiento */
  }
}
export function forgetSession(code: string) {
  try {
    const s = loadSessions();
    delete s[code];
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.removeItem('imperio:last');
  } catch {
    /* sin almacenamiento */
  }
}
export const lastCode = () => {
  try {
    return localStorage.getItem('imperio:last');
  } catch {
    return null;
  }
};
