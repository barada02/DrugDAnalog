# ANALOG — Drug Design with Honest AI

## Inspiration

Ask a language model for a molecular weight and a predicted aqueous solubility. It will state both with identical confidence. One is arithmetic. The other is a regression with roughly a log unit of error either way.

This gap — between what an AI claims and what the chemistry actually measures — is **not** an edge case in AI-assisted drug design. It's **the** problem.

A fluent model will produce plausible numbers for molecules that don't exist yet. Plausible is indistinguishable from correct right up until someone orders the reagents and the compound fails synthesis or misses potency by an order of magnitude.

We built ANALOG because that gap demands a human in the decision loop, and because the tools to close it — to let agents propose and humans verify — didn't exist until WebMCP.

---

## What it does

**ANALOG is a molecular design workbench where people and their agents collaborate to design drug analogs, with every computed number verified by RDKit running locally in the browser.**

The workflow:
1. **You** set a focus molecule and a design brief (goal, numeric constraints, functional group to preserve)
2. **Agent** proposes analogs via WebMCP tools — reads the board, computes properties, suggests bioisosteres
3. **You** inspect each one. Every number carries a confidence tier: exact (counted), computed (algorithm), estimated (regression with its error band)
4. **You** decide: accept, reject, shortlist, or promote to focus (starting a new generation)
5. **Agent** sees your decision and learns what you value

The agent can only *propose*. It cannot accept, promote, or download — the human holds every gate. And the numbers in reports come from RDKit, never from the model's recall.

**Six workspaces, each with one job:**
- **Overview** — what's blocking you, whether you're converging on your brief
- **Design** — the board: focus molecule, brief, ranked candidates
- **Explore** — every proposal ever made, filterable by generation, ruleset, synthesizability
- **Compare** — two to five molecules side by side with deltas and a profile radar
- **Evolution** — the design tree as a graph, showing how the board evolved
- **Report** — a document the agent drafts and you publish (PDF, HTML, Markdown)

---

## How we built it

### Architecture
**React 19 + TypeScript** with **Zustand** for board state. Board state deliberately lives outside React because WebMCP tool calls arrive from outside React and must reach the live state without going through a render cycle.

### The chemistry
**RDKit compiled to WebAssembly** runs in the browser. Every molecular descriptor, solubility estimate, drug-likeness check, synthetic accessibility score and absorption prediction runs locally. No molecule is uploaded to compute anything.

Nine chemistry modules cover:
- **Descriptors**: MW, logP, TPSA, HBD/HBA, rotatable bonds, rings, Fsp³
- **Solubility**: ESOL estimate with error bounds
- **Drug-likeness**: Lipinski, Veber, Egan, Pfizer 3/75 (each naming which clause fails)
- **Absorption**: HIA, oral bioavailability, BBB, P-gp efflux, net brain penetration
- **Metabolism**: Hepatic stability, CYP3A4/2D6/2C9 likelihood
- **Synthesis**: Synthetic accessibility (Ertl) with complexity drivers
- **Structure**: Functional groups, structural alerts, toxicity patterns, bioisostere suggestions
- **Similarity**: Morgan fingerprints, Tanimoto, board diversity
- **Shape**: 3D descriptors (NPR1/NPR2/span) from fetched coordinates

### WebMCP implementation
**Twelve tools** registered via `document.modelContext.registerTool()`:

| Tool | Purpose |
|---|---|
| `get_workbench_state` | Read the board, brief, prediction accuracy |
| `get_molecule_properties` | Descriptor set for any SMILES |
| `analyse_structure` | Functional groups, alerts, toxicity patterns |
| `check_substructure` | SMARTS pattern matching |
| `suggest_bioisosteres` | Replacement suggestions for groups present |
| `compare_molecules` | Delta table vs focus |
| `get_3d_shape` | Shape descriptors where coordinates exist |
| `propose_candidate` | Add an analog — **scores agent's prediction against RDKit's measurement** |
| `set_focus_molecule` | Promote an accepted candidate |
| `get_computable_limits` | What the app refuses to estimate, and why |
| `draft_report` | Agent writes narrative; app renders numbers from live state |
| `clear_report` | Discard draft |

**Two design principles made WebMCP essential:**

1. **Every failure carries a hint, not a stack trace.** We don't own the model, so the response text is our only steering. A tool returning "INVALID_SMILES: That SMILES is malformed. Check for unclosed brackets or invalid bond orders" lets an agent fix itself and retry. A stack trace leaves it stuck.

2. **Predictions are invited, then checked.** `propose_candidate` asks the agent for its expected MW, logP, and TPSA *before* it computes them, returns the error on each, and remembers. That feedback loop is the point — it's the only honest way to find out if the agent's chemistry intuition is any good.

### The UI
- **Docked inspector** shows a molecule's full descriptor set, 3D structure, rules, rules that failed, and what the agent said about it
- **Generation tree as a graph** via React Flow + d3-hierarchy, showing every molecule and the promoted spine
- **Convergence chart** tracking how close the board got to the design brief across generations
- **Prediction ledger** tracking how often the agent's stated numbers actually matched RDKit's measurements
- **Reports** where the agent writes judgment and the app renders every number, table, structure and chart from live state — so a recalled figure can never reach a published document

---

## Challenges we ran into

### Conformer generation
RDKit's browser build cannot generate 3D coordinates. We fetch them from NCI CACTUS when viewing 3D, with permission in Settings to respect privacy claims.

### Rendering performance
A generation tree with 50+ molecules requires efficient layout. **d3-hierarchy** computes the tidy tree, React Flow renders the graph, and we memoized the node renderer to prevent card remounts on layout recalculations.

