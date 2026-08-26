# Doghouse Level Gauntlet

**One-liner:** 2D puzzle platformer — find **3 bones** in each room, then curl up in the glowing **bed**.

Fantasy: tiny dog in a built city. The **street is a hallway of doors**. **Height lives inside buildings** (2–3 story interiors + roof payoff). Not a collectathon. Not combat. Not Donkey Kong.

## Loop

```
curriculum room N
  → design note
  → JSON
  → critic card
  → FAIL: smallest patch
  → PASS: lock, go to N+1
```

## Curriculum — CLEARED

| # | Room | New | Status |
|---|------|-----|--------|
| 0 | Backyard basics | move, jump, dig, bed | **PASS** |
| 1 | Deli block (alley thesis) | portal + 2–3 story interior | **PASS** |
| 2 | Key shop | key + door | **PASS** |
| 3 | Crate step | push crate as step | **PASS** |
| 4 | Plate parking | pressure plate + door | **PASS** |
| 5 | Belt job | conveyor | **PASS** |
| 6 | Lift job | elevator | **PASS** |
| 7 | Heat | lava/slag + raft | **PASS** |
| 8 | Zip / roof run | zipline | **PASS** |
| 9 | Liftworks combine | NONE (combine) | **PASS** |

## World model

Street = door hallway. Buildings = vertical game (2–3 stories + roof).

## Files

`LEVEL-BUILDING-GUIDE.md` · `curriculum/room-NN-*.md` · `levels/room-NN.json` · `status.json`
