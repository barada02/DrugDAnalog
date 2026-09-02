> **Reference document — this is not Analog.**
>
> This is the write-up from *Gremlin*, a separate throwaway project built purely to
> learn the WebMCP browser API. It is kept because its API reference, both API
> styles, and especially its gotcha list are the most accurate WebMCP notes we have,
> and Analog is built on top of what it teaches.
>
> **Nothing here describes the app in this repo.** For that, see
> [../README.md](../README.md). For the build plan, see [../PLAN.md](../PLAN.md).
>
> Analog uses the imperative API only, and [PLAN.md](../PLAN.md) explains why.

---

# Gremlin — a WebMCP learning project

A deliberately obnoxious virtual pet, built twice, to learn the two halves of the
[WebMCP](https://github.com/webmachinelearning/webmcp) browser API.

WebMCP is a W3C Web Machine Learning CG draft that lets a web page hand AI agents
typed, callable tools instead of forcing them to screenshot the page and guess
where to click. The page declares *"here is what I can do and what arguments I
need"*, and the agent calls it like a function.

The gremlin decays in real time, insults you, and can die. That is on purpose —
see [Why a pet and not a todo app](#why-a-pet-and-not-a-todo-app).

---

## Requirements

| | |
|---|---|
| Chrome | 149+ (this project was verified on **151**) |
| Node | 18+ (verified on 25.6.1) — only used for the static server |
| Flag | `chrome://flags/#enable-webmcp-testing` → **Enabled** → **Relaunch** |

Two hard constraints that cause most "it doesn't work" cases:

- **WebMCP is `SecureContext`-only.** `http://localhost` counts as secure;
  `file://` does not. Opening the HTML directly by double-clicking will never work.
- **Relaunch is mandatory** after flipping the flag. A page reload is not enough.

### If the flag doesn't exist

Search `webmcp` in `chrome://flags` rather than navigating to the anchor directly —
Chrome silently shows the plain flags page when an anchor doesn't match, which is
indistinguishable from the flag being present.

No results means your build doesn't ship it. WebMCP is an **origin trial** feature
from Chrome 149, and origin-trial features are often not exposed as a flag on the
stable channel. Options: install **Chrome Canary or Dev** alongside stable (fastest),
or register for the origin trial and add the token as a `<meta>` tag.

Alternatively, **ChatGPT's in-app browser supports WebMCP out of the box** with no
flag at all.

---

## Run

```bash
node server.js
```

| Phase | URL |
|---|---|
| 1 — Imperative | http://localhost:8080/imperative/ |
| 2 — Declarative | http://localhost:8080/declarative/ |

`server.js` is a zero-dependency static server on port 8080. Its only job is
serving over `http://localhost` so the secure-context requirement is met.

If you see `EADDRINUSE`, a server is already running on 8080 — that's fine, it
serves the same directory and picks up file changes without a restart.

---

## Layout

```
shared/
  gremlin.js     Pure game logic. ZERO WebMCP awareness. Identical across phases.
  ui.js          Rendering + the traced() call-logging wrapper.
  style.css      Shared styling.
imperative/
  index.html     Display only.
  tools.js       PHASE 1 — registerTool() with hand-written JSON Schema.
declarative/
  index.html     PHASE 2 — tools are declared IN THE MARKUP.
  tools.js       Behaviour only. No registerTool() calls at all.
  forms.css      Form styling + agent-activity pseudo-classes.
server.js        Static server, no dependencies.
```

The split is the point. `shared/gremlin.js` is byte-for-byte identical between
phases and knows nothing about WebMCP. Both phases expose the **same six tools**.
Only the wiring layer changes, so diffing `imperative/tools.js` against
`declarative/tools.js` isolates the entire lesson.

---

## Phase 1 — Imperative API

Every tool is declared in JS with an explicit JSON Schema and an `execute()`.

```js
await document.modelContext.registerTool({
  name: 'feed_gremlin',
  description: 'Feed the gremlin. Lowers hunger. Different foods affect rage very '
             + 'differently — pizza calms it, kale enrages it. Fails if not hungry.',
  inputSchema: {
    type: 'object',
    properties: {
      food: { type: 'string', enum: ['pizza', 'sock', 'battery', 'kale'] },
    },
    required: ['food'],
  },
  execute: async ({ food }, { signal }) => gremlin.feed(food),
}, { signal: controller.signal });
```

The six tools each demonstrate something different:

| Tool | Teaches |
|---|---|
| `get_gremlin_status` | Read-only tool, `annotations.readOnlyHint` |
| `feed_gremlin` | Enum params + calls that legitimately fail |
| `play_with_gremlin` | A trade-off that forces multi-step planning |
| `apologize_to_gremlin` | Zero-argument mutating tool |
| `rename_gremlin` | Free-text string input |
| `revive_gremlin` | Recovery from a terminal state |

### Unregistering

`AbortController` is how you remove tools — abort the signal and they disappear.
Run `unregisterAll()` in DevTools to watch it happen.

Chrome 153 adds an `unregisterTool()` that spares in-flight executions. On 151
the signal is the way.

---

## Phase 2 — Declarative API

The tool definition *is* the HTML. The browser derives the JSON Schema from the
form structure.

```html
<form toolautosubmit
      toolname="feed_gremlin"
      tooldescription="Feed the gremlin. Lowers hunger...">
  <select name="food" required
          toolparamdescription="What to feed it. pizza is safest; kale is a war crime.">
    <option value="pizza">Pizza</option>
    <option value="kale">Kale</option>
  </select>
  <button type="submit">Feed</button>
</form>
```

That markup produces `{ food: { type: "string", enum: ["pizza", "kale"], description: "..." } }`
with `required: ["food"]`. No JSON Schema was written by hand.

| Attribute | Effect |
|---|---|
| `toolname` | Tool name |
| `tooldescription` | Tool description |
| `toolparamdescription` | That property's description (falls back to `<label>` / `aria-description`) |
| `toolautosubmit` | Agent may submit without a human clicking |
| `name` | Becomes the schema property name |
| `required` | Adds the field to `required[]` |
| `<option>` | Becomes an `enum` value |

### Handling submission

```js
form.addEventListener('submit', (event) => {
  event.preventDefault();
  // agentInvoked distinguishes an AI submission from a human button click
  if (event.agentInvoked) {
    event.respondWith(resultPromise);  // hands the result back to the model
  }
});
```

Lifecycle events fire on `window`, not the form: `toolactivated`, `toolcancel`.

CSS pseudo-classes light up during agent invocation: `:tool-form-active` on the
form, `:tool-submit-active` on the button.

---

## Imperative vs declarative

| | Imperative | Declarative |
|---|---|---|
| Tool defined in | JS `registerTool()` | HTML `toolname` attribute |
| Input schema | Hand-written JSON Schema | Derived from the form |
| Enums | `enum: [...]` | `<option>` elements |
| Required | `required: ['food']` | `required` attribute |
| Humans can use it | No — agent-only | **Yes — it's a real form** |
| Dynamic tool sets | Yes | No |
| Non-form interactions | Yes | No |

**The trade-off:** declarative removes schema duplication and gives you one code
path for humans and agents, so your UI and your tools cannot drift apart. But it
only covers what fits in a form. Dynamic registration, canvas/drag interactions,
and conditional tools need the imperative API. Real apps mix both — forms for
CRUD, `registerTool()` for everything else.

Omitting `toolautosubmit` gives you a free approval gate: the agent fills the
form, but a human must press the button. Useful for destructive actions.

---

## Testing

**Is the API even there?** In DevTools on the page:

```js
window.isSecureContext   // must be true — false means you're on file://
document.modelContext    // the actual test; undefined = flag off or unsupported
navigator.modelContext   // deprecated name — expect undefined
```

**Do the tools round-trip?** Don't trust the banner:

```js
const tools = await document.modelContext.getTools();
console.log(tools.map(t => t.name));   // expect the 6 names
```

**Does it work end to end?** Open the agent side panel and say
*"Check on the gremlin and keep it alive."* Every call, result, and failure
streams into the on-page log. In Phase 2 each entry is tagged `[human]` or
`[agent]` — click the forms yourself to confirm both paths hit identical code.

---

## Gotchas

Things that cost time, collected here so they don't have to again.

1. **It's `document.modelContext`, not `navigator.modelContext`.** The getter moved
   from Navigator to Document in the May 2026 draft; the old name is deprecated as
   of Chromium 150. Many tutorials still show the stale version.
2. **`provideContext()` / `clearContext()` no longer exist** — removed in the
   March 2026 revision. `registerTool()` / `unregisterTool()` are the only way to
   declare tools.
3. **`file://` will never work.** SecureContext-only.
4. **Flipping the flag requires a full relaunch**, not a reload.
5. **Forgetting `event.respondWith()`** in declarative mode means the agent sees
   the tool as having done nothing, even though your handler ran correctly.
6. **Write consequences into descriptions, not just actions.** `play_with_gremlin`
   says it makes the gremlin hungrier — and agents spontaneously chain a
   `feed_gremlin` call afterwards. That one clause does real work.

---

## Why a pet and not a todo app

A todo app can't teach the things that actually bite you in production:

- **State changes underneath the agent.** Hunger and boredom decay every 3s and the
  gremlin dies at 100 hunger or 100 rage. An agent that reads state once and acts on
  stale data will kill it. Re-reading is the single most important WebMCP habit.
- **Calls that legitimately fail.** Feeding a full gremlin makes it angrier and
  throws. Failures are thrown rather than returned as polite strings, because
  agents need to see real errors to correct course.
- **Trade-offs that force planning.** Playing cures boredom but causes hunger, so
  a single tool call can't reach a good state.

Observed on the first run: the agent called `get_gremlin_status`, saw boredom was
worst, called `play_with_gremlin`, then — unprompted — called `feed_gremlin` to
counteract the hunger the description warned about. Three calls, near-perfect
stats.

---

## Sources

- [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp) — spec source
- [Chrome WebMCP docs](https://developer.chrome.com/docs/ai/webmcp)
- [Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
