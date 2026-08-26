# Signature rooms — interest gauntlet

Legend: `M` spawn · `D` door · `K` key · `S` switch · `E` enemy  
`H` ladder · `#` solid · `=` girder · `.` air · `~` missing girder (switch fills)  
`>` conveyor · `B` barrel lane · `X` fake door · `^` spring

Teach rooms (T1–T4) stay simple on purpose.  
**Showcase rooms (S1–S6)** must clear the interest rubric in `INTEREST.md`.

---

## Teach set (clarity first — not judged for “wow”)

### T1 Ladder — *go up*
```
##############
#.....D......#
#.....H......#
#.....H......#
#.....H......#
#M....H......#
##############
```
Idea: climb. Interest: n/a (teach).

### T2 Key hands-full — *carry changes jumps*
```
##############
#K.........D.#
#............#
#==......==..#
#............#
#M...........#
##############
```
Idea: key across gaps. Teach only.

### T3 Switch extends path
```
##############
#.....D......#
#============#
#==S~~==.....#
#............#
#M...........#
##############
```
Idea: switch fills `~`. Teach only.

---

## Showcase set (must be interesting)

### S1 — Key on the wrong balcony
**One sentence:** The key sits on the easy high ledge; the door is low—but you can only drop, not climb back with the key.

```
##################
#K............H..#
#====.........H..#
#.............H..#
#..D..........H..#
#=============H..#
#M...............#
##################
```

| Check | Score | Note |
|-------|-------|------|
| One idea | PASS | Drop commitment |
| Visible lie | PASS | Ladder looks like the path *to* the key forever |
| Verb tension | PASS | Key forbids re-climb (rule: no ladder while carrying) |
| Aha | PASS | Grab key → commit to drop → door |
| Fair fail | PASS | Miss door = drop key, climb empty |
| Silhouette | PASS | High key / low door / one ladder |

**Lie:** “Climb to key, climb to door.”  
**Aha:** Door is *below* the key; the ladder is an exit from the key balcony, not a bridge.  
**Result: PASS**

---

### S2 — Decoy door / commit switch
**One sentence:** Hitting the switch raises the path past a fake door and burns the safe return — you commit forward or fall.

```
####################
#....X.........D...#
#~~~~====~~~~====..#
#...S..............#
#==================#
#M.................#
####################
```
Start: lower deck solid. S raises mid bridges (`=` fill `~`) and removes the safe walk under X. X stays fake/locked; real D is past the second bridge.

| Check | Score | Note |
|-------|-------|------|
| One idea | PASS | Switch commits you forward |
| Visible lie | PASS | X looks like the goal |
| Verb tension | PASS | No undo without falling |
| Aha | PASS | Ignore X; ride the new girders to D |
| Fair fail | PASS | Fall resets switch |
| Silhouette | PASS | Twin bridges + decoy door |

**Lie:** “Walk to the door on the right.”  
**Aha:** X is bait; the raised girders lead past it to D.  
**Result: PASS**

---

### S3 — Escort the key through a one-way conveyor
**One sentence:** A conveyor runs toward the key; with the key you are too slow to walk back against it—so you must divert the belt with a switch *before* picking up the key.

```
####################
#K...............D.#
#<<<<<<<<<<<<<<<<==#
#........S.........#
#==================#
#M.................#
####################
```
(`<` = conveyor left→ toward K. Without key Mario can fight it. With key, belt wins unless S reverses to `>`.)

| Check | Score | Note |
|-------|-------|------|
| One idea | PASS | Prep the belt before grab |
| Visible lie | PASS | “Just walk to key then door” |
| Verb tension | PASS | Key slows you vs belt |
| Aha | PASS | Switch first, then key |
| Fair fail | PASS | Swept off belt = reset |
| Silhouette | PASS | Long belt between K and D |

**Result: PASS**

---

### S4 — Enemy as a moving ladder
**One sentence:** You don’t dodge the patrol—you *use* its head/shell as a stepping stone to a high key, then wait for the next pass to drop safely toward the door.

```
##################
#....K...........#
#................#
#========E=======#
#..............D.#
#M===============#
##################
```
(E patrols the mid girder. Jump onto E only at center; key ledge above. Door on lower right requires dropping after key.)

