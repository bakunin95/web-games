# Mechanic kit — Round 2

Atomic verbs for Mario vs Donkey Kong–style puzzles. Each must be teachable in ~10s.

## Verbs (locked)

### Locomotion
- **Walk / run** — base move. No stamina.
- **Jump** — clear 1-tile gap always; 2-tile with run-up or spring. No variable height abuse in early worlds.

### Construction traverse
- **Ladder** — vertical only; exit top/bottom onto girders.
- **Girder** — horizontal walkway; can be toggled by switches in later rooms.
- **Spring / lift** — one-shot vertical boost; predictable arc.

### Puzzle objects
- **Key** — pick up / drop. While carrying: no climb in W1; W2+ may allow ladder-with-key as the twist.
- **Two keys** — allowed late (S5). Carrying two blocks ladder use. Door UI must show how many it needs.
- **Switch** — toggle platforms, conveyors, or doors. Binary state, visible. Hold-switch (S6/S8) stays on only while weighted.
- **Crate** — pushable weight for hold-switches (S8). Cannot push while carrying a key.
- **Conveyor** — constant direction; reverse only via switch. Hands-full may lose a fight against the belt (S3).
- **Spring** — predictable arc; may look optional but can be the only exit with a key (S7).
- **Broken ladder stub** — reads as climbable; fails as exit (S7 lie).
- **Goal door** — opens with key or Mini-Mario delivery. Fake doors (`X`) never open.

### Threats
- **Enemy patrol** — fixed loop, no aggro turnarounds in W1.
- **DK hazard** — barrels / smash shadow on a beat. Pattern readable after one cycle.

## Combinations (allowed)

| Combo | First appears | Intent |
|-------|---------------|--------|
| Key + gap | T2 / W1-2 | hands-full jump |
| Switch → girder | T3 / W1-3 | cause-effect |
| Conveyor + jump | T4 / W1-4 | timing |
| Key + enemy | T5 / W2-1 | risk |
| Dual switch order | T6 / W2-3 | sequence |
| DK barrels + key | T8 / W3-2 | pressure |
| Key + drop commit | S1 / W1-7 | no re-climb |
| Switch + decoy door | S2 / W2-4 | misdirection |
| Belt prep + key | S3 / W2-2 | order |
| Enemy as step | S4 / W3-2 | reframe threat |
| Dual key greed | S5 / W2-6 | optionalism |
| Hold-switch + barrels | S6 / W3-6 | rhythm |
| Spring or softlock | S7 / W2-7 | false optional |
| Crate + hold-switch | S8 / W3-3 | borrowed weight |
| One-toggle girder | S9 / W2-8 | don’t double-press |
| Scout before drop | S10 / W3-5 | arm exit first |

## Cuts (out of kit for v1)

- Free-place construction editor mid-level
- Flight / wall-jump
- Invisible switches
- Random enemy speeds
