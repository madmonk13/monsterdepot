# Monster Depot

A single-player browser game: order a monster from the catalog, bolt on weapons, graft on mutations, and send it into the arena.

## Play

Open `index.html` in a browser — no build step or dependencies. (Or serve the folder, e.g. `python3 -m http.server`.)

Everything is saved automatically in your browser's localStorage, so a reload picks up where you left off:

- your profile (cash, monsters, weapons, ammo, upgrades, record);
- where you were in the menus (screen, tab, arena choices, current challenger);
- any battle in progress. It's snapshotted every second and when the page is hidden or closed, and comes back paused after a reload. A battle that ended just before the reload still pays out.

To move a game to another browser or computer, use **Transfer Save** on the title screen (or the 💾 button in HQ). **Export Save** downloads a small `.json` file; **Import File…** on the other device loads it, after showing a summary and asking before it overwrites anything.

## Game loop

- **Catalog** — 12 monsters, each with its own stats and trait (regeneration, flight, venom, nine lives, a pack of pups, built-in eye beam or fire breath, 3 weapon hardpoints…).
- **Armory** — 7 weapons. Ammo is bought in packs and carries over between fights.
- **Gene Lab** — permanent stat grafts. Monsters also level up from XP.
- **Stable** — 3 kennels, so up to 3 monsters. Damage persists after battle, so heal before the next one.
- **Arena** — 4 modes (Survival, Horde, Capture the Flag, Destruction), 4 procedurally generated arenas with destructible terrain, water and lava, and 3 difficulty tiers.

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move | WASD / arrows | Left stick |
| Aim | Mouse (or face where you walk) | Right stick |
| Fire | Left click / J | RT |
| Melee | Space / right click / K | A |
| Dash | Shift / L | B |
| Switch weapon | Q / E / 1–3 / wheel | LB / RB |
| Pause | Esc / P | Start |

## Code layout

- `js/data.js` — monsters, weapons, mutations, arenas, modes, difficulties
- `js/save.js` — profile, stats, persistence
- `js/world.js` — arena generation, terrain, pathfinding
- `js/battle.js` — combat, AI, game-mode rules
- `js/battle_render.js` — arena rendering and HUD
- `js/art.js` — procedural monster art
- `js/audio.js` — synthesized sound effects (WebAudio)
- `js/ui.js` — menus and screens
