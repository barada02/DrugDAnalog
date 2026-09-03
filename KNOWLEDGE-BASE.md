# Analog — Knowledge Base

*A field guide for someone who does not have a chemistry background.*

Written September 2026. Covers: what this field is, what software already exists in it,
what we actually built, and — honestly — where it helps and where it does not.

---

## 0. The ten-minute version

**The field.** Drug discovery has a "design" phase where a chemist proposes a slightly
modified version of a molecule and asks: *is this new version likely to behave better?*
Software answers part of that question by calculating numbers from the molecule's structure.

**The problem we targeted.** Large language models are now being pointed at this task.
They are fluent at it and frequently wrong — they will state a molecular weight, a
greasiness value, and a solubility estimate in the same confident tone, when the first is
simple arithmetic and the last is a statistical guess with a huge error bar. A chemist
reading that output cannot tell which is which.

**What we built.** *Analog* — a browser page that computes the real numbers locally, hands
them to an AI agent through a set of tools, and then **grades the agent**: it makes the
agent commit to a predicted value *before* revealing the measured one, keeps a running
scorecard of how often it was right, refuses to answer questions nothing can honestly
answer, and blocks the agent from approving its own work.

**The honest verdict.** The chemistry in Analog is modest — free websites like SwissADME
have offered more of it, for free, since 2017. The genuinely novel part is the
**refereeing layer**: the confidence tiers, the prediction ledger, and the human approval
gate. Analog is less a chemistry tool that happens to use AI, and more **an AI-grounding
tool that happens to be about chemistry**. That framing matters for who you show it to.

---

# PART 1 — The field, in plain language

## 1.1 A molecule is a piece of text

Chemists write molecules as short strings called **SMILES** (Simplified Molecular Input
Line Entry System). Aspirin is:

```
CC(=O)Oc1ccccc1C(=O)O
```

Letters are atoms (`C` carbon, `O` oxygen, `N` nitrogen). Lowercase means the atom is part
of an aromatic ring — a flat, stable hexagon like the `c1ccccc1` above. Parentheses are
branches, `=` is a double bond, digits open and close rings.

The important consequence: **a molecule is a string, so software can parse it, and an LLM
can generate it.** That is exactly why this problem exists. An LLM can emit a perfectly
valid-looking SMILES that describes a molecule which could never exist, and can quote
properties for it that were never computed.

There is a second language, **SMARTS**, which is to SMILES what a regular expression is to
a string. It describes a *shape to look for* rather than one specific molecule.
`[CX3](=[OX1])[OX2H1]` means "a carboxylic acid group, anywhere in this molecule." Analog
uses SMARTS to let you pin a part of the molecule and say *nothing may remove this*.

## 1.2 The three kinds of "number" — this is the crux

Everything in this document rests on one distinction that outsiders (and language models)
routinely miss. Not all computed molecular properties are equally trustworthy.

| Kind | What it really is | Example | Trust |
|---|---|---|---|
| **Exact** | Counting or adding. There is one right answer. | Molecular weight (add up the atomic weights). Number of rings. Hydrogen-bond donors. | Total. It is arithmetic. |
| **Computed** | A published algorithm. Deterministic, well-characterised, but still a model of reality. | **cLogP** (greasiness, via the Crippen fragment method). **TPSA** (polar surface area). | High, with a known error — roughly ±0.5 for logP. |
| **Estimated** | A statistical regression fitted to lab measurements. | **ESOL** solubility. Most ADMET predictions. | Directional only. ESOL is about **±1 log unit** — a factor of ten. |

An LLM asked for all three will produce all three in the same sentence, in the same tone,
with the same number of decimal places. **That is the failure Analog exists to make
visible.** Every number in the app is tagged `exact` / `computed` / `estimated`, in the
user interface *and* in the data handed to the agent.

Beyond these three, there is a fourth category: **things that cannot be computed from
structure at all** — how strongly a molecule binds its target (potency), whether it is
toxic, its acidity (pKa), or how to synthesise it. These require a laboratory, a protein
structure, or a trained model that we do not ship. Analog maintains an explicit refusal
list for these rather than producing a plausible-looking number.

## 1.3 What "drug-likeness rules" actually are

You will see these everywhere. They are not laws — they are **linters for molecules**,
each a handful of if-statements over numbers you already have.

