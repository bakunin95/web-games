# Room templates T1–T8 — Round 3 (teach / clarity)

These rooms teach verbs. They are **not** judged for “interesting.”

For interest-scored rooms see **`SHOWCASE.md`** (S1–S6+) and the rubric in **`INTEREST.md`**.

Legend: `M` Mario spawn · `D` door · `K` key · `S` switch · `E` enemy · `^` spring · `>` conveyor · `H` ladder · `#` solid · `=` girder · `.` air · `B` barrel path

Each template lists: **aha**, **fail states**, **target time**.

---

## T1 — Teach ladder

```
############
#....D.....#
#....H.....#
#....H.....#
#....H.....#
#M.........#
############
```

- **Aha:** climb to door
- **Fail:** fall off sides (safe ledge)
- **Time:** ≤20s

---

## T2 — Teach key

```
############
#K.......D.#
#..........#
#==....==..#
#..........#
#M.........#
############
```

- **Aha:** grab key, jump gaps, open door
- **Fail:** miss jump (respawn with key reset)
- **Time:** ≤40s

---

## T3 — Switch gate

```
############
#....D.....#
#..........#
#==S....==.#
#..........#
#M.........#
############
```
(When S off, middle gap is open air; S on extends girder.)

- **Aha:** switch creates path
- **Fail:** jump before switch (teaches)
- **Time:** ≤35s

---

## T4 — Conveyor timing

```
############
#........D.#
#..........#
#M>>>>.....#
#..........#
#..........#
############
```

- **Aha:** ride then jump at end
- **Fail:** early jump into pit
- **Time:** ≤30s

---

## T5 — Key + enemy

```
############
#K.......D.#
#..E.......#
#==========#
#..........#
#M.........#
############
```
(E patrols left-right on girder.)

- **Aha:** time pickup past patrol
- **Fail:** touch enemy (fair, visible loop)
- **Time:** ≤50s

---

## T6 — Multi-switch order

```
##############
#S1........D.#
#....==......#
#..S2........#
#====....====#
#M...........#
##############
```
(S1 raises lower bridge; S2 opens door path — must S1 then S2.)

- **Aha:** order matters
- **Fail:** wrong order soft-blocks briefly then reversible
- **Time:** ≤70s

---

## T7 — False path

```
############
#....X...D.#
#....H.....#
#K...H.....#
#====H====.#
#M.........#
############
```
(`X` = locked false door / dead end alcove that looks like goal.)

- **Aha:** real door needs key from side path
- **Fail:** explore dead end (no death)
- **Time:** ≤60s

---

## T8 — DK pressure

```
##############
#B B B ......#
#......K...D.#
#====....====#
#............#
#M...........#
##############
```
(Barrels fall on a 2s beat in left lanes.)

- **Aha:** move between beats while carrying key
- **Fail:** barrel hit — pattern readable after 1 cycle
- **Time:** ≤75s

---

## Template QA (must pass before use)

- [ ] Spawn sees goal silhouette
- [ ] Exactly one new idea (or labeled remix)
- [ ] All fails reversible / taught
- [ ] No softlock without undo
- [ ] Early rooms ≤90s target
