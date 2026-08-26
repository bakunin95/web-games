# Mario vs Donkey Kong — Puzzle Building Plan (full)

Gauntlet: `/progress/mvdk/` · Status: `/progress/mvdk/status.json`

## Round 0 — Scope (PASS)

- Side-view puzzle-platformer
- Grid-snapped construction props (not open sandbox builder)
- Win: key → door **or** Mini-Mario / toy goal
- DK = pressure (barrels, smash beats), not unfair random deaths

## Round 1 — Pillars (PASS · plan lock)

1. **Readable in one glance** — threat, path, goal visible from spawn
2. **One new idea per room** — then remix; never pile-on
3. **Construction fantasy** — girders, ladders, switches, conveyors as verbs
4. **Fair fail** — deaths teach; no hidden crush windows
5. **Short early loop** — enter → solve → exit ≤ ~90s for World 1

## Round 2 — Mechanic kit (PASS)

| Verb | Teach | Combine with | Telegraph |
|------|-------|--------------|-----------|
| Walk / run | Always | everything | silhouette |
| Jump (1–2 tile) | Gap room | conveyor, enemy | floor marks |
| Climb ladder / girder | Safe climb | key carry | distinct color |
| Carry key | Hands-full | jump, enemy | key glow + slow |
| Switch | Toggle path | order puzzles | lever animation |
| Conveyor | Direction/timing | jump windows | chevrons + hum |
| Enemy patrol | Predictable loop | key risk | eyes + path dust |
| Spring / lift | Vertical access | timing | bounce squash |
| DK hazard | Pressure beat | while carrying | rumble + shadow |
| Goal door | Exit | key/Mini-Mario | door light |

**Orphan rule:** any verb without a teach room is cut.

## Round 3 — Room templates T1–T8 (PASS)

See `ROOMS.md` for ASCII diagrams, spawn/goal/fail/aha.

## Round 4 — World sequence (PASS)

See `WORLDS.md` — W1 teach, W2 twist, W3 DK setpiece + rest beats.

## Round 5 — Playtest gate (PASS on paper samples)

See `PLAYTEST.md` — rubric + scored sample rooms. Softlock = FAIL. Blind insight &gt; 30s = FAIL.

## Polish bar (P5)

Juice, audio telegraph, difficulty options — ship when user hard-locks.