- **Lipinski's Rule of Five (1997)** — the famous one. Molecular weight under 500, logP
  under 5, ≤5 hydrogen-bond donors, ≤10 acceptors. Predicts whether a molecule can be
  swallowed as a pill.
- **Veber (2002)** — ≤10 rotatable bonds, TPSA ≤140. Arguably better at the same job.
- **Egan (2000)** — an ellipse in logP/TPSA space, for passive gut absorption.
- **Pfizer 3/75** — a *toxicity risk flag*, not an absorption rule: greasy **and**
  non-polar together correlates with in-vivo toxicity.

**How much to trust them:** only about **50% of orally administered new chemical entities
actually obey Lipinski's rule**, and roughly **51% of FDA-approved small-molecule drugs**
are both oral and rule-compliant. Natural-product-derived drugs — over a third of marketed
small molecules — routinely violate it. The literature is fairly blunt that the rule has
been overemphasised.

So their value is *not* the pass/fail verdict. Their value is that they **name the specific
clause that broke** ("MW 512 > 500"), which tells you what to fix. Analog reports them that
way deliberately, and never rolls them into a single score.

## 1.4 Who actually uses this software

Worth knowing, because these are different people with different needs:

- **Medicinal chemists** — design and make molecules. Usually not programmers. They live in
  drawing tools and spreadsheets, and care about *what to make next Monday*.
- **Computational chemists / cheminformaticians** — the modelling specialists. Python,
  RDKit, KNIME. They build the models the medicinal chemists consume.
- **Academic labs and graduate students** — enormous user base for the *free* tools,
  because commercial licences are out of reach. This is the group that keeps SwissADME's
  citation count in the thousands.
- **Biotech startups** — need results before they can afford an enterprise platform.
- **Increasingly: people with an LLM and no chemistry training** — the group most at risk
  from confidently wrong output, and arguably Analog's real audience.

## 1.5 Where design software fits: the DMTA cycle

Drug discovery runs on a loop called **DMTA — Design, Make, Test, Analyse**:

1. **Design** — propose new molecules (computational chemistry, modelling, and now AI).
2. **Make** — actually synthesise them in a lab. Weeks to months. Expensive.
3. **Test** — run biological assays to see if they work.
4. **Analyse** — study the results and decide what to design next.

**All software of the kind we are discussing lives in step 1, and only step 1.** Its job is
to make the *Make* step less wasteful — you get maybe one shot every few weeks, so the
value is in *not* synthesising the obviously doomed ideas. A tool that stops a chemist
wasting three weeks on a molecule that could never be absorbed has paid for itself; it has
not discovered a drug.

---

# PART 2 — What already exists

This matters because it sets the bar. Almost every individual calculation Analog performs
is available elsewhere, free, today.

## 2.1 Tier 1 — Free web calculators (the direct comparison)

These are single-page websites: paste a SMILES, get a report. No login, no install.

| Tool | Who | What it gives you |
|---|---|---|
| **SwissADME** | Swiss Institute of Bioinformatics | The benchmark. Physicochemical properties, pharmacokinetics, drug-likeness, synthetic accessibility, plus its own visual devices (BOILED-Egg, Bioavailability Radar, iLOGP). Free, no login. Thousands of citations. |
| **pkCSM** | Pires et al. | ADMET prediction using graph-based structural signatures — absorption, distribution, metabolism, excretion, toxicity. |
| **ADMETlab (2.0/3.0)** | — | Large integrated ADMET platform built on curated experimental data and QSAR models. Broader than SwissADME on the ADMET side. |
| **Molinspiration** | Bratislava spin-off, since 1986 | Classic property calculator and bioactivity scoring. |
| **OSIRIS Property Explorer** | openmolecules.org | Draw a molecule, get properties plus toxicity risk flags. Around since 1999. |
| **ProTox** | — | Toxicity endpoint prediction. |
| **SwissTargetPrediction** | SIB | Guesses which protein a molecule might act on, by similarity to known ligands. |

**Blunt comparison:** SwissADME computes a superset of Analog's chemistry, has done since
2017, is peer-reviewed and heavily cited, and is free. **Analog does not compete with it on
chemistry and should never claim to.** What SwissADME does not have is an agent interface,
a prediction ledger, or any concept of refereeing a language model.

## 2.2 Tier 2 — The databases

Not calculators — repositories of what is already known.

- **PubChem** (NIH) — the giant public chemical database. Also the fallback 3D-coordinate
  source Analog uses.
