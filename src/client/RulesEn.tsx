// Rules sheet in English: a faithful summary of docs/REGLAMENTO.md (same tabs as the Spanish sheet).
import { BUILDINGS, BUILDING_COST, NAMES_EN, RESOURCES, UNIT_COST, UNIT_REQUIRES, UNIT_TYPES, type Resources } from '../engine';
import { UNIT_IMAGES, buildingImage, resourceIcon } from './assets';

const BUILDING_EFFECT_EN: Record<string, string> = {
  cuartel: 'Enables Infantry attacks.',
  arqueria: 'Enables Archer attacks.',
  caballerizas: 'Lets you recruit Cavalry and attack with it.',
  herreria: 'Enables Spearmen and Artillery.',
  iglesia: 'Lets you use Faith.',
  mercado: 'Convert resources and trade with other players.',
  biblioteca: '+1 resource of your choice at the start of each turn.',
  ayuntamiento: 'Requires 2 earlier buildings. Allows 1 Civil + 1 Military Action per turn.',
};

function Cost({ r }: { r: Resources }) {
  return (
    <span className="cost">
      {RESOURCES.filter((k) => r[k] > 0).map((k) => (
        <span key={k} title={NAMES_EN.resource[k]}>
          {r[k]}
          <img src={resourceIcon(k)} alt={NAMES_EN.resource[k]} />
        </span>
      ))}
    </span>
  );
}

