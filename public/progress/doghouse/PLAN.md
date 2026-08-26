# Doghouse Level Gauntlet

**One-liner:** 2D puzzle platformer — find **3 bones** in each room, then curl up in the glowing **bed**.

Fantasy: tiny dog in a built city. The **street is a hallway of doors**. **Height lives inside buildings** (2–3 story interiors + roof payoff). Not a collectathon. Not combat. Not Donkey Kong.

## Loop

```
curriculum room N
  → design note
  → JSON
  → critic card
  → FAIL: smallest patch (no full rewrite)
  → PASS: lock, go to N+1
```

Stop after a pass. Do not “improve” a passed room in the same round.

## Curriculum

| # | Room | New | Status |
|---|------|-----|--------|
| 0 | Backyard basics | move, jump, dig, bed | **PASS** |
| 1 | Deli block (alley thesis) | portal + 2–3 story interior | **PASS** |
| 2 | Key shop | key + door | **PASS** |
| 3 | Crate step | push crate as step | **PASS** |
| 4 | Plate parking | pressure plate + door | TODO |
| 5 | Belt job | conveyor | TODO |
| 6 | Lift job | elevator | TODO |
| 7 | Heat | lava/slag + raft | TODO |
| 8 | Zip / rope | zipline **or** rope | TODO |
| 9 | Liftworks combine | NONE (combine known) | TODO |

## Teach pattern

Introduce (safe) → Test (heat) → Combine (known) → Reward (bone / bed)

## World model

```
ALLEY (campaign / city-alley)
  sidewalk ← choose a door, easy bone, read the block
  building portals → INTERIOR (shop-interior) stories 1–3
  ROOF / fire escape ← height the street lacked
  EXIT BED ← landmark on first screen of that space
```

## Files

- `LEVEL-BUILDING-GUIDE.md` — schema + hard fails
- `curriculum/room-NN-*.md` — design notes + critic cards
- `levels/room-NN.json` — exportable level packs
- `status.json` — live board
