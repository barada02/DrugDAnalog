# ANALOG Demo Video Script (Under 3 minutes)

**Tone:** Enthusiastic, clear, let the demo breathe

---

## [OPENING - 0:00 to 0:15]

**[Show the app loading on Vercel link]**

"Hey! This is ANALOG — and it's something you've never seen before.

Here's the problem: **AI is amazing at chemistry, but it lies about how sure it is.** 

Ask an LLM for a molecular weight — it'll tell you. Ask it for a solubility prediction — it'll tell you with the same confidence. But one is math. The other is a guess with a log unit of error.

So we built a tool where **the AI proposes, RDKit measures, and YOU decide.** And WebMCP is what makes that possible."

---

## [THE SETUP - 0:15 to 0:45]

**[Click into Design page, show paracetamol loaded]**

"Let's start with paracetamol — a real drug we want to improve.

I'm going to set a design brief:
- Goal: Make it more soluble and easier to absorb
- Constraints: logP less than 5, solubility above -1 in log scale
- Keep the amide group — that's what makes it work

**[Type into the brief fields]**

Now here's the interesting part: I'm asking the AI agent to propose three analogs. But before it does any computation, I'm making it guess what logP and solubility will be."

---

## [THE AGENT PROPOSES - 0:45 to 1:50]

**[Type or paste into chat with agent]**

*"Propose three paracetamol analogs that are more soluble. For each one, predict logP and logS before computing."*

**[Wait for agent response, show it appears on the board]**

"Here come the candidates. Look at the first one:

**[Click on Candidate 01, show the card]**

The agent said: 
- 'logP 2.4' 
- 'logS -0.3'

Now watch what happens when we compute the actual values:

**[Show Properties tab]**

- Actual logP: **2.2** ← the agent was really close
- Actual logS: **0.1** ← it missed by a log unit, but it tried

**[Point to the prediction ledger on the right]**

This matters. We're now tracking: **was the agent right or wrong?** Most systems never show you this. Here, you see it every time.

**[Click on Candidate 02]**

This one? The agent predicted logP 1.8, but it's actually 3.1. Way off. So we reject it.

**[Click on Candidate 03, show it's marked as best-balance]**

This one the agent got better. It predicted logS -0.2, actual is 0.2. Close enough. It also preserves the amide we asked for, and it's easier to synthesize than the original."

---

## [YOU DECIDE - 1:50 to 2:15]

**[Show three acceptance buttons]**

"Here's the part no other AI tool does:

**I accept this one.** Not because the model told me to. Not because it's the best at everything. Because I looked at the evidence and I think it's worth making.

**[Click Accept on Candidate 03]**

The model doesn't get to decide. It proposes. I verify. I decide.

Now I'm going to do something even more powerful:

**[Click Make Focus Molecule]**

I'm promoting this candidate to be the starting point for the next round of design. That's a new generation. The AI will now design *from this molecule,* not the original.

This is iterative. It's a conversation, not a pipeline."

---

## [THE EVOLUTION - 2:15 to 2:35]

**[Click over to Evolution page]**

"Let's see what we've built:

**[Show the tree]**

This is a real design tree. Every circle is a molecule. The purple line is the path I promoted — those are the ones I decided to keep going with.

**[Point to the convergence chart]**

And here's progress: At the start, we met 1 of 4 constraints. Now we're at 3 of 4. The agent is learning what I care about.

The key: **you can see every decision that led here.** Not a black box. Not a recommendation I have to trust blindly."

---

## [THE REPORT - 2:35 to 2:55]

**[Click into Report page]**

"One more thing that changes everything:

I can ask the agent to draft a report summarizing what we built. It writes:

*'Candidate 03 balances improved solubility with synthetic accessibility. The ethyl substitution reduces logP while maintaining the essential amide.'*

But here's the deal — the agent writes the thinking. The app writes the numbers.

**[Show the report rendering]**

Every structure you see? RDKit drew it, running in your browser.

Every number — logS, logP, synthetic accessibility score? Computed locally, not guessed by the model.

The only things that left your machine: optional 3D coordinates from a public database, and an optional systematic name lookup. Both toggleable. Both from public NIH services.

So when you download this PDF or HTML file, **there are no hallucinated numbers in it.** The agent's judgment, your decision, and the chemistry — all separate. All visible."

---

## [CLOSING - 2:55 to 3:00]

**[Show the app one more time, maybe the Overview page showing all the stats]**

"This is ANALOG. 

**It's not AI that does chemistry for you.**

**It's AI that does chemistry *with you* — and you can trust every number.**

Try it at drug-d-analog.vercel.app"

**[End screen]**

---

## VISUAL CHECKLIST FOR RECORDING

✅ Load paracetamol (it's the default)  
✅ Fill in brief clearly (goal, constraints, preserve group)  
✅ Show agent response appearing as cards  
✅ Click into one card, show Properties tab with predicted vs actual  
✅ Point to the prediction ledger  
✅ Accept/reject candidates intentionally (narrate *why*)  
✅ Click "Make Focus Molecule" on the promoted one  
✅ Jump to Evolution page, show the tree  
✅ Point to convergence chart  
✅ Go to Report page, show agent wrote prose + app rendered numbers  
✅ End with a download or the Overview page showing everything together  

---

## TONE NOTES

- **"Here's the problem..."** → hook them immediately with the real problem
- **"But before it does any computation, I'm making it guess"** → this is the novel part, emphasize it
- **"This matters. We're now tracking..."** → make prediction ledger feel like a big deal (it is)
- **"The model doesn't get to decide"** → pivot to human control as the feature, not a limitation
- **"This is iterative. It's a conversation, not a pipeline"** → bigger vision in one sentence
- **"So when you download this PDF... there are no hallucinated numbers in it"** → close with the trust angle

---

## TIMING

If you're under 3 min, you can add:
- A quick show of the Explore page (filter by generation, ruleset)
- A quick Compare view (two molecules side by side)
- A mention of "you can even inspect the focus molecule the same way you inspect candidates"

If you're tight on time, cut:
- The detail about ethyl substitution (nice but not essential)
- A second rejected candidate (one example is enough)