- **ChEMBL** (EMBL-EBI) — curated bioactivity data extracted from the literature. This is
  where real potency numbers live. Also exposes cheminformatic utility web services.
- **DrugBank** — approved drugs, with clinical and pharmacological annotation.
- **ZINC** — commercially purchasable compounds, for virtual screening.
- **NCI CACTUS** — structure conversion services; Analog's primary 3D-coordinate source.

**Note what this implies:** if a question is about a molecule someone has already made and
measured, the right answer is *look it up*, not *compute it*. Analog computes, so it is
aimed at molecules that do not exist yet.

## 2.3 Tier 3 — Open-source libraries and browser components

The building blocks. Analog is assembled almost entirely from this tier.

- **RDKit** — the dominant open-source cheminformatics toolkit (C++ with Python bindings).
  Parses structures, canonicalises them, validates chemistry, computes descriptors,
  generates fingerprints, draws molecules. It is the industry's shared foundation.
- **RDKit.js** — the official JavaScript/WebAssembly build of RDKit. **This is what makes
  Analog possible**: real cheminformatics running entirely in a browser tab, with no server.
  Analog ships the 6.9 MB WASM binary and loads it on page open.
- **Open Babel** — the other big open-source toolkit; strong on file-format conversion.
- **Ketcher** (EPAM, Apache-2.0) — the most widely used browser-based structure *editor*.
  Draw a molecule with a mouse. Analog does not have one; you type SMILES.
- **JSME / JME** — older, very widely embedded Java/JS molecule editor.
- **MolView** — open-source browser structure viewer and editor.
- **3Dmol.js** — browser 3D molecular viewer. Analog uses it for the optional 3D panel.
- **DataWarrior** — free desktop tool for analysing chemical datasets. Very popular in
  academia; effectively "Excel for molecules."
- **KNIME** — visual workflow builder with strong cheminformatics nodes. The standard way
  non-programmers build reproducible chemistry pipelines.

## 2.4 Tier 4 — Commercial platforms (the real professional tools)

Enterprise, quote-based pricing, generally far out of reach for individuals.

- **Schrödinger** — the heavyweight. *Maestro* (modelling interface), *Glide* (docking),
  *FEP+* (free-energy calculations for real binding-affinity prediction), and
  **LiveDesign**, a collaborative design platform where teams propose, track, and analyse
  compounds together.
- **Optibrium StarDrop** — specialises in **multi-parameter optimisation**: balancing many
  competing properties at once, which is the actual hard problem in lead optimisation.
  Modular — ADMET, generative chemistry, 3D design. Positions itself as the LiveDesign
  alternative.
- **Dotmatics** — very large R&D data platform; connects instruments, assays, and
  chemistry registration across an organisation.
- **Cresset Flare** — structure-based design, electrostatics, free-energy work.
- **ChemAxon** — chemical database, registration, and search infrastructure.
- **CDD Vault** — hosted data management for smaller biotechs and academic groups.
- **BioSolveIT** — docking and fragment-based design.

**What all of these have that Analog does not:** real experimental data integration
(assay results, SAR tables), docking against protein structures, multi-user collaboration,
compound registration, audit trails, and validated ADMET models.

**What Analog has that most of them do not (yet):** a native interface for an AI agent to
*use the tool as a tool*, and a mechanism that scores the agent's honesty.

## 2.5 Tier 5 — The AI/agent layer

This is the frontier, and where Analog actually sits.

- **ChemCrow** (Nature Machine Intelligence, 2024) — the landmark. Wired GPT-4 to 18
  expert-designed chemistry tools spanning synthesis, drug discovery, and materials, and
  validated it with autonomous lab experiments. It established the pattern: **the LLM does
  not calculate, it calls a tool that calculates.**
- **Molecular LLM agent research (2026)** — the current literature converges on exactly the
  design principle Analog implements: *the model is constrained so that it cannot fabricate
  molecular property values, but must request them from validated computational sources,
  mitigating hallucination on quantitative predictions.*
- **RDKit MCP servers** — several exist. MCP (Model Context Protocol) lets an AI assistant
  call external tools; wrapping RDKit in an MCP server is the obvious, and already-taken,
  move.
- **AI-assisted structure editors** — a newer category layering AI analysis on top of
  Ketcher + RDKit.

**This is the honest competitive picture:** the *idea* of grounding an LLM in RDKit is not
novel and is actively published. Analog's distinct contributions are narrower and more
specific — see §3.3.

