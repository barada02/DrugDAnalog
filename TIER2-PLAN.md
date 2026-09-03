# TIER 2 Features: ADMET & Drug-Likeness Deep Dive

## 🎯 Philosophy
TIER 1 answers: "Can we make it?"  
TIER 2 answers: "Will the body accept it?"

---

## 📋 Proposed TIER 2 Features (Browser-based, No Backend)

### **Feature 1: Expanded Toxicity Alerts** ⚠️
**Status:** High Priority  
**Difficulty:** Low  
**Value:** High

What it does:
- Beyond Pfizer 3/75, add PAINS (Pan-Assay Interference Compounds)
- Add Brenk alerts (reactive groups that shouldn't be in drugs)
- Custom toxicity patterns (hERG channel blockers, genotoxins)

Where it shows:
- Alerts section (same as current)
- New severity levels: "toxicity risk", "genotoxin concern", etc.

Examples:
- Alert: "Contains Michael acceptor" (electrophile - may be toxic)
- Alert: "Nitro group detected" (mutagenic risk)
- Alert: "Aromatic amine" (carcinogenic metabolite risk)

**Business value:** Eliminate obviously dangerous molecules before synthesis

---

### **Feature 2: CYP450 Metabolism Prediction** 🧬
**Status:** High Priority  
**Difficulty:** Medium  
**Value:** High

What it does:
- Predicts WHERE in the molecule the liver will metabolize it
- Shows which atoms are "soft sites" for metabolism
- Warns if metabolism creates toxic metabolites

Where it shows:
- New card in properties panel: "Metabolism Profile"
- Shows % likelihood of CYP3A4, CYP2D6, CYP2C9 involvement
- Highlights metabolic soft sites on molecule structure

Example output:
```
CYP3A4 likely (75%) - oxidizes aromatic ring
CYP2D6 possible (40%) - oxidizes side chain

⚠️ Soft site: aromatic carbon at position 4
```

**Business value:** Prevents drug-drug interactions, predicts metabolism

---

### **Feature 3: Metabolic Stability Score** ⏱️
**Status:** High Priority  
**Difficulty:** Medium  
**Value:** High

What it does:
- Predicts drug half-life in liver microsomes
- Estimates whether drug will survive to reach target tissue
- 0-100 scale (0=destroyed immediately, 100=very stable)

Where it shows:
- Property grid: "Met. Stability" score
- Card badge: "Stable" or "⚠️ Unstable"
- Alert if score is too low

Example:
```
Metabolic Stability: 72% (good)
→ Likely survives 30+ minutes in liver
```

**Business value:** Fast-metabolized drugs need higher doses and more frequent administration

---

### **Feature 4: Combined Bioavailability Score** 🎯
**Status:** Medium Priority  
**Difficulty:** Low  
**Value:** High

What it does:
- Combines HIA (TIER 1) + metabolism + other factors
- Single "Oral Bioavailability" estimate (0-100%)
- Better than HIA alone because accounts for metabolism loss

Where it shows:
- Property grid: "Oral Bioavailability" or "F% estimate"
- Card badge with color coding
- Alert if too low

Example:
```
HIA Score: 85% (gut absorption)
Metabolism: 65% (survives metabolism)
→ Oral Bioavailability: ~55% (85% × 65%)
```

**Business value:** Real-world absorption is not just gut crossing—must also survive liver

---

### **Feature 5: Blood-Brain Barrier Efflux** 🧠
**Status:** Medium Priority  
**Difficulty:** Medium  
**Value:** Medium

What it does:
- Predicts if molecule will be PUMPED OUT of brain (P-gp efflux)
- Even if BBB crossing is high, efflux pumps can remove it
- Shows "net brain penetration" after accounting for efflux

Where it shows:
- BBB section enhanced: "BBB Crossing: 70%, P-gp Efflux: High"
- Alert: "High efflux—won't stay in brain despite crossing"
- Card badge: "BBB+ but pumped out" vs "BBB penetrant"

Example:
```
BBB Crossing: 75% (crosses membrane)
P-gp Efflux Risk: High (75% chance of efflux)
→ Net Brain Penetration: ~19% (75% × 25%)
⚠️ Alert: Crosses BBB but likely pumped out
```

**Business value:** Critical for neurological drugs—many molecules cross BBB but get expelled

---

### **Feature 6: ADME Summary Card** 📊
**Status:** Medium Priority  
**Difficulty:** Low  
**Value:** High

What it does:
- Single visual card summarizing all ADME properties
- Color-coded traffic light: Green/Yellow/Red for each phase
- Quick "is this molecule viable?" assessment

Where it shows:
- Right sidebar, new panel "ADME Profile"
- Shows: Absorption → Distribution → Metabolism → Excretion
- Each phase gets 0-100 score

Visual example:
```
┌─────────────────────────────┐
│ ADME PROFILE                │
├─────────────────────────────┤
│ 🟢 A (Absorption): 78%      │
│ 🟡 D (Distribution): 62%    │
│ 🟡 M (Metabolism): 65%      │
│ 🟢 E (Excretion): 71%       │
├─────────────────────────────┤
│ Overall Viability: 69%      │
│ Recommendation: Moderate    │
└─────────────────────────────┘
```

**Business value:** At-a-glance assessment—is this molecule worth pursuing?

---

### **Feature 7: Rotatable Bonds Analysis** (Enhancement) 🔄
**Status:** Low Priority  
**Difficulty:** Low  
**Value:** Medium

What it does:
- Already have rotatable bonds count
- Add interpretation: is it too flexible?
- Alert if flexibility hurts specificity

Example:
```
Rotatable Bonds: 8
→ Highly flexible molecule
⚠️ Alert: May have poor target specificity
```

---

## 🏗️ Architecture (Following TIER 1 Pattern)

```
src/chem/
├── toxicity-alerts.ts       (NEW - expanded alerts)
├── metabolism.ts            (NEW - CYP450 prediction)
├── adme-score.ts           (NEW - combined ADME)
├── bioavailability-enhanced.ts (NEW - efflux prediction)
├── adme-profile.ts         (NEW - summary card)
├── properties.ts           (MODIFIED - add new fields)
└── measures.ts             (MODIFIED - add new measures)

src/
└── App.tsx                 (MODIFIED - display new panels)
```

---

## 🎨 UX Changes

### Property Grid Expansion
```
Current (TIER 1):
  SAScore, BBB, HIA

New (TIER 2):
  SAScore, BBB, HIA
  ━━━━━━━━━━━━━━━
  CYP3A4 Likelihood, CYP2D6, CYP2C9
  Metabolic Stability
  P-gp Efflux Risk
  Oral Bioavailability
```

### New Alert Types
```
Toxicity Alerts (red):
  ❌ "Contains genotoxic pattern"
  ⚠️ "Potential hERG blocker"
  ⚠️ "Michael acceptor (electrophile)"

Metabolism Alerts (yellow):
  🔄 "Rapidly metabolized—poor exposure"
  🔄 "Soft sites for metabolism detected"

Viability Alerts (orange):
  ⚠️ "Poor metabolic stability—frequent dosing needed"
  ⚠️ "High efflux risk—won't stay in brain"
```

### New Card Badges
```
[SAScore: 4.2] [HIA: 89%] [Stable] [CYP2D6 substrate]
[toxicity risk] [BBB pumped out]
```

### New Panel: ADME Summary
- Right sidebar, below 3D viewer
- Traffic light scoring
- "Overall viability" recommendation

---

## 📊 Implementation Order

**Phase 1 (Week 1):** Core calculations
1. Toxicity alerts (PAINS/Brenk rules)
2. CYP450 prediction
3. Metabolic stability

**Phase 2 (Week 2):** Integration & UI
4. Property grid updates
5. ADME summary card
6. Enhanced badges

**Phase 3 (Week 3):** Polish
7. P-gp efflux prediction
8. Alerts fine-tuning
9. UX testing

---

## 💻 Technical Approach

**All browser-based:**
- No ML models (use empirical rules)
- No external APIs (no privacy concerns)
- Pattern-matching on SMILES
- RDKit descriptors

**Rules-based (published literature):**
- PAINS: Pan-Assay Interference Compounds (known patterns)
- Brenk: Reactive groups (published list)
- CYP450: Substrate patterns (known recognition patterns)
- Metabolism: Soft site prediction (rule sets)
- P-gp: Efflux predictors (MDR1 substrate patterns)

**Data sources:**
- Open literature (published rules)
- RDKit built-in descriptors
- No proprietary ML models needed

---

## ⚙️ Feature Specifications

### CYP450 Prediction Details
```
Input: SMILES
Output: 
  - CYP3A4 likelihood (0-100%)
  - CYP2D6 likelihood (0-100%)
  - CYP2C9 likelihood (0-100%)
  - Other CYP involvement
  - Metabolic soft sites (which atoms)
```

### Metabolic Stability Details
```
Input: 
  - Structural features
  - Hydrophobicity
  - Molecular weight
Output:
  - Stability score (0-100)
  - Expected half-life category
  - Metabolism rate (fast/moderate/slow)
```

### P-gp Efflux Details
```
Input: SMILES + BBB crossing probability
Output:
  - P-gp substrate likelihood
  - Efflux probability
  - Net brain penetration (after efflux)
```

---

## 🎯 Success Metrics

After TIER 2, users should be able to answer:

| Question | TIER 1 | TIER 2 |
|----------|--------|--------|
| Can we synthesize it? | ✅ Yes | ✅ Yes |
| Will gut absorb it? | ✅ Yes | ✅ Yes |
| Will it reach the brain? | ✅ Yes | ✅ Yes (+ efflux info) |
| Will the liver destroy it? | ❌ No | ✅ Yes |
| Is it safe/toxic? | Partial | ✅ Better |
| How long will it stay in body? | ❌ No | ✅ Yes |
| Is it a prodrug risk? | ❌ No | ✅ Partial |
| Will drug-drug interactions occur? | ❌ No | ✅ Yes (CYP prediction) |

---

## 📦 Deliverables

By end of TIER 2:
- ✅ 7 new calculators (toxicity, metabolism, stability, etc.)
- ✅ Enhanced property grid (12+ new properties)
- ✅ ADME summary card
- ✅ 20+ new alert types
- ✅ Updated badges system
- ✅ Full TypeScript, zero errors
- ✅ Build passes
- ✅ Documentation updated
- ✅ Commits every feature

---

## 🚀 Next Step: UX

After TIER 2 is built:
- **Redesign UI** for clarity
- **Better visualization** of ADME data
- **Interactive tooltips** explaining each metric
- **Color coding** consistent across app
- **Mobile responsive**
- **Export reports** with ADME profile

---

## ❓ Questions to Confirm

Before I start building, confirm:

1. **Should we do all 7 features, or start with top 3?**
   - I recommend: Toxicity Alerts + CYP450 + Metabolic Stability first
   
2. **How detailed should alerts be?**
   - Simple warnings? (Toxicity yes/no)
   - Or explanations? (Toxicity yes because: genotoxin pattern)
   
3. **ADME summary card—show all 4 phases or simplified?**
   - Full ADME breakdown?
   - Or just "Viability: Good/Moderate/Poor"?

4. **Priority—completeness or polish?**
   - Build all 7 features (might be rough UX)?
   - Or 3-4 features polished (better UX)?

---

**I recommend:** Build features 1-4 first (high value, medium effort), then polish UX.

What do you think? Ready to build? 🚀
