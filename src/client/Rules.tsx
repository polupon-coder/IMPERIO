// Hoja de reglas para los jugadores: resumen fiel de docs/REGLAMENTO.md (con las aclaraciones del autor).
import { useState } from 'react';
import {
  BUILDINGS,
  BUILDING_COST,
  NAMES,
  RESOURCES,
  UNIT_COST,
  UNIT_REQUIRES,
  UNIT_TYPES,
  type Resources,
} from '../engine';
import { UNIT_IMAGES, buildingImage, resourceIcon } from './assets';

const TABS = ['Objetivo', 'Fase I', 'Fase II', 'Edificios', 'Tropas', 'Combate', 'Murallas, Torreón y Capitales'] as const;
type Tab = (typeof TABS)[number];

const BUILDING_EFFECT: Record<string, string> = {
  cuartel: 'Activa el ataque de la Infantería.',
  arqueria: 'Activa el ataque de los Arqueros.',
  caballerizas: 'Permite reclutar Caballería y atacar con ella.',
  herreria: 'Activa los Lanceros y la Artillería.',
  iglesia: 'Permite usar la Fe.',
  mercado: 'Convertir recursos y comerciar con otros jugadores.',
  biblioteca: '+1 recurso a elegir al empezar cada turno.',
  ayuntamiento: 'Requiere 2 edificios previos. Permite 1 Acción Civil + 1 Militar por turno.',
};

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

