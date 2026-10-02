// Sonidos suaves del juego (madera, piedra y metal). Se pueden silenciar; la elección se recuerda.
import { useEffect, useRef, useState } from 'react';
import type { GameState, Seat } from '../engine';

export type SoundName = 'turno' | 'ficha' | 'dados' | 'construir' | 'conquista' | 'victoria' | 'batalla' | 'boton' | 'fe' | 'destruccion' | 'derrota' | 'celebracion' | 'artilleria' | 'caballeria' | 'lancero' | 'infanteria' | 'arquero';

const KEY = 'imperio:mudo';
/** Archivo y volumen de cada sonido (la mayoría son WAV sintetizados; la Fe es un audio aportado por el autor). */
const FILE: Partial<Record<SoundName, string>> = {
  fe: 'fe.mp3',
  destruccion: 'destruccion.mp3',
  derrota: 'derrota.mp3',
  construir: 'construir.mp3',
  batalla: 'batalla.mp3',
  celebracion: 'celebracion.mp3',
  dados: 'dados.mp3',
  victoria: 'victoria.mp3',
  artilleria: 'artilleria.mp3',
  caballeria: 'caballeria.mp3',
  infanteria: 'infanteria.mp3',
  arquero: 'arquero.mp3',
  conquista: 'conquista.mp3',
};
/** Volúmenes igualados a la sonoridad de los sonidos sintetizados. */
const VOLUME: Partial<Record<SoundName, number>> = {
  fe: 0.36,
  destruccion: 0.29,
  derrota: 0.32,
  construir: 0.63,
  batalla: 0.76,
  celebracion: 0.43,
  dados: 0.75,
  victoria: 0.8,
  artilleria: 1,
  caballeria: 0.75,
  lancero: 0.45,
  infanteria: 0.6,
  arquero: 0.35,
  conquista: 1,
};
/** Sonido propio de cada tipo de tropa al moverse, atacar o reclutarse (el Torreón dispara como un Arquero). */
const UNIT_SOUND: Partial<Record<string, SoundName>> = {
  artilleria: 'artilleria',
  caballeria: 'caballeria',
  lancero: 'lancero',
  infanteria: 'infanteria',
  arquero: 'arquero',
};
const UNIT_RE: Array<[RegExp, SoundName]> = [
  [/ (mueve|recluta|despliega) Artillería /, 'artilleria'],
  [/ (mueve|recluta|despliega) Caballería /, 'caballeria'],
  [/ (mueve|recluta|despliega) Lancero /, 'lancero'],
  [/ (mueve|recluta|despliega) Infantería /, 'infanteria'],
  [/ (mueve|recluta|despliega) Arquero /, 'arquero'],
];
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
      base = new Audio(`/assets/sonidos/${FILE[name] ?? `${name}.wav`}`);
      cache.set(name, base);
    }
    const a = base.cloneNode() as HTMLAudioElement;
    a.volume = VOLUME[name] ?? 0.8;
    a.play().catch(() => {}); // el navegador puede bloquearlo hasta la primera interacción
  };
  if (delayMs) setTimeout(go, delayMs);
  else go();
}

// Música de fondo de la portada y del Mundo (sala de espera), en bucle y muy suave.
let music: HTMLAudioElement | null = null;
let musicWanted = false;
/** Se carga en cuanto se abre la página, para que suene al instante con el primer toque. */
function musicElement() {
  if (!music) {
    music = new Audio('/assets/sonidos/musica-portada.mp3');
    music.preload = 'auto';
    music.loop = true;
    music.volume = 0.15;
    music.load();
  }
  return music;
}
function updateMusic() {
  if (!musicWanted || muted) {
    music?.pause();
    return;
  }
  musicElement().play().catch(() => {}); // sin interacción previa el navegador lo bloquea: se reintenta al primer toque
}
if (typeof window !== 'undefined') musicElement();
export function setMusic(on: boolean) {
  musicWanted = on;
  updateMusic();
}
if (typeof window !== 'undefined')
  for (const ev of ['pointerdown', 'touchstart', 'keydown'])
    window.addEventListener(ev, () => {
      if (musicWanted && !muted && music?.paused !== false) updateMusic();
    }, { capture: true });

export function useMuted(): [boolean, () => void] {
  const [m, setM] = useState(muted);
  const toggle = () => {
    muted = !muted;
    setM(muted);
    updateMusic();
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
  const prev = useRef<{ n: number; turnKey: string; combatKey: string; dice: string; result: string; phase: string; built: number } | null>(null);
  useEffect(() => {
    const lastN = s.log.at(-1)?.n ?? 0;
    const active = s.order[s.current];
    const turnKey = s.phase === 'PHASE_2' ? `${s.turnNumber}:${s.turn?.seat}` : `${s.step}:${active}:${s.pile.length}`;
    const c = s.combat ?? s.lastCombat; // un combate sin decisiones se resuelve al instante y queda en lastCombat
    const combatKey = c ? `${c.from}>${JSON.stringify(c.target)}:${c.attackerUnits.join(',')}` : '';
    const dice = c ? `${c.attackerDice.join(',')}|${c.defenderDice.join(',')}` : '';
    const result = c?.result ? `${combatKey}:${dice}:${c.result}` : '';
    const p = prev.current;
    prev.current = { n: lastN, turnKey, combatKey, dice, result, phase: s.phase, built: s.players[mySeat].buildings.length };
    if (!p) return; // primera carga: sin sonidos

    const texts = s.log.filter((e) => e.n > p.n).map((e) => e.text);
    const has = (re: RegExp) => texts.some((t) => re.test(t));
    if (has(/gana Imperio/)) return play('victoria');
    // Fanfarria al completar tus 8 edificios
    if (s.phase !== 'GAME_OVER' && s.players[mySeat].buildings.length === 8 && p.built < 8) return play('victoria');
    // Fanfarria también al empezar la Fase II
    if (p.phase === 'PHASE_1' && s.phase === 'PHASE_2') return play('victoria');
    if (has(/conquista la Capital/)) return play('conquista');

    // Combate: espadas, dados y, al resolverse, explosión si cae una Muralla o un Torreón,
    // y «¡yeah!» o «no» para quien gana o pierde.
    let combatSound = false;
    let at = 0;
    if (has(/ usa Fe /)) {
      play('fe');
      play('dados', 1300);
      at = 2000;
      combatSound = true;
    } else if (combatKey && combatKey !== p.combatKey) {
      // La tropa que ataca suena primero (si tiene sonido propio) y después el choque de espadas
      const own = c ? (c.attackerTower ? 'arquero' : UNIT_SOUND[c.attackerType]) : undefined;
      if (own) {
        play(own);
        play('batalla', 450);
      } else play('batalla');
      if (dice) play('dados', 650);
      at = 1500;
      combatSound = true;
    } else if (dice && dice !== p.dice) {
      play('dados');
      at = 700;
      combatSound = true;
    }
    if (c && result && result !== p.result) {
      combatSound = true;
      if (has(/destruid[oa]/)) play('destruccion', at);
      const mine = c.attacker === mySeat ? 'attacker' : c.defender === mySeat ? 'defender' : null;
      if (mine && c.result !== 'tie') play(c.result === mine ? 'celebracion' : 'derrota', at + (has(/destruid[oa]/) ? 900 : 0));
    }
    if (!combatSound) {
      if (has(/ construye | levanta | repara /)) play('construir');
      else {
        const unit = UNIT_RE.find(([re]) => has(re));
        if (unit) play(unit[1]);
        else if (has(/ coloca | mueve | despliega | recluta | avanza /)) play('ficha');
      }
    }

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