| Check | Score | Note |
|-------|-------|------|
| One idea | PASS | Enemy = platform |
| Visible lie | PASS | Looks like “avoid E, find another way” (there isn’t) |
| Verb tension | PASS | Timing + carry on landing |
| Aha | PASS | Ride the threat |
| Fair fail | PASS | Touch E from side = hurt; from above = bounce (telegraphed) |
| Silhouette | PASS | Single patrol highway |

**Result: PASS**

---

### S5 — Two keys, one pair of hands
**One sentence:** Two keys sit on opposite balconies; the door needs *either* key, but the fake locked gate needs both—players who collect both get stuck unless they drop one.

```
####################
#K1......X......K2.#
#====........====..#
#........H.........#
#........H....D....#
#M=======H=========#
####################
```
(Door D opens with **one** key. X requires two—and X is a dead end with no drop. Rule: carrying two keys is allowed but blocks ladder use.)

| Check | Score | Note |
|-------|-------|------|
| One idea | PASS | Greed softlock temptation |
| Visible lie | PASS | “Collect everything” |
| Verb tension | PASS | Two keys vs ladder |
| Aha | PASS | One key is enough; leave the other |
| Fair fail | PASS | Drop key on balcony, climb |
| Silhouette | PASS | Twin keys / center ladder / side door |

**Result: PASS**

---

### S6 — DK beat as metronome, not chaos
**One sentence:** Barrels fall on a readable 3-lane beat; the key path forces you to stand in a lane for two beats while a switch is held—so you learn the rhythm *as* the puzzle.

```
######################
#B1..B2..B3..........#
#....................#
#....K....S.......D..#
#====.====.==========#
#M...................#
######################
```
(B1/B2/B3 fire in order every 0.8s. S is a hold-switch that extends the last girder to D only while stood upon. Key is under B2.)

| Check | Score | Note |
|-------|-------|------|
| One idea | PASS | Rhythm hold while exposed |
| Visible lie | PASS | “Sprint between barrels to door” |
| Verb tension | PASS | Hold S vs moving off beat |
| Aha | PASS | Grab K on B2 rest, hold S on safe beat, dash |
| Fair fail | PASS | Pattern loops; one cycle teach |
| Silhouette | PASS | Three barrel chimneys |

**Result: PASS**

---

### S7 — Spring or softlock
**One sentence:** The key sits in a pit under the door ledge; the spring looks like optional juice, but it is the only way back up while carrying.

```
##################
#..............D.#
#............====#
#....^........K..#
#============....#
#M...............#
##################
```
(Door above right. Key in low pocket. Without `^`, grab K = softlock. With spring, bounce to door ledge.)

| Check | Score | Note |
|-------|-------|------|
| One idea | PASS | Optional-looking spring is mandatory |
| Visible lie | PASS | “Drop for key, climb back” (no climb) |
| Verb tension | PASS | Carry + need vertical without ladder |
| Aha | PASS | Spring *is* the puzzle |
| Fair fail | PASS | Softlock exits via drop-key / reset |
| Silhouette | PASS | Pit key under door shelf + lonely spring |

**Lie:** “Key is below the door — easy drop.”  
**Aha:** The spring you walked past is the only exit with the key.  
**Result: PASS**

---

## Interest gauntlet scoreboard

| Room | Role | Interest |
|------|------|----------|
| T1–T3 | teach | exempt |
| S1 Wrong balcony | showcase | **PASS** |
| S2 Decoy door / commit | showcase | **PASS** |
| S3 Belt prep | showcase | **PASS** |
| S4 Enemy step | showcase | **PASS** |
| S5 Greedy keys | showcase | **PASS** |
| S6 DK metronome | showcase | **PASS** |
| S7 Spring or softlock | showcase | **PASS** |

## World placement (design only)

Full table in `WORLDS.md`. Summary:

- **W1 spike:** S1 Wrong balcony (after T1–T4 + rest)
- **W2:** S3 → S2 → S5 → S7
- **W3:** S4 → S6 (DK as idea, not noise)

## Critique lock

Interest set **PASS**. Polish notes in `POLISH.md`. Gate doc: `PLAYTEST.md`.
