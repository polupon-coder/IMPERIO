# IMPERIO — prototipo digital

Versión web jugable del juego de mesa **IMPERIO** para 4 jugadores remotos. Todos ven el mismo tablero
en tiempo real y el servidor aplica automáticamente todas las reglas.

- **Reglas:** [`docs/REGLAMENTO.md`](docs/REGLAMENTO.md) es la única fuente de verdad, con las aclaraciones del autor.
- **Estado:** prototipo completo de la Fase I y la Fase II, pensado para playtesting.

## Cómo jugar

1. Un jugador entra en la web, escribe su nombre y pulsa **Crear partida**.
2. Comparte el enlace (`…/?sala=CÓDIGO`) o el código de 5 letras.
3. Cada jugador elige su Capital (Noroeste, Noreste, Sureste o Suroeste) y su color, y pulsa **Estoy preparado**.
4. Cuando están los 4 preparados, el anfitrión pulsa **Iniciar partida**.
5. Si alguien cierra el navegador, al volver a abrir el enlace entra automáticamente en su sitio. La sesión se guarda en el navegador y la partida en el servidor.

Durante la partida, el tablero resalta siempre lo que es legal:

| Resaltado | Significado |
|---|---|
| Verde | Casillas donde puedes colocar una loseta, desplegar o reclutar |
| Azul | Casillas a las que puede moverse la tropa seleccionada |
| Rojo | Objetivos de ataque. Las Murallas atacables parpadean |
| Dorado | Capital que puedes conquistar |

Las tiradas se hacen automáticamente y la Fe se ofrece cuando corresponde.

## Desarrollo

Requiere Node 20 o superior.

```bash
npm install
npm run dev:server   # servidor en http://localhost:3001
npm run dev:client   # interfaz en http://localhost:5173 (con proxy al servidor)
npm test             # tests del motor de reglas
npm run typecheck
npx tsx scripts/simulate-phase1.ts 1 500   # simula Fases I aleatorias y busca bloqueos
```

Para producción, `npm run build` genera `dist/client` y `npm start` sirve la web y el WebSocket en `PORT` (3001 por defecto). Las partidas se guardan como JSON en `data/rooms/`; `DATA_DIR` permite cambiar esa ruta. Hace falta un alojamiento con disco persistente y WebSockets, por ejemplo Render, Railway o Fly.io.

## Arquitectura

```
src/engine/   Motor de reglas puro (TypeScript, sin red): estado, validación, consultas de legalidad, dados.
  rules.ts      constantes, costes y geometría del tablero
  phase1.ts     colocación de losetas, conectividad, reserva de Agua, intercambio de emergencia
  military.ts   movimiento, objetivos de ataque, línea de tiro, dados base
  game.ts       createGame / applyAction: la máquina de estados completa
src/server/   Express + Socket.IO: salas, lobby, persistencia y reconexión. Es la única autoridad.
src/client/   React: inicio, lobby, tablero y panel de acciones. Usa el mismo motor para resaltar lo legal.
public/assets Ilustraciones (provisionales).
```

El cliente nunca decide el resultado de nada: envía una acción y el servidor la valida con el motor, la aplica y la envía a todos. El generador de dados vive solo en el servidor.

### Estados de la partida

- `SETUP / FIRST_PLAYER`: tirada automática de primer jugador.
- `PHASE_1`, dividida en:
  - `INITIAL_PLACEMENT`: colocación simultánea de las 4 losetas iniciales.
  - `PILE_PLACEMENT`: un turno por jugador con la pila común.
  - `EXCHANGE`: intercambio de emergencia (§16).
  - `FINAL_DEPLOY`: despliegue de las tropas que quedaron en reserva.
  - `BLOCKED`: bloqueo sin solución prevista por el reglamento.
- `PHASE_2 / TURN`: producción, Biblioteca, Acción Civil y Acción Militar, Mercado y negociación.
- `GAME_OVER`.

Hay dos tipos de decisiones que se superponen al estado principal:

- `prompt`: decisiones pendientes de un jugador concreto, que puede no ser el activo. Por ejemplo, el recurso de la Biblioteca, qué tipo defiende, la Fe, el avance tras el combate o responder a una oferta de comercio.
- `combat`: combate en curso.

## Sustituir las ilustraciones

Las imágenes están en `public/assets/`:

- `tiles/llanura.svg`, `bosque.svg`, `montana.svg`, `agua.svg`, `capital.svg`
- `units/infanteria.svg`, `arquero.svg`, `lancero.svg`, `caballeria.svg`, `artilleria.svg`

Para usar tus ilustraciones, sustituye cada archivo manteniendo el nombre. Si quieres usar PNG o WebP, cambia la ruta o la extensión en `src/client/assets.ts`. Las losetas se muestran cuadradas y recortadas (`object-fit: cover`). Los iconos de tropa se muestran en blanco sobre la ficha del color de cada jugador; si usas ilustraciones a color, quita el `filter: invert(1)` de `.token img` en `src/client/styles.css`.
