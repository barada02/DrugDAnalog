# Analog — Development Plan

Plain-English build plan for the molecule design workbench described in
[IDEA.md](IDEA.md). That document is the *what and why*. This one is the
*in what order, and how do we know each part is finished*.

---

## How to read this

Each phase answers three questions:

- **What are we actually building** — in normal words, no jargon
- **How we build it** — the files, the shapes, the tool contracts
- **How we know it's done** — a thing you can demonstrate, not a feeling

Phase 1 is written out in full because it's next. Later phases are sketched at the
level we need today and get filled in when we reach them. Don't build ahead — every
phase is meant to leave the app in a working, showable state.

---

## Where we are now — Stage 0

Roughly 700 lines, and the foundations are sound.

**Works today:**

- RDKit's WebAssembly build loads, with a real loading screen for the 6.9 MB download
- A focus molecule loads from a SMILES box or one of four presets
- The structure draws as an SVG
- Six properties compute for real: MW, logP, TPSA, HBD, HBA, rotatable bonds
- Lipinski pass/fail, naming the exact rule that broke
- A design board of candidate cards
- Three WebMCP tools registered: `get_workbench_state`, `get_molecule_properties`, `propose_candidate`
- The prediction scorecard — the agent states what it thinks logP will be, RDKit
  measures it, and the card shows both side by side with the error

**Three decisions already made that we should not undo:**

1. RDKit is a module-level singleton, not React state. A tool call can arrive when
   no component is mounted, and it still has to work.
2. The store lives outside React and is reachable through `getState()`. If board
   state ever moves into `useState` or Context, tools can no longer read it.
3. `withMol` owns the lifetime of every molecule object in one place. These are C++
   objects on the WebAssembly heap and they leak silently unless `.delete()` runs.
   Any new RDKit object type needs the same treatment.

**The honest gap.** The pitch says the app is a referee that catches the agent being
wrong, and that structural changes wait for human approval. Neither is true yet. The
agent can write to the board with nobody's permission, and the only thing we check is
whether numbers matched. Phase 1 closes that gap.

---

## The one hard constraint

**No AI goes inside this application.** No model API calls, no keys, no backend, no
inference, no bundled weights. The app ships nothing that thinks.

