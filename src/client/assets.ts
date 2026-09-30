// Ilustraciones del juego. Para usar tus propias imágenes, sustituye los archivos de
// public/assets/ manteniendo el nombre, o cambia aquí la ruta/extensión (.png, .webp, .svg).
import type { Terrain, UnitType } from '../engine';

export const TILE_IMAGES: Record<Terrain | 'capital', string> = {
  llanura: '/assets/tiles/llanura.webp',
  bosque: '/assets/tiles/bosque.webp',
  montana: '/assets/tiles/montana.webp',
  agua: '/assets/tiles/agua.webp',
  capital: '/assets/tiles/capital.webp',
};

/** Loseta de Capital con los tejados del color del jugador (scripts/recolor-capital.py). */
export const capitalImage = (color: string) => `/assets/tiles/capital-${color}.webp`;

/** Ilustración de la tropa en el tablero, por color de jugador: public/assets/units/<color>/<tipo>.webp */
export const unitFigure = (color: string, type: UnitType) => `/assets/units/${color}/${type}.webp`;

/** Ilustración de cada edificio (scripts/prepare-buildings.py). */
export const buildingImage = (b: string) => `/assets/buildings/${b}.webp`;

/** Icono de cada recurso (scripts/prepare-resources.py). */
export const resourceIcon = (r: string) => `/assets/resources/${r}.webp`;

/** Muralla: ficha con papel (círculos) e icono transparente (textos). scripts/prepare-wall.py */
export const WALL_TOKEN = '/assets/ui/muralla.webp';
export const WALL_ICON = '/assets/ui/muralla-icono.webp';

/** Iconos pequeños (siluetas) para los paneles. */
export const UNIT_IMAGES: Record<UnitType, string> = {
  infanteria: '/assets/units/infanteria.svg',
  arquero: '/assets/units/arquero.svg',
  lancero: '/assets/units/lancero.svg',
  caballeria: '/assets/units/caballeria.svg',
  artilleria: '/assets/units/artilleria.svg',
};

/** Colores de los jugadores (tono acuarela). */
export const PLAYER_COLORS: Record<string, string> = {
  rojo: '#b3362f',
  azul: '#2f5d9b',
  amarillo: '#d1a12a',
  verde: '#3f7d3a',
};
