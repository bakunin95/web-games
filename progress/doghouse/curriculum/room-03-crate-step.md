# ROOM 3 — Crate step

ROOM ID: `dh-r03-alley` + `dh-r03-stockroom`  
TITLE: Crate Step  
SET: alley + interior (stockroom)  
STORIES: street = 1; STOCKROOM = 2 stories + loft shelf  
NEW MECHANIC: push crate; crate as a step  
KNOWN MECHANICS USED: move, jump, portal, ladders, bed  
THE LESSON IN ONE SENTENCE: Push the crate on flat ground first, then use it as a step to reach a bone you couldn’t jump to alone.

WALKTHROUGH:
1. Spawn on sidewalk. Bone A on a low curb (opening).
2. STOCKROOM door + bed landmark on the stockroom roof facade.
3. Enter STOCKROOM. Story 1: a pushable crate on flat floor, clear of enemies.
4. Push the crate a few tiles (introduce push — safe).
5. See Bone B on a mid shelf too high for a standing jump.
6. Push the crate under the shelf; jump from crate to Bone B (test: crate as step).
7. Climb ladder to story 2 loft; Bone C on a short run of shelves (known jump, reward).
8. Hatch to roof bed — curl up.
9. (Street has no second bone; all lesson bones are inside.)

BONE A: Sidewalk — open.  
BONE B: Story 1 high shelf — requires crate step (the lesson).  
BONE C: Story 2 loft — reward after the lesson.

BED: Stockroom roof. Landmark: bed silhouette on facade above STOCKROOM door.  
BUILDINGS: STOCKROOM (required). Optional flavor facade.  
HEIGHT: 2 stories + roof; crate lesson is on story 1 (safe introduce/test), loft is known climb.

FAIL CONDITIONS I CHECKED:
- [x] 3 bones
- [x] bed on roof
- [x] one new toy: push crate / crate as step (no key, no plate)
- [x] multi-story interior
- [x] introduce on flat → test as step → reward upstairs
- [x] no `collected: true`

---

## Critic card — Room 3

**PASS**

Hard fails:
- [x] exactly 3 bones
- [x] bed real exit
- [x] only NEW = crate push / step
- [x] 2-story + roof interior
- [x] not flat-only
- [x] no patrols
- [x] N/A switch sightline
- [x] street: STOCKROOM + roof bed landmark; interior: crate + high shelf readable
- [x] no sequence break
- [x] no `collected: true`

Lesson: A open → push introduce → B crate-step test → C loft + bed.  
Height: building holds the shelf/loft; street only chooses the door.

**LOCK.** Next: Room 4 — Plate parking.