export function RulesSheet() {
  const [tab, setTab] = useState<Tab>('Objetivo');
  return (
    <div className="rules">
      <nav className="rules-tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'selected' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="rules-body">
        {tab === 'Objetivo' && (
          <>
            <p className="rules-lead">
              Gana <b>inmediatamente</b> quien tenga a la vez sus <b>8 edificios</b> construidos y{' '}
              <b>2 Conquistas</b> de Capitales distintas. Las condiciones pueden conseguirse en cualquier orden.
            </p>
            <ul>
              <li>4 jugadores, tablero de 8 × 8 casillas y dados de seis caras.</li>
              <li>
                Cada jugador tiene una Capital con su color y escudo: <b>Noroeste verde</b>, <b>Noreste azul</b>,{' '}
                <b>Sureste rojo</b> y <b>Suroeste amarillo</b>.
              </li>
              <li>
                Las 8 casillas que rodean tu Capital forman tu <b>anillo</b>: de ahí salen tus recursos y tus tropas.
              </li>
              <li>
                <b>Fase I — Creación del Mundo:</b> entre todos se construye el mapa con 60 losetas.
              </li>
              <li>
                <b>Fase II — El Imperio:</b> se producen recursos, se construyen edificios y se combate.
              </li>
              <li>
                Empieza quien saque más en 1d6 (los empates repiten) y se juega en sentido horario: Noroeste →
                Noreste → Sureste → Suroeste.
              </li>
            </ul>
          </>
        )}

        {tab === 'Fase I' && (
          <>
            <h4>Losetas iniciales</h4>
            <p>
              Todos a la vez colocan 1 Llanura, 1 Bosque, 1 Montaña y 1 Agua en 4 de las 8 casillas de su propio
              anillo.
            </p>
            <h4>Turnos con la pila</h4>
            <p>
              En tu turno robas la loseta superior de la pila común y la colocas en una casilla legal (se resaltan en
              el tablero). Cada jugador coloca 11 losetas de la pila, 15 en total.
            </p>
            <ul>
              <li>Debe tocar por un lado una loseta que hayas colocado tú (si es imposible, cualquier casilla legal).</li>
              <li>Nunca en el anillo de otro jugador, y solo 1 Agua por anillo.</li>
              <li>Nunca puede impedir que las 4 Capitales queden conectadas por tierra.</li>
              <li>Hay que dejar sitio fuera de los anillos para las Aguas que faltan.</li>
              <li>Debes completar tu anillo: si te quedan tantas colocaciones como huecos, van ahí.</li>
              <li>
                Si la loseta no cabe en ningún sitio va al fondo de la pila; si no cabe ninguna, se hace un intercambio
                de emergencia.
              </li>
            </ul>
            <h4>Recompensas</h4>
            <p>
              Cada loseta da 1 recurso: <Cost r={{ comida: 1, madera: 0, piedra: 0, agua: 0 }} /> Llanura ·{' '}
              <Cost r={{ comida: 0, madera: 1, piedra: 0, agua: 0 }} /> Bosque ·{' '}
              <Cost r={{ comida: 0, madera: 0, piedra: 1, agua: 0 }} /> Montaña ·{' '}
              <Cost r={{ comida: 0, madera: 0, piedra: 0, agua: 1 }} /> Agua.
            </p>
            <p>Las losetas terrestres de tu propio anillo dan además una tropa o Muralla:</p>
            <ul>
              <li>Llanura → 1 Infantería.</li>
              <li>Bosque → 1 Arquero o 1 Lancero.</li>
              <li>Montaña → 1 Muralla (si ya tienes 4, nada). La Artillería solo se recluta en la Fase II con Herrería.</li>
            </ul>
            <p>
              Las tropas se colocan en tu anillo (máximo 3 por loseta, nunca en Agua y la Artillería nunca en
              Montaña). Las Murallas van en los lados norte, sur, este u oeste de tu Capital (máximo 4) y quedan
              registradas como tus Murallas originales.
            </p>
          </>
        )}

        {tab === 'Fase II' && (
          <>
            <h4>Al empezar tu turno</h4>
            <p>
              Cada una de las 8 losetas de tu anillo produce 1 recurso. Con Biblioteca, recibes además 1 recurso a tu
              elección.
            </p>
            <h4>Acciones</h4>
            <ul>
              <li>
                <b>Sin Ayuntamiento:</b> 1 Acción Civil <b>o</b> 1 Acción Militar.
              </li>
              <li>
                <b>Con Ayuntamiento:</b> 1 Acción Civil <b>y</b> 1 Acción Militar, en el orden que quieras (termina
                la militar antes de construir).
              </li>
              <li>
                <b>Acción Civil:</b> construir 1 edificio (pulsa el edificio en tu panel) o levantar/reparar 1 Muralla.
              </li>
              <li>
                <b>Acción Militar:</b> activar hasta 3 figuras para mover y atacar, <b>o</b> reclutar 1 tropa y activar hasta 2. Solo se mueven y atacan las tropas con su edificio construido (las grises solo defienden). Si hay varias tropas en la casilla te pregunta si las mueves juntas. La
                tropa reclutada aparece en tu anillo y no actúa ese turno.
              </li>
              <li>Puedes terminar el turno sin hacer nada.</li>
            </ul>
            <h4>Sin gastar acción</h4>
            <ul>
              <li>
                <b>Mercado:</b> convertir 3 recursos iguales en 1 cualquiera, tantas veces como quieras, y 1
                intercambio por turno de 1 recurso por 1 recurso con otro jugador (botón «Comerciar»).
              </li>
              <li>
                <b>Iglesia (Fe):</b> paga 2 Agua para repetir toda tu tirada; el nuevo resultado es obligatorio. Una
                vez por cada turno, también cuando defiendes.
              </li>
            </ul>
          </>
        )}

        {tab === 'Edificios' && (
          <>
            <p>Cada jugador puede construir una copia de cada edificio.</p>
            <table className="rules-table">
              <tbody>
                {BUILDINGS.map((b) => (
                  <tr key={b}>
                    <td>
                      <img className="rules-bld" src={buildingImage(b)} alt="" />
                    </td>
                    <td>
                      <b>{NAMES.building[b]}</b>
                      <br />
                      <Cost r={BUILDING_COST[b]} />
                    </td>
                    <td>{BUILDING_EFFECT[b]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'Tropas' && (
          <>
            <table className="rules-table">
              <thead>
                <tr>
                  <th />
                  <th>Tropa</th>
                  <th>Necesita</th>
                  <th>Coste</th>
                </tr>
              </thead>
              <tbody>
                {UNIT_TYPES.map((u) => (
                  <tr key={u}>
                    <td>
                      <img className="icon" src={UNIT_IMAGES[u]} alt="" />
                    </td>
                    <td>
                      <b>{NAMES.unit[u]}</b>
                    </td>
                    <td>{UNIT_REQUIRES[u].map((b) => NAMES.building[b]).join(' + ')}</td>
                    <td>
                      <Cost r={UNIT_COST[u]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul>
              <li>
                Sin su edificio, una tropa puede moverse y defenderse, pero no atacar. Se ve en gris hasta que lo
                construyes.
              </li>
              <li>Máximo 5 tropas de cada tipo y 3 tropas propias por loseta. Nunca comparten loseta con enemigos.</li>
            </ul>
            <h4>Movimiento</h4>
            <ul>
              <li>Siempre en línea recta (nunca en diagonal). Nunca en Agua ni a través de Capitales o enemigos.</li>
              <li>
                <b>Bosque y Montaña son lentos:</b> entrar termina la activación. Si empiezas en ellos, salir consume
                la activación (1 casilla); si te quedas quieto, puedes atacar.
              </li>
              <li>
                <b>Infantería, Arquero y Lancero</b> desde Llanura: mover 2, o mover 1 y atacar.
              </li>
              <li>
                <b>Caballería</b> desde Llanura: mover 2 y atacar.
              </li>
              <li>
                <b>Artillería</b> desde Llanura: mover 2 <b>o</b> atacar. Nunca entra en Montaña.
              </li>
              <li>Puedes atravesar una loseta propia llena; el límite de 3 solo cuenta donde terminas.</li>
            </ul>
          </>
        )}

        {tab === 'Combate' && (
          <>
            <ul>
              <li>
                Cada bando tira sus dados y cuenta el más alto. Gana el mayor; en empate no pasa nada. El perdedor
                retira 1 tropa que haya participado.
              </li>
              <li>
                <b>Cuerpo a cuerpo:</b> contra una casilla vecina en línea recta.
              </li>
              <li>
                <b>Arquero y Artillería:</b> alcance 2 (la diagonal cuenta como 2). Disparan por encima de todo menos
                Capitales y Murallas.
              </li>
              <li>
                <b>Ataque agrupado:</b> tropas del mismo tipo en la misma loseta pueden atacar juntas (también tras
                moverse): +1 dado por cada figura extra. El defensor también suma sus figuras.
              </li>
              <li>
                Si la loseta atacada tiene varios tipos, <b>el defensor elige</b> cuál defiende.
              </li>
              <li>
                <b>Avance:</b> si un ataque cuerpo a cuerpo vacía la loseta, toda tu formación puede avanzar a ella
                gratis.
              </li>
            </ul>
            <h4>Dados base (atacante contra defensor)</h4>
            <table className="rules-table dice-table">
              <tbody>
                <tr>
                  <td>Caballería contra Infantería</td>
                  <td>2 – 1</td>
                </tr>
                <tr>
                  <td>Caballería contra Arquero (cuerpo a cuerpo)</td>
                  <td>2 – 1</td>
                </tr>
                <tr>
                  <td>Lancero contra Caballería</td>
                  <td>2 – 1</td>
                </tr>
                <tr>
                  <td>Artillería contra tropa convencional (cuerpo a cuerpo)</td>
                  <td>1 – 2</td>
                </tr>
                <tr>
                  <td>Arquero a distancia 2</td>
                  <td>1 – 1</td>
                </tr>
                <tr>
                  <td>Artillería a distancia 2 contra cualquier tropa</td>
                  <td>1 – 2</td>
                </tr>
                <tr>
                  <td>Cualquier otro caso</td>
                  <td>1 – 1</td>
                </tr>
              </tbody>
            </table>
            <ul>
              <li>Las ventajas funcionan en ambos sentidos: si una Infantería ataca a una Caballería, es 1 – 2.</li>
              <li>A distancia 2, el Arquero solo sufre baja si le defiende una tropa con alcance (Arquero o Artillería).</li>
              <li>La Artillería que dispara a distancia 2 contra tropas nunca sufre baja.</li>
            </ul>
          </>
        )}

        {tab === 'Murallas, Torreón y Capitales' && (
          <>
            <h4>Murallas</h4>
            <ul>
              <li>Están en los lados de la Capital y bloquean todo por ese lado, también a las tropas propias.</li>
              <li>
                <b>Tropa convencional</b> junto al lado: 1 dado (+1 por figura extra) contra 2 de la Muralla. Si gana,
                la destruye; si pierde, no sufre baja.
              </li>
              <li>
                <b>Artillería</b> desde la casilla junto al lado o a distancia 2 (en línea o en las diagonales): 2
                dados (+1 por figura extra) contra 1. Si pierde, retira 1 Artillería.
              </li>
              <li>Los Arqueros no atacan Murallas ni Capitales a distancia.</li>
              <li>
                Con la <b>Acción Civil</b> puedes <b>levantar una Muralla nueva</b> (4 Piedra + 1 Madera) o{' '}
                <b>reparar una destruida</b> (3 Piedra), hasta 4 por Capital y nunca en un lado ocupado por tropas
                enemigas. Pulsa «Murallas» en tu panel.
              </li>
              <li>
                Una Muralla destruida no se puede reparar en tu turno siguiente, sino a partir del otro: los rivales
                siempre tienen una ronda para entrar por la brecha.
              </li>
              <li>Al conquistar una Capital, todas sus Murallas (también las levantadas después) vuelven a su sitio.</li>
            </ul>
            <h4>Torreón</h4>
            <ul>
              <li>
                Con <b>Herrería y Ayuntamiento</b>, la <b>Acción Civil</b> puede levantar <b>1 Torreón</b> (4 Piedra + 2
                Madera) en una loseta de tierra vacía junto (por un lado) a una tropa tuya. Nunca en las casillas que
                rodean por los lados a una Capital. Pulsa «Torreón» en tu panel.
              </li>
              <li>Ocupa su loseta: ninguna tropa puede entrar ni pasar por ella, tampoco las tuyas.</li>
              <li>
                <b>Ataca como un Arquero</b> (alcance 2, 1 dado contra 1), gastando una de las activaciones de la Acción
                Militar. Solo cae si le gana un Arquero o una Artillería.
              </li>
              <li>
                <b>Defiende con 2 dados</b> contra 1 (+1 por figura agrupada). Si gana, el atacante no sufre baja; si pierde,
                queda destruido. No tiene Fe.
              </li>
              <li>Si te lo destruyen, no puedes levantar otro hasta que pase una ronda.</li>
            </ul>
            <h4>Conquista</h4>
            <ul>
              <li>
                Una tropa activada y con su edificio, junto a una Capital enemiga por un lado <b>sin Muralla</b> y que
                aún pueda atacar, la <b>conquista automáticamente</b>, sin dados.
              </li>
              <li>La tropa no entra en la Capital: se queda en su casilla.</li>
              <li>
                Cada conquista suma 1 (hacen falta 2, de Capitales distintas). El conquistado no pierde nada y sigue jugando. Su Capital recupera al
                instante sus Murallas originales.
              </li>
              <li>Cada jugador solo puede conquistar una vez cada Capital concreta.</li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
