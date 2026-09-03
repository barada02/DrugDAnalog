# AI-Assisted Development Log

This document tracks where AI assistance was provided during feature development.

## TIER 1 Features: Synthesis & Bioavailability Metrics

### Features Added
1. **SAScore** (Synthetic Accessibility Score) - Predicts synthesis difficulty (0-10 scale)
2. **BBB Crossing** (Blood-Brain Barrier Probability) - Predicts neurological drug penetration
3. **HIA Score** (Human Intestinal Absorption) - Predicts oral bioavailability

### Implementation Details

**Date:** September 2026  
**Scope:** Modular addition of TIER 1 bioavailability and synthesis metrics

#### Commits (AI-assisted)

1. **Add SAScore and bioavailability calculators (BBB, HIA)**
   - File: `danlog_app/src/chem/sascore.ts`
   - File: `danlog_app/src/chem/bioavailability.ts`
   - Generated based on published literature:
     - SAScore: Ertl et al. (2009) on molecular complexity
     - BBB: Di et al. (2003) on blood-brain barrier penetration
     - HIA: Zhao et al. (2002) on intestinal absorption

2. **Integrate SAScore and bioavailability calculations into property computation**
   - File: `danlog_app/src/chem/properties.ts`
   - Extended Properties type with three new fields
   - Integrated async computation into computeProperties function

3. **Add SAScore, BBB, and HIA to measures display system**
   - File: `danlog_app/src/chem/measures.ts`
   - Added three new measures to the MEASURES array
   - Tied to UI display system so front-end mirrors back-end exactly

4. **Add bioavailability alerts and badge generation**
   - File: `danlog_app/src/chem/bioavailability-alerts.ts`
   - Generates contextual alerts based on scores
   - Includes badge generation for quick card identification

5. **Integrate bioavailability alerts into the UI**
   - File: `danlog_app/src/App.tsx`
   - Modified Alerts component to include structural + bioavailability alerts
   - Updated both FocusPanel and Board card displays

6. **Add SAScore and HIA badges to candidate cards**
   - File: `danlog_app/src/App.tsx`
   - Visual indicators for synthesis difficulty and oral absorption
   - Color-coded (ok/wait/bad) for quick scanning

### Design Decisions

**Modularity:** Each calculator (SAScore, BBB, HIA) is in a separate, imported module. Features can be toggled on/off by:
- Removing the import
- Removing the measure from MEASURES array
- Removing the alert generator call

**Empirical vs. ML:** Used evidence-based empirical rules rather than pre-trained models, keeping the app server-less and fully browser-based.

**Alert Strategy:** Separated "warnings" (synthesis difficulty, poor absorption) from "info" (low BBB crossing) because context matters—not all drugs need brain penetration.

**Confidence Tiers:** All three metrics labeled as "computed" (algorithm-based) in the measures system, honest about error margins.

### Technical Notes

- SAScore uses RDKit molecular complexity analysis (available in JS/WASM)
- BBB/HIA use empirical rule-based formulas (no external dependencies)
- All calculations are synchronous except SAScore (which calls RDKit async)
- Properties type-safe: TypeScript ensures new fields are always computed

### Future Expansion

These modules are designed to add more TIER 1 features without code restructuring:
- SAScore variants (Bertz complexity as alternative)
- Rotatable bonds (already exists, can be highlighted in alerts)
- BBB/HIA variants using different rule sets
- Additional bioavailability metrics (TPSA-based heuristics, etc.)

### Testing Notes

Tested with existing presets:
- Aspirin
- Ibuprofen  
- Paracetamol
- Caffeine

All calculations are deterministic and reproducible.

---

**AI Provider:** Claude 3.5 Haiku  
**Assistance Model:** Interactive development with user validation at each step  
**Code Quality:** Follows project conventions, modular design, well-documented