The intelligence arrives from outside, through WebMCP — the user brings their own
agent (ChatGPT's in-app browser, a Chrome extension, whatever they already pay for)
and it talks to the page through `document.modelContext`.

This is a constraint and it is also the whole idea, so it's worth being precise about
what it means day to day:

**What it rules out.** Any "✨ AI suggestions" button. Any natural-language input the
app parses itself. Any "explain this to me" feature that generates prose. Anything
needing a key, a server, or a network call to a model.

**What it means the app must be.** Three things a language model fundamentally cannot
do for itself, done extremely well:

1. **Compute** — deterministic, verifiable truth. RDKit, formulas, lookup tables.
   Same input, same output, every time, offline.
2. **Remember** — durable state across a whole session that the agent can read and
   write. The agent's context window is not a workbench; ours is.
3. **Show** — render something to a human that could never be pasted into a chat box.

**What it means for how we build.** Since we don't control the model, our only lever
is the tool surface. Tool names, descriptions, input schemas, and above all *what the
responses say* — that is the entire steering mechanism. A tool response is not just
data being returned, it is an instruction being given to something we don't own. This
is why the `hint` field in Phase 1's errors matters more than it looks.

It also means **model-agnostic by default.** We cannot assume any particular model's
capabilities. Tools must be self-describing, forgiving of bad input, and useful to a
weak agent as well as a strong one.

**The test for every feature:** does it still work with the agent switched off? If
yes, and an agent makes it dramatically better, build it. If it only works *because*
an agent is there, it's the wrong feature.

---

## What "done" means for the whole project

> The agent proposes. The app computes. The agent is corrected by the tool before the
> human ever sees the mistake. The human decides.

If a feature doesn't serve that sentence, it waits.

IDEA.md is background, not specification. Where this plan and that document disagree,
this plan wins; where either disagrees with the constraint above, the constraint wins.

---

## The phases at a glance

| Phase | Name | What it gets us |
|---|---|---|
| 0 | Core | Done. Load, draw, compute, propose. |
| **1** | **The Referee** | **The app catches the agent breaking its own promises, and the human holds the pen.** |
| 2 | Honest numbers | More real chemistry, every value labelled with how sure we are. |
| 3 | The board grows up | Lineage, comparison, memory, export, the accuracy ledger. |
| 4 | Shipped chemistry knowledge | Alerts, functional groups, bioisostere suggestions. |
| 5 | Ship it | Deploy, demo video, submission. |
| — | Stretch | 3D viewing, opt-in. |

---

# Phase 1 — The Referee

**The whole point of this phase:** right now the app can only tell the agent it got a
*number* wrong. After this phase it can tell the agent it got the *molecule* wrong —
and it can refuse to act until a human says yes.

This is the phase that makes the demo memorable. A property table is fine. Catching a
model quietly destroying the exact chemical group it promised to protect is the thing
people remember.

Three pieces. Build them in this order.

---

## 1.1 — Keep the scaffold

### What we're building

The human marks one part of the molecule and says: *whatever else you change, leave
this alone.* From then on, every molecule the agent proposes gets checked against that
mark. If the agent broke the promise, the tool response says so immediately — before a
card is ever shown to the human.

In chemistry terms the mark is a SMARTS pattern, which is a small query language for
"this arrangement of atoms". The human doesn't have to write one: we ship a short list
of common groups (amide, ester, carboxylic acid, benzene ring, phenol) as buttons,
with a box for anyone who wants to type their own.

### How we build it

**New file — `src/chem/substructure.ts`**

```ts
export type Match = {
  matched: boolean
  atoms: number[]   // which atoms in the molecule the pattern hit
  bonds: number[]   // which bonds — needed for the highlight drawing
  count: number     // how many times the pattern appears
}

export async function matchPattern(smiles: string, smarts: string): Promise<Match>
export async function isValidPattern(smarts: string): Promise<boolean>
```

**`src/chem/rdkit.ts` — add a sibling to `withMol`**

```ts
export class InvalidSmartsError extends Error { /* mirrors InvalidSmilesError */ }
export async function withQMol<T>(smarts: string, fn: (qmol: JSMol) => T): Promise<T>
```

Same reasoning as `withMol`: `get_qmol` hands back a heap object and it leaks without
`.delete()`. One owner, one place.

**`src/chem/properties.ts` — teach `renderSvg` about highlights**

```ts
export async function renderSvg(smiles: string, opts?: {
  width?: number
  height?: number
  atoms?: number[]
  bonds?: number[]
}): Promise<string>
```

`get_svg_with_highlights` is already the call we make — we just pass it nothing today.
Adding `atoms` and `bonds` to the JSON options object is what colours the matched
region. The preserved scaffold should be visibly shaded on the focus molecule and on
every card.

**`src/store/workbench.ts` — new state**

```ts
scaffold: { smarts: string; label: string } | null

setScaffold: (smarts: string, label: string) => Promise<void>  // validates, re-renders focus highlighted
clearScaffold: () => void
```

And on `Candidate`:

```ts
scaffoldOk: boolean | null   // null means no scaffold was pinned when this was proposed
```

**New tool — `check_substructure`**

| | |
|---|---|
| Inputs | `smiles` (required), `pattern` (optional SMARTS — defaults to the pinned scaffold) |
| Returns | `matched`, `count`, the atom indices, and when it fails, a sentence explaining what's missing |
| Read-only | Yes |

**`propose_candidate` gains a scaffold block in its response**

```json
"scaffold": {
  "required": "C(=O)N",
  "label": "amide",
  "preserved": false,
  "message": "The design goal says keep the amide. This molecule does not contain one. Revise before proposing again."
}
```

That sentence is the piece that does the work. The agent reads it and fixes itself.

---

## 1.2 — Errors the agent can act on

### What we're building

Today a malformed SMILES throws an exception and the agent gets a stack trace or
nothing useful. An agent that recovers from its own bad output is a far better demo
than one that stalls, and models get SMILES wrong constantly — unclosed rings,
impossible valences, a stray bracket.

Every tool should fail the way a good error message fails: say what went wrong, and
say what to do about it.

### How we build it

**Failure shape** — returned with `isError: true`, which the WebMCP `ToolResult` type
already supports.

```ts
type ToolFailure = {
  ok: false
  code: 'INVALID_SMILES' | 'INVALID_SMARTS' | 'DUPLICATE'
      | 'NO_FOCUS' | 'NOT_FOUND' | 'RDKIT_NOT_READY' | 'NEEDS_APPROVAL'
  message: string   // what happened
  hint: string      // what to do instead
}
```

**In `src/mcp/tools.ts`** add two helpers next to the existing `ok()`:

```ts
const fail = (code: string, message: string, hint: string): ToolResult => ...
const guarded = (fn) => async (args) => { /* catch, map known errors to fail(), rethrow the rest */ }
```

Then wrap every `execute` in `guarded`. `InvalidSmilesError` maps to `INVALID_SMILES`
with a hint like *"check that every ring-opening digit has a matching closing digit"*.

**Duplicate detection.** Before adding a candidate, canonicalise the SMILES and compare
it against the focus molecule and everything already on the board. If it's a repeat,
return `DUPLICATE` with the id of the card that already exists. Agents loop and
re-propose; the tool should tell them so instead of growing the board.

---

## 1.3 — The approval gate

### What we're building

The agent may suggest. Only the human may commit. Today the agent writes straight to
the board and could in principle take over the workbench. That contradicts the pitch,
and fixing it turns a limitation into a selling point.

### How we build it

**`Candidate` gains a status**

```ts
status: 'pending' | 'accepted' | 'rejected'
decidedAt: number | null
decisionNote: string        // optional, why the human said no
```

Anything the agent proposes arrives `pending`. Anything the human types in themselves
is `accepted` on arrival — it's their molecule.

**Store action**

```ts
decide: (id: string, status: 'accepted' | 'rejected', note?: string) => void
```

**In the UI.** Pending cards get Accept and Reject buttons. Rejected cards stay on the
board, dimmed and collapsed — they do not vanish. The agent should be able to read
that an idea was turned down and stop re-suggesting it.

**`get_workbench_state` reports the three groups separately** so the agent can see
what's still waiting on the human.

**New tool — `set_focus_molecule`, and this is where the gate lives.** The tool only
accepts a molecule the human has already accepted. Ask it to promote a pending card
and it returns:

```
NEEDS_APPROVAL — "That candidate is still pending. The human has to accept it
before it can become the focus molecule."
```

The approval rule is expressed as a tool contract rather than a popup. It cannot be
clicked past, and the agent is told plainly why.

### The declarative half

We've only used the imperative WebMCP API so far. Phase 1 is the right moment to show
the second one, because the approval gate *is* the declarative pattern's whole
argument.

Put a plain HTML form in the page for changing the focus molecule — a SMILES input, a
submit button — marked up with `toolname` / `tooldescription` and deliberately
**without** `toolautosubmit`. The agent fills the field; the form sits there with the
value in it; the human presses the button. Human sign-off becomes a visible product
feature rather than a missing capability.

Keep `propose_candidate` imperative — proposing is high-volume and should be fast.
Changing focus is the consequential act, and that's the one that waits for a person.
Two APIs, each used where it actually fits.

---

## Files Phase 1 touches

| File | Change |
|---|---|
| `src/chem/rdkit.ts` | add `withQMol`, `InvalidSmartsError` |
| `src/chem/substructure.ts` | **new** — pattern matching |
| `src/chem/properties.ts` | `renderSvg` takes highlight atoms/bonds |
| `src/chem/groups.ts` | **new** — the small library of common scaffold patterns |
| `src/store/workbench.ts` | scaffold state, candidate status, `decide`, dedup |
| `src/mcp/tools.ts` | `fail`/`guarded`, `check_substructure`, `set_focus_molecule`, scaffold block in `propose_candidate` |
| `src/App.tsx` | scaffold picker, highlighted depictions, accept/reject controls |
| `index.html` | the declarative focus form |

---

## Decision: the tool surface stays imperative

Checked against the API reference before deciding. Declarative WebMCP derives its
JSON Schema from form markup, which caps what a tool can accept at what a form can
express: strings, numbers, checkboxes, and `<option>` lists as enums. No arrays, no
nested objects, no conditional schemas, and no dynamic tool sets.

**We go all-imperative.** Three reasons:

1. **Our schemas already outgrow forms.** `compare_molecules` takes an array of
   candidate ids. Constraint boxes are nested objects. Neither is expressible in
   markup, and both are on the roadmap.
2. **One code path.** Registration, teardown by `AbortController`, the `guarded`
   error wrapper, and the call log are all defined once. Mixing APIs doubles every
   one of those.
3. **The approval gate does not need it.** The reference sells "omit
   `toolautosubmit` and a human must press the button" as a free gate. Ours is
   already stronger: no tool exists that can set a candidate to `accepted`, so the
   agent cannot approve its own work through any path, form or otherwise.

**What this costs.** IDEA.md §13 claimed "both imperative and declarative APIs" as
evidence of WebMCP leverage. We are giving that up deliberately. The submission
write-up should say why — a reasoned rejection of an API demonstrates that we
understand it better than a token form would.

**What we keep from the declarative side.** Its real advantage is one code path for
humans and agents so UI and tools cannot drift. We get the same effect by keeping
all shared logic in the zustand store: `FocusPanel` and `set_focus_molecule` both
go through `setFocus`, so there is one implementation with two doors.

One rule borrowed from the reference's gotcha list and worth restating: **write
consequences into descriptions, not just actions.** A tool that says what it will do
*to the board* steers the agent far better than one that only names its inputs.

---

## Phase 1 status

| Piece | State |
|---|---|
| 1.1 Keep the scaffold | **Done.** Pin panel, six built-in groups plus custom SMARTS, highlighted depictions, retroactive re-checking, kept/lost badges. |
| 1.2 Errors the agent can act on | **Done.** `guarded` wrapper, code/message/hint failures, duplicate detection on canonical SMILES. |
| 1.3 The approval gate | **Imperative half done.** Status field, accept/reject controls, `set_focus_molecule` refusing anything unapproved. |
| The declarative form | **Not started.** Still the only part of Phase 1 outstanding. |

Tools now registered: `get_workbench_state`, `get_molecule_properties`,
`check_substructure`, `propose_candidate`, `set_focus_molecule`.

---

## How we know Phase 1 is done

Four things you can demonstrate:

1. **The catch.** Pin "amide" on paracetamol. Ask the agent for four more soluble
   analogs that keep the amide. At least one comes back without it, the tool says so,
   and the agent corrects itself — with no human intervention in between.
2. **The recovery.** Hand a tool a broken SMILES on purpose. The agent gets a sentence
   it can act on and fixes the string.
3. **The gate.** No agent action changes the focus molecule without a human click. Ask
   it to promote a pending card and it explains that it can't.
4. **Still works alone.** Turn WebMCP off entirely. Pin a scaffold, load molecules,
   accept and reject cards by hand. The app is a complete product with no agent
   anywhere near it.

---

# Phase 2 — Honest numbers

**What we're building:** more real chemistry, and a label on every single value saying
how much to trust it.

The confidence tier is the differentiating idea and it's cheap:

| Tier | Meaning | Examples |
|---|---|---|
| **Exact** | Counted from the structure. Not an opinion. | MW, HBD, HBA, rings, rotatable bonds |
| **Computed** | A published algorithm with known error. | logP (Crippen, roughly ±0.5), TPSA |
| **Estimated** | A regression. Useful, not precise. | solubility (ESOL, roughly ±1 log unit) |
| **Unknown** | We can't know this and we won't pretend. | potency, toxicity, binding |

Every number in the UI carries its tier visually, and every tool response carries it as
a field — so the agent is told what it is allowed to claim.

**New chemistry to add**, all of it arithmetic over descriptors we already get, with no
new dependency:

- More rulesets beyond Lipinski: Veber, Egan, Ghose, lead-likeness, Rule of 3, and
  Pfizer 3/75 (high logP plus low TPSA flags a toxicity risk)
- **QED** — one drug-likeness score between 0 and 1, from eight properties. The best
  single number to put on a card.
- **ESOL solubility** — a four-term equation over logP, MW, rotatable bonds and
  aromatic proportion. This matters because our headline use case is *"make it more
  soluble"* and right now the app cannot answer that question at all; it only gestures
  at logP.
- **Fsp3** and aromatic ring count — the standard "is this too flat" check
- **Undefined stereocentre warning.** RDKit reports these directly. When an agent hands
  over a SMILES with two unspecified centres it hasn't described one compound, it's
  described four, and it almost never notices.

## Phase 2 status

| Piece | State |
|---|---|
| Confidence tiers | **Done.** `MEASURES` drives the grid and the tool responses from one list. |
| ESOL solubility | **Done.** Validated against experimental values, worst error 0.94 of the 1.0 log unit claimed. |
| Veber, Egan, Pfizer 3/75 | **Done**, alongside Lipinski, each naming the broken clause. |
| Fsp3, aromatic rings | **Done.** |
| Undefined stereocentre warning | **Done.** |
| `get_computable_limits` | **Done.** Names what we refuse to guess. |
| QED | **Deferred to Phase 4.** See below. |

Files added: `src/chem/rules.ts`, `src/chem/solubility.ts`, `src/chem/measures.ts`.
Tools now: `get_workbench_state`, `get_molecule_properties`, `check_substructure`,
`propose_candidate`, `get_computable_limits`, `set_focus_molecule`.

### Why QED moved to Phase 4

QED needs eight inputs and we have seven. The eighth is ALERTS — a count of matches
against a published list of 116 unwanted-substructure SMARTS patterns. Without it the
number would not be QED, it would be QED-shaped.

Reproducing 116 SMARTS patterns from memory is exactly the kind of work that produces
subtly wrong output we cannot detect offline, and shipping a wrong QED would break
rule 1. So it waits for Phase 4, where the structural alert catalog arrives as
verified data anyway and QED becomes a short function on top of it.

This is the honesty rule applied to ourselves, which is the only way it means
anything.

---

**Done when:** a card shows predicted solubility with its error bar, every value is
visibly tiered, and asking the agent for the potency of anything gets a refusal from
the tool rather than a number.

---

# Phase 3 — The board grows up

**What we're building:** the board stops being a flat list and starts being a record of
how the design actually went.

- **Lineage.** Accepting a candidate makes it the new focus and records the edge. Draw
  the tree. We already store the parent link and never show it.
- **Comparison.** A `compare_molecules` tool and a side-by-side table, so *"which of
  these is the best balance"* has an answer built from real columns.
- **Diversity.** Morgan fingerprints and Tanimoto similarity, giving two things: how far
  each analog has drifted from the parent, and whether eight candidates are eight ideas
  or one idea rewritten eight times. Agents are bad at this and the app can prove it
  with a number.
- **Memory.** Save to `localStorage`. Losing the board on refresh is fatal during a live
  demo.
- **Export.** CSV and a plain SMILES list.
- **The accuracy ledger.** Promote the prediction scorecard from a detail on a card to a
  running, session-level scoreboard: *this model was wrong about logP in 7 of 9
  proposals, mean error 1.4 log units.* Persist it, export it. Nobody else has this, and
  it falls out of work we're already doing.

**Done when:** you can run a full session, close the tab, reopen it, see the design path
as a tree, and export the whole thing plus the model's accuracy record.

---

# Phase 4 — Chemistry we ship as data

**What we're building:** knowledge that lives in a JSON file rather than in a model's
memory.

- **Structural alerts** — PAINS, Brenk and NIH are published lists of SMARTS patterns.
  Ship them, match them, and a card can say *"contains a catechol, known frequent
  hitter, this will ruin your assay."* Highest med-chem credibility per line of code in
  the whole project.
- **Functional group inventory** — what groups are actually in this molecule, named.
- **Bioisostere suggestions.** Note the minimal RDKit build has no reaction support, so
  we cannot apply a transformation ourselves. That turns out to be the right shape
  anyway: we ship the catalog as a *lookup* (carboxylic acid → tetrazole,
  acylsulfonamide, hydroxamic acid, with the typical property shifts), expose it as a
  tool, and the **agent writes the new molecule while the app checks it.** That is our
  thesis expressed as a feature.
- **Synthetic accessibility** — an ease-of-synthesis score from a shipped fragment
  table. Answers "could this even be made", the question that kills most AI-generated
  molecules.

**Done when:** proposing a known problem compound gets flagged with the reason, and
asking "what could replace this acid" returns real options with real numbers.

---

# Phase 5 — Ship it

- Polish: loading, empty states, error states, mobile-tolerable layout
- Deploy to a static host and confirm it works in ChatGPT's in-app browser, which is how
  it'll be judged
- ~~Replace the root `readme.md`.~~ **Done early** — it was the Gremlin sandbox
  write-up and was actively confusing during development. Moved to
  `docs/webmcp-notes.md` with a header saying what it is, and a real README written
  for Analog.
- Demo video, under three minutes, with audio. Lead with the scaffold catch.
- Submission text: why WebMCP fits, what humans and agents can now do together that was
  hard before, how we implemented it
- Confirm the deadline and submission URL — still unknown, flagged in IDEA.md

---

# Stretch — 3D

Opt-in only, and only after Phase 5. RDKit's minimal build cannot generate 3D
coordinates, so they have to come over the network, which breaks the
everything-stays-in-your-browser promise. That trade has to be a button the user presses
knowingly, not a default.

---

# Rules we hold to

1. **Never show a number we didn't compute.** If we can't compute it, the UI says
   unknown and the tool refuses.
2. **Every number says where it came from.** Exact, computed, estimated, unknown.
3. **The agent never commits.** It proposes; the human accepts.
4. **Nothing leaves the browser without a deliberate click.**
5. **No potency, no docking, no toxicity predictions.** Refusing these loudly is worth
   more than faking them.
6. **The app has to work with no agent at all.** Every phase keeps that true.
7. **One slice per commit.** Each phase is several commits and the app runs after every
   one.
