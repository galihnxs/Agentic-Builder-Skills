# Skill: Component Evaluation

**Role:** Evaluator (Critic)
**Phase:** Quality Control
**Autonomy Level:** Low
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Component Evaluation is the practice of isolating and testing a single agent or pipeline step in a controlled sandbox before testing the full end-to-end system. Instead of running the complete 6-step pipeline to check if the Researcher's web search is returning relevant results, you extract just the Researcher component, feed it 20 fixed test queries, and measure its output quality in isolation. This provides a clean, fast, low-noise signal that end-to-end testing cannot give you.

The core principle: improvements in one component can be masked by the randomness of other components in a full pipeline run. A Researcher that improved from 60% to 85% relevant results looks identical from the outside if the downstream Creator agent's quality is the bottleneck. Component evals decouple these signals so you can optimise each piece independently.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Error analysis on failed pipeline runs consistently shows that 1–2 components cause 70–80% of all failures. Component evals let you find and fix those bottlenecks without guessing.
- **Cost implication:** Running a single component eval (20 test cases × 1 LLM call) costs ~$0.10–0.50. Running the full pipeline for the same 20 cases costs 5–10× more. Iterate on components cheaply, validate end-to-end expensively.
- **Latency implication:** Component evals run in seconds. Full pipeline evals run in minutes. Faster feedback loops = faster iteration.
- **When to skip this:** When the component is genuinely trivial (a single regex, a static lookup). Component evals are for components that contain LLM calls or non-deterministic logic.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A fixed test set of 20+ input examples for the component under test
- Ground truth expected outputs (for objective evals) OR a grading rubric (for subjective evals)
- The component isolated from the rest of the pipeline — it must be callable with a fixed input without running upstream or downstream steps

**Workflow:**

1. **Identify the bottleneck component** — Use error analysis on failed pipeline runs to find which component is causing the most failures. Start there, not with random components.
2. **Extract the component** — Isolate it: a function, an agent call, a tool invocation. It must be callable independently with a fixed input.
3. **Build the test set** — Collect 20 real examples from your domain. Include: typical cases, edge cases, and known failure cases from production. Do not use synthetic examples.
4. **Choose the eval type:**
   - **Objective (code-based):** Compare output to ground truth. SQL correctness, JSON schema match, word count, exact field match. 100% accurate.
   - **Subjective (LLM-as-Judge):** Use the [`llm-as-judge`](./llm-as-judge.md) skill with a rubric. ~85–95% accurate.
5. **Run and score** — Execute all 20 test cases. Record pass/fail per case.
6. **Tune the component** — Adjust the system prompt, model, or tool parameters. Re-run the test set.
7. **Gate with E2E eval** — After component improvements, run the full end-to-end pipeline on a separate test set to confirm the component improvement translates to system improvement.

**Failure modes to watch:**
- `TestSetLeakage` — Caused by: using the same examples to both tune the component and evaluate it. Fix: hold out 30% of examples as a test set. Tune only on the training 70%.
- `NarrowTestSet` — Caused by: only testing happy-path inputs. Fix: include edge cases and known failure modes in every test set.
- `LocalOptimum` — Caused by: improving the component eval score without improving the full pipeline. Fix: always follow component tuning with an end-to-end eval run.
- `MetricGaming` — Caused by: optimising specifically for the test set rather than the underlying capability. Fix: refresh the test set quarterly with new real-world examples.

**Integration touchpoints:**
- Triggered by: error analysis on [`evaluation-matrix`](./evaluation-matrix.md) bottleneck identification
- Uses: [`llm-as-judge`](./llm-as-judge.md) for subjective component grading
- Validates: every individual skill in this repository before it is marked production-ready
- Feeds back into: [`eval-driven-development`](../product-manager/eval-driven-development.md) iteration cycle

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable at the eval infrastructure level. Individual component calls have their own context constraints.
- **Cost ceiling:** 20 test cases × component LLM call cost. For GPT-4o components: ~$0.20–0.50 per eval run. Run evals on every meaningful code change, not on every commit.
- **Model requirement:** The component under test uses whatever model it uses in production. Do not swap models for testing — you are testing the production configuration.
- **Non-determinism:** Run each test case 3 times and average the pass rate. Single-run scores on non-deterministic components are noisy.
- **Human gate required:** Yes — for interpreting borderline eval results and deciding whether a component score change is meaningful or noise.

