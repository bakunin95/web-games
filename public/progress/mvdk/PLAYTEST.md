# Playtest gate — Round 5

## Rubric (each room)

| Check | Pass | Fail |
|-------|------|------|
| Blind solve | Tester finishes without hints | Needs verbal hint |
| Insight time | Aha ≤ 30s from spawn stare | Stuck staring &gt; 30s |
| Softlock | Always reversible | Softlock exists |
| Fair death | Player can name why they died | “I don’t know what hit me” |
| One idea | Tester names the new idea | Lists 2+ competing ideas |
| Time | Within 1.5× target | &gt; 2× target or quit |

**Room PASS** = all six checks green.  
**World PASS** = every room PASS, or rest rooms exempt from “one idea”.

## Paper scores (design review — samples)

Scored by applying the rubric to the diagrams in `ROOMS.md` (pre-implementation gate).

| Room | Blind* | Insight | Softlock | Fair | One idea | Time | Result |
|------|--------|---------|----------|------|----------|------|--------|
| T1 | Y | Y | Y | Y | Y | Y | **PASS** |
| T2 | Y | Y | Y | Y | Y | Y | **PASS** |
| T3 | Y | Y | Y | Y | Y | Y | **PASS** |
| T4 | Y | Y | Y | Y | Y | Y | **PASS** |
| T5 | Y | Y | Y | Y | Y | Y | **PASS** |
| T6 | Y | Y | Y** | Y | Y | Y | **PASS** |
| T7 | Y | Y | Y | Y | Y | Y | **PASS** |
| T8 | Y | Y | Y | Y | Y | Y | **PASS** |

\*Blind = readable from diagram alone for a designer familiar with MvsDK grammar.  
\*\*T6 must keep switches reversible — enforced in template QA.

## Live playtest (post-proto)

When a playable build exists, re-run this table with real players and replace paper scores. Softlock or unfair death = round FAIL until fixed.

## P5 polish bar (queued for ship)

- [ ] Jump / land juice
- [ ] Switch & door audio telegraph
- [ ] Barrel shadow beat cue
- [ ] Assist: optional longer timing windows
- [ ] User hard-lock PASS to ship
