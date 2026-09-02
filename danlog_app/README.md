# danlog_app — the Analog web app

This is the application. Project documentation lives one level up:

| | |
|---|---|
| [../README.md](../README.md) | What Analog is, how to run it, the tool surface |
| [../PLAN.md](../PLAN.md) | The build plan and the decisions behind it |
| [../docs/webmcp-notes.md](../docs/webmcp-notes.md) | WebMCP API reference and gotchas |

## Commands

```bash
npm install      # also runs sync:rdkit
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint
npm run preview  # serve the production build
```

`sync:rdkit` copies the RDKit WebAssembly build from `node_modules` into `public/`.
It runs automatically on install, dev and build. RDKit is served from a stable URL
rather than bundled: the emscripten glue plus a 6.9 MB `.wasm` fights every bundler,
and a fixed path lets the browser cache it.

## Layout

```
src/
  chem/
    rdkit.ts         RDKit loading + WASM heap lifetime wrappers
    properties.ts    Descriptors, canonical SMILES, SVG rendering
    substructure.ts  SMARTS pattern matching
    measures.ts      Confidence tiers -- drives the UI and the tool responses
    rules.ts         Lipinski, Veber, Egan, Pfizer 3/75
    solubility.ts    ESOL aqueous solubility
    groups.ts        Common functional groups as SMARTS patterns
  store/workbench.ts Board state, deliberately outside React
  mcp/
    tools.ts         The WebMCP tool surface
    webmcp.d.ts      Types for the draft API
  App.tsx            UI
```

## Before you change things

1. **RDKit is a module singleton, not React state.** A tool call can arrive when no
   component is mounted and it still has to work.
2. **Board state must stay outside React.** Tools reach it through
   `useWorkbench.getState()`. Move it into `useState` or Context and they cannot.
3. **RDKit objects are freed by hand.** They are C++ objects on the WASM heap with no
   garbage collector. `withMol` and `withQMol` own those lifetimes — but they free on
   callback *return*, so never give them an async callback. See the comment at the top
   of `matchPattern` in `substructure.ts` for what that breaks.