### State architecture
Tool calls arrive from outside React. We couldn't keep state in React context or component state — the tools wouldn't see mutations in time. **Zustand** solved this: the store is a plain object, tools call `useWorkbench.getState()` directly, mutations update live state, React subscribes to it separately.

### Scope creep
We resisted adding tools for binding affinity, potency, toxicity, or synthetic routes — all of which require either a lab, a protein structure, or a trained model. The app returns refusals with explanations instead. A plausible number with nothing behind it is worse than no number.

### Design decisions
- **Agent can only propose.** Accepting, promoting, downloading are human acts. This prevents the agent from creating a pipeline that bypasses human judgment.
- **Every number carries a confidence tier.** Exact (counted), Computed (algorithm), Estimated (regression with error band). Users read the tier before trusting the number.
- **Reports split judgement from chemistry.** Agent writes prose; app renders numbers. A recalled figure cannot reach a document going out under your name.

---

## Accomplishments that we're proud of

### 1. **Honest AI + Human Loop** (WebMCP Leverage & Potential Impact)
Nobody else is solving this problem: separating what an agent *claims* from what the chemistry *measures*. The prediction ledger alone is unique — it tracks how often the agent's own stated numbers survived checking. That's evidence, not vibes.

### 2. **Real product, not a proof of concept** (Execution)
Six workspaces, each with one job. Generation tree as a graph. Docked inspector. Convergence charts. Reports you can edit and download. This is a complete, coherent experience.

### 3. **All chemistry is local** (Potential Impact)
Every descriptor, solubility estimate, rule check, and synthesizability score runs in the browser via RDKit WebAssembly. Only 3D coordinates (optional, toggleable) and systematic names (optional, toggleable) leave the machine — and both go to public NIH services with full disclosure.

### 4. **Twelve non-trivial tools** (WebMCP Leverage)
Not buttons wrapped as tools. Each one solves a real problem: the agent needs to propose candidates that survive the brief, see why its previous proposals failed, understand what it got right and what it got wrong. The tools are the collaboration medium.

### 5. **Refusals with reasons** (Creativity)
When asked for binding affinity or potency, the app doesn't guess. It returns a refusal naming what's missing (a lab, a protein structure, a trained model). That honesty is rare and worth defending.

### 6. **Confidence tiers on every number** (Execution)
Exact, Computed, Estimated. Each carries how it was arrived at and what its error bound is (if it has one). This distinction is what makes the workbench worth using instead of asking an LLM directly.

---

## What we learned

### 1. **WebMCP is the missing piece for AI collaboration**
Before WebMCP, agents either:
- Made decisions humans should make (autonomous pipeline, bad)
- Copied results back and forth manually (error-prone, tedious)
- Didn't reach the app's state at all (hallucinated recovery)

WebMCP lets agents propose meaningfully while keeping humans in control. That's not a nice-to-have — it's the foundation of trustworthy AI.

### 2. **State architecture matters**
React-only state doesn't work when tools need live access. **Zustand as a plain store** that tools call directly solved this elegantly. No context thrashing, no subscription overhead, just getState() and mutations land immediately.

### 3. **Honesty scales**
Refusing to compute what you can't, labeling confidence on every number, splitting agent judgment from app measurement — these design choices cost complexity upfront but pay off massively in user trust and product coherence.

### 4. **The prediction ledger is evidence**
The moment you ask the agent to state its prediction before the oracle runs, you get evidence of whether its intuition is any good. That feedback loop, tracked over time, is more valuable than any confidence metric.

### 5. **Tool design is interface design**
A tool that returns "Stack trace at line 42" leaves an agent stuck. One that returns "code: INVALID_SMILES, message: malformed, hint: check for unclosed brackets" lets it self-correct. Tool design is how you steer agents.

---

## What's next for Drug_D_Analog

### Short term (1-2 months)
- **Batch prediction**: Let the agent propose five analogs in one call, reducing latency
- **Constraint visualization**: Show why a candidate failed the brief — which constraint, by how much
- **Saved sessions**: Persist across browser restarts without losing the design history
- **Agent memory**: Let the agent learn from earlier generations without reading the full log

### Medium term (2-6 months)
- **Retrosynthesis sketch**: Not full route-finding (out of scope), but a SMARTS-based check for known synthetic problems
- **SAR tables**: Automatically compare analogs to highlight which changes moved which properties
- **Target protein alignment**: Optional — if a user has a PDB, show where their molecule would dock (via external API, opt-in)
- **Multi-user boards**: Collaborate with lab partners on the same design project

### Long term (6+ months)
- **Active learning**: Agent proposes, you measure in the lab, agent learns from real data
- **Integrate published SAR**: Let the agent reference known structure-activity relationships for its rationales
- **Publish a dataset**: De-identified design sessions to help train future agents on human-agent collaboration

### The bigger vision
We want ANALOG to be the standard for **honest AI in chemistry** — a reference implementation showing that you can have an intelligent agent and human judgment *and* measured numbers *and* full transparency about which is which. Not "AI does chemistry" but "people and AI do chemistry together, and you can trust every number."

---

## Why WebMCP was essential

Without WebMCP:
- The agent would type "propose SMILES XYZ" as a message
- You'd paste it into a separate tool to check if it's valid
- You'd copy the properties back
- The agent would guess whether you liked it based on your wording

With WebMCP:
- Agent calls `propose_candidate` directly
- Tool validates, computes, scores the prediction, ranks it, checks the brief
- Agent sees structured feedback: "you guessed logP 2.5, actual 2.3, hit. You guessed solubility −0.1, actual 0.6, miss."
- Agent learns what works

That's not an incremental improvement. It's a different product.
