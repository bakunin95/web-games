# Level building guide (Doghouse)

## Win condition

Exactly **3 bones** → bed glows → dog curls up. Room over.

## Hard fails (any one = FAIL)

1. Not exactly 3 bones, or a bone inside solid geometry
2. Bed never reachable / never glows after 3 bones
3. Two **new** mechanics in the same room (unless curriculum says COMBINE)
4. Alley room with no usable 2–3 story interior (rooms 1+)
5. Interior that is one flat floor (need stacked stories or clear roof exit)
6. Patrol in a dead end with no escape ledge
7. Switch and door not in the same sightline (or clearly linked)
8. Bed / landmark to bed not readable on the first screen of that space
9. Sequence break required (unless intentional in the note)
10. Stale `collected: true` left on exports

## JSON wrapper

```json
{ "game": "platformer", "levels": [ /* ... */ ] }
```

### Campaign street

- `scope`: `"campaign"`
- `theme`: `"city-alley"`
- Floor around `y ≈ 14`, top-left origin, **Y down**
- `exit` / bed platform `kind: "bed"`
- Portals: `{ "x", "y", "w", "h", "targetLevelId", "targetSpawn": { "x", "y" }, "label" }`

### Interior

- `scope`: `"interior"`
- `theme`: `"shop-interior"`
- `parentLevelId` → street id
- Return portal back to street (or roof hatch that still counts as vertical payoff)
- Ladders: `kind: "ladder"`, `solid: false`

### Common fields

`id`, `name`, `order`, `coinReward`, `objective`, `width`, `height`, `spawn`, `platforms`, `bones`

Optional: `toys`, `ropes`, `boxes`, `switches`, `keys`, `conveyors`, `digZones`, `digs`, `portals`, `spikes`, `enemies`, `rafts`, `elevators`, `ziplines`, `props`, `decors`, `rain`, …

Do **not** invent keys/fields outside this toolkit. Do **not** commit `collected: true`.

## Toolkit (author-facing)

Dog: move, jump, double jump, climb ladder, rope, push crate, pick up/throw, dig, crawl pipe, lever, swim, raft, zipline.

Traversal: ladder, rope, elevator (`lowY` is the **top** — smaller Y; cabin starts at `lowY`), moving platforms, portal, zipline, stairs, trampoline, raft, pipe, dig tunnel.

Puzzle: crate, pressure/toggle/lever, doors, dig spots, signal nodes.

Heat: spikes, patrols, water/toxic/lava, steam, crushers, collapsing, breakables, wind, ice, mud.

Atmosphere OK: `rain.enabled`. Do not require unwired fire/smoke/water VFX modules.
