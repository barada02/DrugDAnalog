# Analog

A molecule design workbench where a human and their AI agent work on the same
molecule together — and **every chemical claim is computed, never generated.**

The app ships no AI. There is no model, no API key, no backend, no inference. The
intelligence walks in from outside through [WebMCP](https://github.com/webmachinelearning/webmcp):
you bring your own agent and it talks to the page directly.

---

## The problem

Ask any chat model to improve a molecule and it will hand you a confident logP
value. It did not compute that number. It cannot — it can only produce something
that reads plausibly. In chemistry, plausible and correct are not close.

Worse, models break their own promises structurally. Ask for *"a more soluble
version, but keep the amide"* and you will get a molecule described as keeping the
amide that quietly does not. Nothing in a chat window can catch that.

## What this does about it

The app is the **referee**, not the assistant:

1. The agent proposes a structure
2. **RDKit computes the truth** — in your browser, deterministically
3. The agent is **told when it was wrong**, before you ever see the result
4. **You** decide what is kept

The agent brings chemistry knowledge and tireless enumeration. You bring intent and
judgement. The app is the only party that can actually compute — so that is all it
does.

---

## What works today

Everything below runs with **no agent connected at all**. That is a requirement, not
a coincidence — the app has to be a complete tool on its own.

**Molecules**
- Load by SMILES or from a preset library
- 2D structure rendering
- Canonical SMILES, so two spellings of one molecule are recognised as one molecule

**Properties, each labelled with how far to trust it**
- *Exact* (counted from the structure): MW, HBD, HBA, rotatable bonds, aromatic
  rings, Fsp3
- *Computed* (published algorithm): logP (Crippen), TPSA
- *Estimated* (regression, error stated): aqueous solubility via ESOL, ±1 log unit
- A warning when a SMILES leaves stereocentres undefined — that means it describes
  2ⁿ compounds, not one

**Drug-likeness rulesets**, each naming the exact clause that broke rather than just
failing: Lipinski, Veber, Egan, Pfizer 3/75.

**Scaffold preservation** — pin a functional group (amide, ester, carboxylic acid,
phenol, benzene, primary amine, or your own SMARTS) and it must survive every
proposal. The match is shaded on the depiction, and any candidate that lost it is
flagged in red. Pinning is retroactive: the whole board is re-checked.

**The design board**
- Candidate cards with structure, properties, rule verdicts and scaffold status
- A **prediction scorecard**: the agent states its expected logP *before* computing,
  and the card shows claimed against measured with the error
- An **approval gate**: agent proposals arrive `pending` and only you can accept them
- A call log showing every tool call, tagged `[human]` or `[agent]`

---

## Run it

```bash
cd danlog_app
npm install          # also copies the RDKit WASM build into public/
npm run dev
```

| | |
|---|---|
| Node | 18+ |
| Browser | Chrome 149+ for WebMCP, or ChatGPT's in-app browser |

Other scripts: `npm run build`, `npm run lint`, `npm run preview`.

### Deployment

Hosted on Vercel. Two settings matter:

- **Root Directory must be `danlog_app`**, since that is where `package.json` lives.
- Nothing else to configure. `dist/` and `public/rdkit/` are both gitignored, so the
  6.9 MB RDKit build never enters the repo -- `sync-rdkit.mjs` regenerates it from
  `node_modules` on install and again before every build. A clean checkout produces
  a complete `dist/`, verified.

`vercel.json` sets a 30 day cache on `/rdkit/*` so returning visitors do not
re-download the WASM, and pins its content type to `application/wasm`. The cache is
deliberately not `immutable`: the path is stable rather than content-hashed, so an
RDKit version bump needs to reach people who already have the old one.

### Connecting an agent

WebMCP is still behind a flag in most builds.

1. `chrome://flags/#enable-webmcp-testing` → **Enabled**
2. **Relaunch** Chrome — a reload is not enough
3. Open the app over `http://localhost` or `https://`

**ChatGPT's in-app browser supports WebMCP with no flag**, which is the easiest test
path.

Two things cause most "it doesn't work" reports:

- WebMCP is **secure-context only**. `http://localhost` counts; `file://` never will.
- It is **`document.modelContext`**, not `navigator.modelContext`.

The header shows how many tools registered. If it says WebMCP unavailable, the app
still works — you just lose the agent half.

The first load pulls a **6.9 MB WebAssembly build of RDKit**. It is cached after
that, and there is a real loading screen for it.

---

## The tool surface

Six tools, all imperative. [PLAN.md](PLAN.md) explains why we rejected the
declarative API.

| Tool | What it does |
|---|---|
| `get_workbench_state` | The goal, the pinned group, the focus molecule, and every candidate grouped by approval status |
| `get_molecule_properties` | Real descriptors, rule verdicts, and a confidence tier on every value |
| `check_substructure` | Does this molecule still contain that group? Lets an agent screen its own ideas before proposing |
| `propose_candidate` | Adds a card and returns the measured properties, the scaffold verdict, and the agent's prediction error |
| `get_computable_limits` | What this app refuses to guess, and why |
| `set_focus_molecule` | Promote a candidate — **refuses anything the human has not accepted** |

Two details that carry the whole design:

**`propose_candidate` returns the truth to the agent.** Propose something that makes
logP worse and the tool says so immediately, with the error on every predicted value.
The agent corrects itself before you look.

**Failures are data, not exceptions.** Every tool returns a code, a message and a
*hint* saying what to do next. We do not own the model on the other end, so response
text is the only steering available — an agent that gets a stack trace is stuck, one
that gets a hint fixes itself.

---

## What this will not do

Refusing loudly is worth more than faking it, so `get_computable_limits` tells the
agent the same list:

- **No potency, binding affinity, or docking.** Those need an assay or a protein
  structure and a force field.
- **No toxicity prediction.** Pfizer 3/75 flags a known risk pattern; that is a
  warning, not a prediction.
- **No pKa.** Needs a measurement or a trained model.
- **No synthesis routes.**
- **No structure-drawing editor.** SMILES input, presets, and agent proposals.

Every number in the UI states how it was obtained, and anything we cannot compute is
reported as unknown rather than estimated.

---

## How it is built

Fully client-side. No backend, no accounts, no database — which means it deploys to
any static host for nothing, and **your structures never leave your browser.**

```
danlog_app/src/
  chem/
    rdkit.ts         RDKit loading + heap lifetime wrappers
    properties.ts    Descriptors and canonical SMILES
    substructure.ts  SMARTS pattern matching
    measures.ts      Confidence tiers -- drives the UI and the tool responses
    rules.ts         Lipinski, Veber, Egan, Pfizer 3/75
    solubility.ts    ESOL
    groups.ts        Common functional groups as SMARTS
  store/workbench.ts Board state, deliberately outside React
  mcp/tools.ts       The WebMCP tool surface
  App.tsx            UI
```

React 19 · TypeScript · Vite · zustand · oxlint · `@rdkit/rdkit` 2025.03.4

Three decisions worth knowing before changing anything:

1. **RDKit is a module singleton, not React state.** A tool call can arrive when no
   component is mounted and it still has to work.
2. **Board state lives outside React**, reachable via `useWorkbench.getState()`. Move
   it into `useState` or Context and the tools can no longer read it.
3. **Every RDKit object is manually freed.** They are C++ objects on the WASM heap
   with no garbage collector — `withMol` and `withQMol` own their lifetimes in one
   place. Note that these free on callback return, so never hand them an async
   callback; see the comment in `substructure.ts`.

---

## Project documents

| | |
|---|---|
| [PLAN.md](PLAN.md) | The build plan, in plain English. Phases, what is done, and the decisions behind it. Start here. |
| [IDEA.md](IDEA.md) | The original concept note. Background, not specification. |
| [docs/webmcp-notes.md](docs/webmcp-notes.md) | WebMCP API reference and gotchas, from a separate learning project. Not about this app. |

## License

MIT — see [LICENSE](LICENSE).