/** Content of one tab (the tab ids are the Spanish names used by the Spanish sheet). */
export function RulesEnBody({ tab }: { tab: string }) {
  return (
    <>
      {tab === 'Objetivo' && (
        <>
          <p className="rules-lead">
            The winner is whoever <b>at the same time</b> has all <b>8 buildings</b> built and <b>2 Conquests</b> of
            different Capitals — they win <b>immediately</b>. The two conditions can be met in any order.
          </p>
          <ul>
            <li>4 players, an 8 × 8 board and six-sided dice.</li>
            <li>
              Each player has a Capital with its own colour and coat of arms: <b>Northwest green</b>, <b>Northeast blue</b>,{' '}
              <b>Southeast red</b> and <b>Southwest yellow</b>.
            </li>
            <li>
              The 8 squares around your Capital are your <b>ring</b>: your resources and your troops come from there.
            </li>
            <li>
              <b>Phase I — Creation of the World:</b> together, the players build the map with 60 tiles.
            </li>
            <li>
              <b>Phase II — The Empire:</b> produce resources, build buildings and fight.
            </li>
            <li>
              Whoever rolls highest on 1d6 starts (ties reroll) and play goes clockwise: Northwest → Northeast →
              Southeast → Southwest.
            </li>
          </ul>
        </>
      )}

      {tab === 'Fase I' && (
        <>
          <h4>Starting tiles</h4>
          <p>Everyone at the same time places 1 Plains, 1 Forest, 1 Mountain and 1 Water on 4 of the 8 squares of their own ring.</p>
          <h4>Turns with the pile</h4>
          <p>
            On your turn you draw the top tile of the common pile and place it on a legal square (they are highlighted on
            the board). Each player places 11 tiles from the pile, 15 in total.
          </p>
          <ul>
            <li>It must touch, along a side, a tile you placed yourself (if that is impossible, any legal square).</li>
            <li>Never in another player's ring, and only 1 Water per ring.</li>
            <li>It can never prevent the 4 Capitals from being connected by land.</li>
            <li>Room must be left outside the rings for the remaining Waters.</li>
            <li>You must complete your ring: if you have as many placements left as empty squares, they go there.</li>
            <li>If the tile fits nowhere it goes to the bottom of the pile; if no tile fits, an emergency exchange is made.</li>
          </ul>
          <h4>Rewards</h4>
          <p>
            Each tile gives 1 resource: <Cost r={{ comida: 1, madera: 0, piedra: 0, agua: 0 }} /> Plains ·{' '}
            <Cost r={{ comida: 0, madera: 1, piedra: 0, agua: 0 }} /> Forest ·{' '}
            <Cost r={{ comida: 0, madera: 0, piedra: 1, agua: 0 }} /> Mountain ·{' '}
            <Cost r={{ comida: 0, madera: 0, piedra: 0, agua: 1 }} /> Water.
          </p>
          <p>Land tiles in your own ring also give a troop or a Wall:</p>
          <ul>
            <li>Plains → 1 Infantry.</li>
            <li>Forest → 1 Archer or 1 Spearman.</li>
            <li>Mountain → 1 Wall (if you already have 4, nothing). Artillery can only be recruited in Phase II with a Blacksmith.</li>
          </ul>
          <p>
            Troops are placed in your ring (at most 3 per tile, never on Water, and Artillery never on Mountain). Walls go
            on the north, south, east or west side of your Capital (at most 4) and are recorded as your original Walls.
          </p>
        </>
      )}

      {tab === 'Fase II' && (
        <>
          <h4>At the start of your turn</h4>
          <p>Each of the 8 tiles of your ring produces 1 resource. With a Library, you also get 1 resource of your choice.</p>
          <h4>Actions</h4>
          <ul>
            <li>
              <b>Without a Town Hall:</b> 1 Civil Action <b>or</b> 1 Military Action.
            </li>
            <li>
              <b>With a Town Hall:</b> 1 Civil Action <b>and</b> 1 Military Action, in the order you like (end the
              military one before building).
            </li>
            <li>
              <b>Civil Action:</b> build 1 building (tap the building on your panel) or raise/repair 1 Wall.
            </li>
            <li>
              <b>Military Action:</b> up to 3 activations to move and attack, <b>or</b> recruit 1 troop and 2 activations.
              Figures of the same type on one square that move or attack together count as a single activation. Only
              troops whose building is built can move and attack (grey ones only defend). If there are several troops on
              the square you are asked whether to move them together. A recruited troop appears in your ring and does not
              act that turn.
            </li>
            <li>You can end your turn without doing anything.</li>
          </ul>
          <h4>Without spending an action</h4>
          <ul>
            <li>
              <b>Market:</b> convert 3 identical resources into 1 of any kind, as often as you like, and 1 trade per turn
              of 1 resource for 1 resource with another player (“Trade” button).
            </li>
            <li>
              <b>Church (Faith):</b> pay 2 Water to reroll your whole roll if you are not winning (you lose or tie); the
              new result is final. Once per turn, also when you defend.
            </li>
          </ul>
        </>
      )}

      {tab === 'Edificios' && (
        <>
          <p>Each player can build one copy of each building.</p>
          <table className="rules-table">
            <tbody>
              {BUILDINGS.map((b) => (
                <tr key={b}>
                  <td>
                    <img className="rules-bld" src={buildingImage(b)} alt="" />
                  </td>
                  <td>
                    <b>{NAMES_EN.building[b]}</b>
                    <br />
                    <Cost r={BUILDING_COST[b]} />
                  </td>
                  <td>{BUILDING_EFFECT_EN[b]}</td>
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
                <th>Troop</th>
                <th>Needs</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {UNIT_TYPES.map((u) => (
                <tr key={u}>
                  <td>
                    <img className="icon" src={UNIT_IMAGES[u]} alt="" />
                  </td>
                  <td>
                    <b>{NAMES_EN.unit[u]}</b>
                  </td>
                  <td>{UNIT_REQUIRES[u].map((b) => NAMES_EN.building[b]).join(' + ')}</td>
                  <td>
                    <Cost r={UNIT_COST[u]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul>
            <li>Without its building, a troop can move and defend, but not attack. It is shown in grey until you build it.</li>
            <li>At most 5 troops of each type and 3 of your own troops per tile. They never share a tile with enemies.</li>
          </ul>
          <h4>Movement</h4>
          <ul>
            <li>
              Always in a straight line (never diagonally). Never onto Water, nor through enemies or other players' Capitals.
              You can pass through your own Capital (and its Walls), counting one step, but you cannot stop in it.
            </li>
            <li>
              <b>Forest and Mountain are slow:</b> entering ends the activation. If you start on one, leaving uses up the
              activation (1 square); if you stay put, you can attack.
            </li>
            <li>
              <b>Infantry, Archer and Spearman</b> from Plains: move 2, or move 1 and attack.
            </li>
            <li>
              <b>Cavalry</b> from Plains: move 2 and attack.
            </li>
            <li>
              <b>Artillery</b> from Plains: move 2 <b>or</b> attack. It never enters Mountains.
            </li>
            <li>You can pass through a full tile of your own; the limit of 3 only counts where you stop.</li>
          </ul>
        </>
      )}

      {tab === 'Combate' && (
        <>
          <ul>
            <li>
              Each side rolls its dice and counts the highest. The higher wins; on a tie nothing happens. The loser loses{' '}
              <b>all the troops that fought</b>: if 3 Cavalry attack and lose, all 3 fall; if 2 Infantry defend and lose,
              both fall (in a mixed stack, only the type that defended).
            </li>
            <li>
              <b>Melee:</b> against a neighbouring square in a straight line.
            </li>
            <li>
              <b>Archer and Artillery:</b> range 2 (a diagonal counts as 2). They shoot over everything except Capitals and
              Walls.
            </li>
            <li>
              <b>Group attack:</b> troops of the same type on the same tile can attack together (also after moving): +1 die
              per extra figure. The defender also adds its figures.
            </li>
            <li>
              If the attacked tile has several types, <b>the defender chooses</b> which one defends.
            </li>
            <li>
              <b>Advance:</b> if a melee attack empties the tile, your whole formation can advance into it for free.
            </li>
          </ul>
          <h4>Base dice (attacker vs defender)</h4>
          <table className="rules-table dice-table">
            <tbody>
              <tr>
                <td>Cavalry vs Infantry</td>
                <td>2 – 1</td>
              </tr>
              <tr>
                <td>Cavalry vs Archer (melee)</td>
                <td>2 – 1</td>
              </tr>
              <tr>
                <td>Spearman vs Cavalry</td>
                <td>2 – 1</td>
              </tr>
              <tr>
                <td>Artillery vs a conventional troop (melee)</td>
                <td>1 – 2</td>
              </tr>
              <tr>
                <td>Archer at distance 2</td>
                <td>1 – 1</td>
              </tr>
              <tr>
                <td>Artillery at distance 2 vs any troop</td>
                <td>1 – 2</td>
              </tr>
              <tr>
                <td>Any other case</td>
                <td>1 – 1</td>
              </tr>
            </tbody>
          </table>
          <ul>
            <li>Advantages work both ways: if an Infantry attacks a Cavalry, it is 1 – 2.</li>
            <li>At distance 2, an Archer only suffers a loss if the defender has range (Archer or Artillery).</li>
            <li>Artillery shooting troops at distance 2 never suffers a loss.</li>
          </ul>
        </>
      )}

      {tab === 'Murallas, Torreón y Capitales' && (
        <>
          <h4>Walls</h4>
          <ul>
            <li>
              They stand on the sides of the Capital and, on that side, block enemy movement and all shots (yours too).
              Your own troops do cross your Walls when passing through your Capital.
            </li>
            <li>
              <b>Conventional troop</b> next to the side: 1 die (+1 per extra figure) against the Wall's 2. If it wins, the
              Wall is destroyed; if it loses, it suffers no loss.
            </li>
            <li>
              <b>Artillery</b> from the square next to the side or at distance 2 (in line or on the diagonals): 2 dice (+1
              per extra figure) against 1. If it loses, all the Artillery that attacked falls.
            </li>
            <li>
              <b>Archers</b> attack the Wall from the same squares as Artillery (next to the side or at distance 2), as a
              conventional troop: 1 die (+1 per extra figure) against 2, with no loss. They do not conquer Capitals from a
              distance.
            </li>
            <li>
              With the <b>Civil Action</b> you can <b>raise a new Wall</b> (4 Stone + 1 Wood) or <b>repair a destroyed
              one</b> (3 Stone), up to 4 per Capital and never on a side occupied by enemy troops. Tap “Walls” on your
              panel.
            </li>
            <li>
              A destroyed Wall cannot be repaired on your next turn, only from the one after: rivals always get a round to
              go through the breach.
            </li>
            <li>When a Capital is conquered, all its Walls (including those raised later) are restored.</li>
          </ul>
          <h4>Tower</h4>
          <ul>
            <li>
              With a <b>Blacksmith and a Town Hall</b>, the <b>Civil Action</b> can raise <b>1 Tower</b> (4 Stone + 2 Wood)
              on an empty land tile next to (along a side) one of your troops. Never on the squares beside a Capital. Tap
              “Tower” on your panel.
            </li>
            <li>
              It takes 1 of the 3 places of its tile: up to 2 of your troops fit as a garrison, and your troops can pass
              through it. Enemy troops can neither pass nor stop there.
            </li>
            <li>With a garrison, the troops defend and the Tower cannot be attacked until the tile is empty.</li>
            <li>
              <b>It attacks like an Archer</b> (range 2, 1 die against 1), using one of the activations of the Military
              Action. It only falls if an Archer or an Artillery beats it.
            </li>
            <li>
              <b>It defends with 2 dice</b> against 1 (+1 per grouped figure). If it wins, the attacker suffers no loss; if
              it loses, it is destroyed. It has no Faith.
            </li>
            <li>If it is destroyed, you cannot raise another one until a round has passed.</li>
          </ul>
          <h4>Conquest</h4>
          <ul>
            <li>
              An activated troop with its building, next to an enemy Capital on a side <b>without a Wall</b> and still
              able to attack, <b>conquers it automatically</b>, with no dice.
            </li>
            <li>The troop does not enter the Capital: it stays on its square.</li>
            <li>
              Each conquest counts 1 (you need 2, of different Capitals). The conquered player loses nothing and keeps
              playing. Their Capital instantly gets its original Walls back.
            </li>
            <li>Each player can conquer each particular Capital only once.</li>
          </ul>
        </>
      )}
    </>
  );
}