---

## 📦 Ready-to-Use Artifact: Component Eval Test Harness

### Option A · Component Eval Rubric Template (Skill Layer)

```markdown
## Component Under Test
- Component name: {{COMPONENT_NAME}}
- Component role: {{COMPONENT_ROLE}}
- Model/tool: {{MODEL_OR_TOOL}}
- Last updated: {{DATE}}

## What This Component Must Do
{{ONE_SENTENCE_RESPONSIBILITY}}

## Test Set (20 cases minimum)
Format: Input → Expected Output (for objective) OR Input → Grading Rubric (for subjective)

Case 1:
  Input: {{INPUT}}
  Expected: {{EXPECTED_OUTPUT}}
  Eval type: objective | subjective
  Notes: {{EDGE_CASE_NOTES}}

[...repeat for all 20+ cases]

## Scoring
- Objective cases: exact match or schema validation (pass/fail, 100% accurate)
- Subjective cases: LLM-as-Judge with rubric (pass/fail/borderline, ~85-95% accurate)

## Pass Threshold
- Minimum pass rate to consider component production-ready: 85%
- Minimum pass rate after any code change to merge without human review: 90%

## Known Failure Modes
{{LIST_OF_KNOWN_EDGE_CASES_THIS_COMPONENT_STRUGGLES_WITH}}
```

---

### Option B · Component Eval Results Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ComponentEvalRun",
  "type": "object",
  "required": ["component_name", "run_date", "model", "test_cases", "summary"],
  "properties": {
    "component_name": { "type": "string" },
    "run_date": { "type": "string", "format": "date" },
    "model": { "type": "string", "description": "Model used for this component in production" },
    "test_cases": {
      "type": "array",
      "minItems": 20,
      "items": {
        "type": "object",
        "required": ["case_id", "input", "output", "label", "eval_type"],
        "properties": {
          "case_id": { "type": "string" },
          "input": { "type": "string" },
          "output": { "type": "string" },
          "expected": { "type": ["string", "null"] },
          "label": { "type": "string", "enum": ["pass", "fail", "borderline"] },
          "eval_type": { "type": "string", "enum": ["objective", "subjective"] },
          "justification": { "type": "string" }
        }
      }
    },
    "summary": {
      "type": "object",
      "required": ["total", "passed", "failed", "borderline", "pass_rate"],
      "properties": {
        "total": { "type": "integer" },
        "passed": { "type": "integer" },
        "failed": { "type": "integer" },
        "borderline": { "type": "integer" },
        "pass_rate": { "type": "number", "minimum": 0, "maximum": 1 },
        "meets_threshold": { "type": "boolean" },
        "action_required": { "type": "string", "enum": ["none", "tune_prompt", "swap_model", "human_review"] }
      }
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`llm-as-judge`](./llm-as-judge.md) | Evaluator | Subjective component cases are graded by the Judge |
| [`evaluation-matrix`](./evaluation-matrix.md) | Evaluator | Component pass rates populate the matrix for bottleneck identification |
| [`eval-driven-development`](../product-manager/eval-driven-development.md) | PM | PM uses component eval results to prioritise engineering effort |
| [`reflection-pattern`](./reflection-pattern.md) | Evaluator | Low-scoring components are targeted for reflection loop integration |

---

## 📊 Evaluation Checklist

- [ ] Test set contains ≥ 20 real domain examples (not synthetic)
- [ ] Test set includes edge cases and known failure modes
- [ ] 70/30 train/test split enforced — no leakage
- [ ] Component isolated and callable without running full pipeline
- [ ] Pass threshold defined and documented (recommended: 85%)
- [ ] Component eval results stored with run date and model version
- [ ] E2E eval run after every component improvement

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "Component-Specific Evaluation" section.*
*Template version: v1.0.0*
