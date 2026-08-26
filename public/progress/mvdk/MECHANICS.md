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
- **Switch** — toggle platforms, conveyors, or doors. Binary state, visible.
- **Conveyor** — constant direction; reverse only via switch.
- **Goal door** — opens with key or Mini-Mario delivery.

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

## Cuts (out of kit for v1)

- Free-place construction editor mid-level
- Flight / wall-jump
- Invisible switches
- Random enemy speeds