## 2.6 The mechanism Analog bets on: WebMCP

Analog does not run a server. It uses **WebMCP**, a proposed browser standard that lets a
*web page* expose tools directly to an AI agent operating in the browser — the page
registers tools on `document.modelContext`, and the agent can call them.

Status as of September 2026, and you should treat this as the project's single largest
external risk:

- Announced February 2026; **public origin trial in Chrome 149 through Chrome 156**.
- The API moved from `navigator.modelContext` to `document.modelContext` (tools belong to a
  page, not the browser). `navigator.modelContext` was **deprecated in Chrome 150**.
  Analog's code already targets the current form.
- **Chrome is effectively the only browser with a working implementation.** Edge is behind
  a flag; Microsoft co-authors the spec. Firefox and Safari are engaged in the process but
  have committed to nothing.
- It is a **Draft Community Group Report** of the W3C Web Machine Learning Community Group
  — **not yet on the W3C standards track**.

Translation: today, Analog works for people running a recent Chrome with an origin trial or
a flag enabled. That is a small audience, and it may or may not grow.

---

# PART 3 — What we built

## 3.1 One sentence

**Analog is a browser workbench where a human sets the objective, an AI agent proposes
modified molecules through a tool interface, and the page computes the real chemistry
locally and grades the agent against it.**

## 3.2 The pieces, in non-chemist terms

- **Focus molecule** — the starting structure. Type a SMILES or click a preset (aspirin,
  ibuprofen, paracetamol, caffeine).
- **Preserve / scaffold pin** — you nominate a part of the molecule that **must survive
  every proposal**. Every candidate is checked against it, and the agent is told plainly
  when it broke the promise. When you change the pin, the whole board is re-checked
  retroactively.
