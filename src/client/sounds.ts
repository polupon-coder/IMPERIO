// Sonidos suaves del juego (madera, piedra y metal). Se pueden silenciar; la elección se recuerda.
import { useEffect, useRef, useState } from 'react';
import type { GameState, Seat } from '../engine';

export type SoundName = 'turno' | 'ficha' | 'dados' | 'construir' | 'conquista' | 'victoria' | 'batalla' | 'boton';

const KEY = 'imperio:mudo';
const cache = new Map<SoundName, HTMLAudioElement>();

function readMuted() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
let muted = readMuted();

export function play(name: SoundName, delayMs = 0) {
  if (muted) return;
  const go = () => {
    let base = cache.get(name);
    if (!base) {
      base = new Audio(`/assets/sonidos/${name}.wav`);
      cache.set(name, base);
    }
    const a = base.cloneNode() as HTMLAudioElement;
    a.volume = 0.8;
    a.play().catch(() => {}); // el navegador puede bloquearlo hasta la primera interacción
  };
  if (delayMs) setTimeout(go, delayMs);
  else go();
}

export function useMuted(): [boolean, () => void] {
  const [m, setM] = useState(muted);
  const toggle = () => {
    muted = !muted;
    setM(muted);
    try {
      localStorage.setItem(KEY, muted ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  };
  return [m, toggle];
}

/** Elige un sonido para cada actualización de la partida a partir del registro y del estado. */
export function useGameSounds(s: GameState, mySeat: Seat, version: number) {
  const prev = useRef<{ n: number; turnKey: string; combatKey: string; dice: string } | null>(null);
  useEffect(() => {
    const lastN = s.log.at(-1)?.n ?? 0;
    const active = s.order[s.current];
    const turnKey = s.phase === 'PHASE_2' ? `${s.turnNumber}:${s.turn?.seat}` : `${s.step}:${active}:${s.pile.length}`;
    const c = s.combat;
    const combatKey = c ? `${c.from}>${JSON.stringify(c.target)}:${c.attackerUnits.join(',')}` : '';
    const dice = c ? `${c.attackerDice.join(',')}|${c.defenderDice.join(',')}` : '';
    const p = prev.current;
    prev.current = { n: lastN, turnKey, combatKey, dice };
    if (!p) return; // primera carga: sin sonidos

    const texts = s.log.filter((e) => e.n > p.n).map((e) => e.text);
    const has = (re: RegExp) => texts.some((t) => re.test(t));
    if (has(/gana Imperio/)) return play('victoria');
    if (has(/conquista la Capital/)) return play('conquista');

    if (combatKey && combatKey !== p.combatKey) {
      play('batalla');
      if (dice) play('dados', 650);
    } else if (dice && dice !== p.dice) play('dados'); // Fe: nueva tirada
    else if (has(/ construye | levanta | repara /)) play('construir');
    else if (has(/ coloca | mueve | despliega | recluta | avanza /)) play('ficha');

    const myTurnNow = s.phase !== 'GAME_OVER' && (s.phase === 'PHASE_2' ? s.turn?.seat === mySeat : s.step === 'PILE_PLACEMENT' && active === mySeat);
    if (myTurnNow && turnKey !== p.turnKey) play('turno', 400);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Toque grave y corto al pulsar cualquier botón de la interfaz (no las fichas del tablero). */
export function installButtonSounds() {
  const onClick = (e: MouseEvent) => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (!b || b.disabled || b.closest('.board')) return;
    play('boton');
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