- **Target profile (constraints)** — *your* stated objective ("MW under 500, logP between
  0 and 3"), scored honestly. Deliberately **not** a published drug-likeness score;
  inventing our own composite score would be the same false authority we are trying to
  avoid.
- **Design board** — every proposed molecule as a card: picture, the numbers, which rules
  broke, which functional groups it contains, which structural alerts it trips.
- **Prediction ledger** — the core idea. The agent must state its *predicted* MW, logP and
  TPSA **before** the tool computes them. The tool returns the error on each, keeps a
  running hit rate, and detects **systematic bias** — if the agent consistently
  underestimates logP, it is told so and told to correct for it.
- **Approval gate** — agents can only create `pending` candidates. Only a human click
  promotes one to `accepted`. The tool that changes the focus molecule **refuses** a
  pending candidate, with an explanation telling the agent to stop retrying.
- **Design path** — proposals hang off the candidate they were derived from, so the board
  is really a tree and the route that got you somewhere is visible.
- **Board diversity** — one number answering "are these eight ideas, or one idea rewritten
  eight times?" (Agents are bad at this, and a number settles it.)
- **3D structure (optional)** — the one feature that touches the network. RDKit's browser
  build cannot generate 3D coordinates, so they are fetched from NCI CACTUS or PubChem.
  This requires a human click every time, the warning is shown *before* the click, and
  **no agent tool can trigger it.** From the coordinates the app computes real shape
  descriptors — is the molecule rod-like, disc-like, or spherical.
- **Export** — CSV and SMILES files, so work can leave the app.

## 3.3 What is actually distinctive

Strip away the chemistry and four things remain that are genuinely uncommon:

1. **Confidence tiers as a single source of truth.** One list drives the property grid, the
   legend, *and* the JSON returned to the agent — so the screen and the agent can never
   disagree about how far to trust a number. The agent is explicitly instructed: *"An
   `estimated` value must be quoted with its error. Never present an estimate as a
   measurement."*
2. **An explicit refusal list.** Ask about potency, binding, toxicity, pKa, or synthesis and
   the tool returns *why it will not answer* rather than a number. Most tools ship a TODO
   here; this ships a "no."
3. **Predict-then-measure scoring, kept as a running record.** The agent's accuracy is
   measured as a **side effect of doing the real work**, not by a separate benchmark. That
   makes it evidence rather than opinion, and it is fed back to the agent as a correction.
4. **Authority is structural, not prompted.** The agent cannot approve its own candidate
   because there is no code path that lets it — not because the prompt asked nicely. It
   cannot send your molecule over the network for the same reason.

The catalogues are also written with unusual restraint: the structural-alert list is
deliberately small and verified, and says so in its own source — the published PAINS/Brenk
catalogues run to hundreds of patterns, and claiming to be them would be exactly the false
authority the app exists to avoid.

---

# PART 4 — Where it helps

Concrete, defensible situations.

**1. Catching a language model being confidently wrong about chemistry.**
This is the strongest case. Ask any LLM for aspirin's logP and it will answer instantly and
plausibly. Analog makes it commit to that number first, then shows the measured value and
the error, and keeps score. After ten proposals you have *evidence* about whether to trust
it — which is far more useful than a vibe.

**2. Fast, cheap early triage before real tools.**
Idea generation is where volume is highest and cost of being wrong is lowest. Analog can
tell you in seconds that a proposed molecule is far too greasy, has lost the group you
needed, contains a reactive group no chemist would accept, or is a duplicate of something
already on the board. That is worth doing *before* you open a licensed platform.

**3. Teaching.**
For students, the exact/computed/estimated distinction is the single most important idea in
the subject and is usually taught badly. Analog makes it a visible property of every number
on screen. The prediction ledger also makes an excellent demonstration of *why you should
not trust a chatbot's chemistry.*

**4. Privacy-sensitive early work.**
Everything except the optional 3D fetch runs in your browser. No structure is uploaded, no
account exists, no server logs your molecules. For unpublished structures this is a real
advantage over any web service, including SwissADME — and it is a genuine, checkable claim
because there is no backend at all.

**5. As a reference implementation of agent tooling done responsibly.**
Honestly, this may be the most valuable use. The patterns — capability tiers, structural
approval gates, an explicit "cannot compute" list, scoring the model's claims against
ground truth, keeping dangerous operations off the tool surface entirely — generalise well
beyond chemistry, to finance, medicine, law, engineering. **This is worth showing to
AI-tooling people, not only chemistry people.**

**6. A working demonstration of WebMCP.**
Very few substantial WebMCP applications exist. This is one, and it uses the current
`document.modelContext` form of the API.

---

# PART 5 — Where it does NOT help

Read this section twice. Overclaiming here is how tools in this space lose credibility.

**1. It cannot tell you whether a molecule will work.**
Potency, binding affinity, efficacy — the actual question in drug discovery — are
**not computable from structure alone**. They are measured in an assay, or estimated with a
protein structure and a force field, neither of which ships here. The app refuses to guess,
which is correct, but it means the central question is out of scope.

**2. It cannot predict toxicity or safety.**
Pfizer 3/75 flags a known *risk pattern*. The structural alerts are a small, hand-verified
list of well-established liabilities. A clean result means **"nothing matched these
patterns"**, not "this molecule is safe." Free tools like ProTox and ADMETlab go
considerably further here, and even they are not decisive.

**3. It is not a substitute for SwissADME or any professional platform.**
SwissADME computes more, is peer-reviewed, and is free. Schrödinger and StarDrop do
docking, free-energy calculations, real ADMET models, and multi-parameter optimisation.
Analog does none of that. Its ~4,000 lines of chemistry are a small, careful slice.

**4. There is no experimental data anywhere in it.**
No assay results, no SAR tables, no literature, no known-compound lookup. It cannot tell
you that your molecule is a known drug, or that a similar compound already failed in
Phase II. Real design work is dominated by that context.

**5. Solubility is a direction, not a value.**
The ESOL estimate carries about **±1 log unit** — a factor of ten. Two candidates within
one log unit of each other are **not** meaningfully different, and the tool says so. Do not
rank compounds on it.

**6. One conformer is not "the shape."**
The 3D shape descriptors are computed exactly — but from *one* three-dimensional
arrangement out of the many a flexible molecule can adopt, produced by an external service.
The maths is exact; the input is a sample. Never compare two molecules on shape alone.

**7. It is single-user, single-session, and unregulated.**
No accounts, no sharing, no team review, no compound registration, no audit trail. Session
state lives in one browser's local storage. It is unsuitable for any regulated or
GLP-style workflow.

**8. Undefined stereochemistry is a real, silent trap.**
A SMILES can leave "handedness" unspecified, in which case the string describes 2ⁿ
different compounds rather than one — and they can have completely different biology
(thalidomide is the notorious case). Analog *detects and warns about this*, which most
tools do not, but it cannot resolve it. Only you can say which isomer you meant.

**9. The audience is currently tiny.**
WebMCP is a Chrome origin trial on a community-group draft. Without a WebMCP-capable
browser, the entire agent half of the app does not exist and you are left with a modest
manual calculator.

**10. There are no automated tests.**
For an application whose entire pitch is *trust these numbers*, there is currently no
regression suite proving the chemistry stays correct. The source comments state the
patterns were verified by hand against known molecules — that happened once and left no
trace. **This is the most important gap to close**, and it is an afternoon's work.

---

# PART 6 — Risks worth being honest about

| Risk | Severity | Note |
|---|---|---|
| WebMCP never ships broadly | **High** | Chrome-only origin trial, community-group draft, no Safari/Firefox commitment. If it stalls, the core interaction model has no delivery vehicle. |
| The same value is achievable with a plain MCP server | **High** | A Python RDKit MCP server works in any assistant today, with no browser constraint. The browser buys privacy and zero-install; it costs reach. Be ready to explain why the browser is the right choice. |
| "It's just SwissADME with extra steps" | **Medium** | True if pitched as a chemistry tool. Not true if pitched as an agent-refereeing tool. **The framing decides whether this objection lands.** |
| No tests | **Medium** | Fixable this week. Until then, "trust these numbers" is a claim rather than a check. |
| A chemist takes the output too seriously | **Medium** | Mitigated better than most tools, via tiers and refusals — but the risk never fully goes away. |
| Cannot answer the question people actually care about | **Structural** | Potency is the real question and it is out of reach in a browser. Position the tool as *triage before the real work*, never as the work. |

---

# PART 7 — How to describe it honestly

**Do say:**
> "A browser workbench that lets an AI agent design molecule analogs while the page
> computes the real chemistry locally and keeps score of how often the agent's stated
> predictions survive contact with the measurement. Its point is calibration and
> restraint, not coverage."

**Do not say:**
> "AI-powered drug discovery platform."

The first is defensible to a chemist and interesting to an AI engineer. The second gets
dismissed by both.

**The best single demo:** ask the agent to propose three more-soluble aspirin analogs and
to state its predicted logP *before computing*. Then show the ledger. The gap between what
the model claimed and what RDKit measured is the whole product in one screen.

---

# PART 8 — Glossary

- **ADMET** — Absorption, Distribution, Metabolism, Excretion, Toxicity. What the body does
  to a drug. The main thing that kills drug candidates.
- **Analog** — a molecule that is a small modification of another. Also this app's name.
- **Assay** — a laboratory test measuring what a molecule actually does.
- **Bioisostere** — a chemical group swappable for another with similar behaviour but
  better properties. The classic move in lead optimisation. Analog suggests these; it
  cannot apply them, so the agent writes the new SMILES and the app checks it.
- **Canonical SMILES** — the one standard spelling of a molecule. Two different-looking
  SMILES for the same molecule canonicalise identically; this is what makes duplicate
  detection possible.
- **Conformer** — one specific 3D arrangement of a flexible molecule. There are many.
- **Descriptor** — any number computed from a structure.
- **DMTA** — Design, Make, Test, Analyse. The iterative loop of drug discovery.
- **Fingerprint** — a molecule compressed to a bit pattern, so two molecules can be compared
  numerically. Analog uses Morgan/ECFP fingerprints.
- **Fsp3** — fraction of carbons that are three-dimensional rather than flat. Higher is
  generally associated with better properties.
- **HBD / HBA** — hydrogen-bond donors / acceptors. Counts. Drive solubility and membrane
  crossing.
- **Lead optimisation** — the phase where a promising molecule is refined into a drug
  candidate. Where analog design lives.
- **logP** — greasiness (oil/water partitioning). Too low and it will not cross membranes;
  too high and it is insoluble and often toxic.
- **logS** — solubility in water, log scale. Estimated here, with ±1 log unit of error.
- **MCP (Model Context Protocol)** — the standard for letting AI assistants call external
  tools.
- **PAINS** — Pan-Assay Interference Compounds. Structures that appear to hit everything in
  a screen but are artefacts. Analog ships a small verified alert set, *not* the full PAINS
  catalogue, and says so.
- **QED** — a popular single-number "drug-likeness" score. Deliberately **not** implemented
  here, because it depends on catalogues the app does not ship and a fabricated score would
  be exactly the false authority the app avoids.
- **RDKit** — the dominant open-source cheminformatics toolkit. The engine underneath all
  of this.
- **Scaffold** — the core structural skeleton of a molecule; the part you keep while varying
  the rest.
- **SMARTS** — a pattern language for describing substructures. Regular expressions for
  molecules.
- **SMILES** — the text representation of a molecule.
- **Stereocentre** — an atom whose 3D "handedness" matters. Leave n of them undefined and
  the string describes 2ⁿ compounds, which can behave completely differently.
- **Tanimoto similarity** — 0 to 1, how alike two fingerprints are. Above ~0.85 is
  near-identical; below ~0.35 is a different chemotype.
- **TPSA** — Topological Polar Surface Area. Predicts gut absorption and blood-brain
  barrier crossing.
- **WASM (WebAssembly)** — lets compiled C++ (like RDKit) run in a browser at near-native
  speed. The reason this app can exist without a server.
- **WebMCP** — the proposed browser standard letting a web page expose tools to an AI agent.

---

# Sources

Landscape and background, retrieved September 2026:

- [SwissADME: a free web tool to evaluate pharmacokinetics, drug-likeness and medicinal chemistry friendliness of small molecules — *Scientific Reports*](https://www.nature.com/articles/srep42717)
- [SwissADME (PMC full text)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5335600/)
- [pkCSM: Predicting Small-Molecule Pharmacokinetic and Toxicity Properties Using Graph-Based Signatures](https://scispace.com/papers/pkcsm-predicting-small-molecule-pharmacokinetic-and-toxicity-2czy0d4m61)
- [ADMETlab 2.0: an integrated online platform for accurate and comprehensive predictions of ADMET properties](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8262709/)
- [SwissTargetPrediction: a web server for target prediction of bioactive small molecules](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4086140/)
- [OSIRIS Property Explorer](https://openmolecules.org/propertyexplorer/)
- [Molinspiration Cheminformatics](https://www.molinspiration.com/products.html)
- [ChEMBL Cheminformatic Utils web services](https://chembl.gitbook.io/chembl-interface-documentation/web-services/cheminformatic-utils-web-services)
- [rdkit-js — official JavaScript/WASM distribution of RDKit](https://github.com/rdkit/rdkit-js)
- [RDKit.js examples](https://www.rdkitjs.com/)
- [JME / JSME Molecule Editor](https://en.wikipedia.org/wiki/JME_Molecule_Editor)
- [LiveDesign — Schrödinger Life Science](https://www.schrodinger.com/platform/products/livedesign/)
- [Medicinal Chemistry use cases — Schrödinger](https://www.schrodinger.com/life-science/use-cases/medicinal-chemistry/)
- [StarDrop vs LiveDesign — Optibrium knowledge base](https://optibrium.com/knowledge-base/how-does-stardrop-compare-to-livedesign/)
- [Augmenting large language models with chemistry tools (ChemCrow) — *Nature Machine Intelligence*](https://www.nature.com/articles/s42256-024-00832-8)
- [Molecular LLM Agents: From Architectural Design to Scientific Autonomy (arXiv, 2026)](https://arxiv.org/html/2608.23104)
- [Beyond SMILES: Evaluating Agentic Systems for Drug Discovery (arXiv, 2026)](https://arxiv.org/pdf/2602.10163)
- [WebMCP Standard Proposal for Agentic Web Actuation Now Available in Chrome (Origin Trials) — InfoQ, June 2026](https://www.infoq.com/news/2026/06/webmcp-web-agent-standard-chrome/)
- [The State of WebMCP: July 2026 — Spronta](https://www.spronta.com/blog/state-of-webmcp-july-2026/)
- [WebMCP in 2026: Which Browsers Support navigator.modelContext?](https://dev.to/ai-agent-economy/webmcp-in-2026-which-browsers-support-navigatormodelcontext-complete-compatibility-status-1oe4)
- [Lipinski's rule of five — Wikipedia (compliance statistics and criticism)](https://en.wikipedia.org/wiki/Lipinski%27s_rule_of_five)
- [Drug discovery beyond the 'rule-of-five' — *Current Opinion in Biotechnology*](https://www.sciencedirect.com/science/article/abs/pii/S0958166907001279)
- [The Strategies and Politics of Successful Design, Make, Test, and Analyze (DMTA) Cycles in Lead Generation — Wiley](https://onlinelibrary.wiley.com/doi/10.1002/9783527677047.ch17)
- [DMTA lead optimization: where science meets project management — ChemAxon](https://chemaxon.com/blog/presentation/dmta-lead-optimization-where-science-meets-project-management)
