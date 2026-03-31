# Skill: Eval-Driven Development

**Role:** Lead PM
**Phase:** Design → Quality Control
**Autonomy Level:** Low (governance pattern)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Eval-Driven Development (EDD) is the discipline of using structured measurements to guide every code change in an agentic system. Instead of shipping a prompt change and hoping the output "feels better," EDD makes the process rigorous: curate a dataset of representative inputs with expected outputs, run the current agent against it, measure specific metrics, change one variable, re-run, compare. Every improvement is verified against a consistent benchmark.

The core philosophy is: **don't over-theorize — build a prototype, find the cracks, then measure them.** You won't know an agent's failure modes until you see it interact with real data. Start with 10–20 examples and a targeted eval. Expand the dataset as you discover new failure patterns.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** EDD transforms agentic development from "vibes-based iteration" to a product development process with measurable regression detection. Without it, a fix to the SQL generation component may silently break the chart generation component — you only discover it in production.
- **Cost implication:** Running an eval dataset of 50 examples costs ~$0.50–2.00 in LLM API calls. Catching a regression before deployment avoids the cost of a production incident, re-run charges, and user trust damage.
- **Latency implication:** EDD adds a CI gate to every agent change. Budget 5–15 minutes for a full eval run in your deployment pipeline.
- **When to skip this:** Never skip evals entirely. Use a minimal 5-example "smoke test" eval even for small changes. Full EDD applies when the system handles real user traffic.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A prototype agent (even a rough one) to generate initial outputs for inspection
- 10–20 real examples from your domain (not synthetic — real queries produce real failure modes)
- A definition of "success" per example — either a ground truth output or a rubric

**Workflow:**

1. **Build fast prototype** — Ship the simplest possible version of the agent. Don't optimize. Run 10–20 real queries through it and manually inspect every output.
2. **Identify failure pattern** — Find the recurring failure. Not "the output is bad" — specifically "it always confuses Issue Date with Due Date on invoices with two date fields."
3. **Build a targeted eval** — Create a dataset of 20 examples that specifically exercises the identified failure. Include ground truth where possible.
4. **Establish baseline** — Run the current agent against the eval. Record the metric (e.g., date extraction accuracy = 45%).
5. **Run experiments** — Change one variable (prompt, model, decomposition, tool). Re-run the eval. Compare to baseline.
6. **Detect regressions** — Use a "HUD" matrix: rows are eval examples, columns are metrics. A fix that improves date accuracy but drops JSON schema compliance is not a net win.
7. **Expand the dataset** — As new failure patterns emerge from production traffic, add them to the eval dataset. The dataset grows; the bar never drops.
8. **CI gate** — The eval runs on every PR. A PR that decreases any key metric by >5% is blocked until the regression is resolved.

**Failure modes to watch:**
- `StaleMetics` — Caused by: the agent's output quality improves but the eval metrics don't move because the eval is too narrow. Fix: if the agent "looks better" but scores the same, the eval is outdated — update it.
- `EvalOverfit` — Caused by: prompts tuned specifically to pass the eval dataset rather than generalise. Fix: hold out 40% of examples as a test set — never tune against them.
- `GreenWashingCI` — Caused by: CI evals that are too easy and always pass. Fix: include adversarial examples — queries that historically caused failures — in the eval dataset.
- `ComponentIgnorance` — Caused by: only running end-to-end evals. Fix: add component-level evals for each skill independently. E2E evals mask which component caused a regression.

**Integration touchpoints:**
- Feeds into: [`component-evaluation`](../evaluator/component-evaluation.md) — component evals are a subset of EDD
- Feeds into: [`evaluation-matrix`](../evaluator/evaluation-matrix.md) — the eval matrix is the EDD tracking artifact
- Required by: [`state-observability`](../architect/state-observability.md) — production traces are the source for new eval examples

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable directly. Eval datasets should include examples that stress context limits — long documents, multi-turn sessions — since these are the most common real-world failure cases.
- **Cost ceiling:** Define the maximum eval cost per PR (recommended: $5 for standard evals, $20 for full regression suites). Larger evals should run on merge to main, not on every PR.
- **Model requirement:** Use the same model in CI evals as in production. Evals run against a different model version are measuring the wrong thing.
- **Non-determinism:** Run each eval example 3 times and average the score. A single run result is too noisy. Flag examples with high variance — they indicate unstable behavior.
- **Human gate required:** Yes — for defining "what good looks like" on new task types. Ground truth labels require expert review, not auto-generation.

---

## 📦 Ready-to-Use Artifact: Eval Dataset Schema + CI Eval Config

### Option B · JSON Schema (Eval Dataset)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EvalDataset",
  "description": "A structured evaluation dataset for one agent skill or end-to-end pipeline",
  "type": "object",
  "required": ["dataset_id", "skill_under_test", "version", "examples"],
  "properties": {
    "dataset_id": { "type": "string", "description": "Unique ID. Format: eval-[skill-name]-[date]" },
    "skill_under_test": { "type": "string", "description": "The skill or pipeline being evaluated. Matches skill_name in registry." },
    "version": { "type": "string", "description": "Dataset version. Increment when examples are added or labels change." },
    "metric": {
      "type": "string",
      "enum": ["exact_match", "json_schema_valid", "regex_match", "llm_judge_score", "code_executes"],
      "description": "Primary evaluation metric for this dataset."
    },
    "pass_threshold": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Minimum passing score (0–1). CI blocks if score drops below this."
    },
    "examples": {
      "type": "array",
      "minItems": 10,
      "items": {
        "type": "object",
        "required": ["example_id", "input", "expected_output", "tags"],
        "properties": {
          "example_id": { "type": "string" },
          "input": { "type": ["string", "object"], "description": "The input passed to the agent or skill." },
          "expected_output": { "type": ["string", "object", "null"], "description": "Ground truth. null for rubric-based evals." },
          "rubric": { "type": ["string", "null"], "description": "For LLM-as-Judge evals: what the judge should verify." },
          "tags": {
            "type": "array",
            "items": { "type": "string" },
            "description": "e.g. ['edge_case', 'adversarial', 'happy_path', 'regression_2026-03']"
          },
          "expected_to_fail": {
            "type": "boolean",
            "default": false,
            "description": "true = this example is known to fail. Used to track known issues without blocking CI."
          }
        }
      }
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`evaluation-matrix`](../evaluator/evaluation-matrix.md) | Evaluator | The matrix is the EDD tracking tool — maps eval types to ground truth availability |
| [`component-evaluation`](../evaluator/component-evaluation.md) | Evaluator | Component evals are targeted EDD at the individual skill level |
| [`state-observability`](../architect/state-observability.md) | Architect | Production traces are the source of truth for new eval examples |
| [`cost-latency-tradeoffs`](./cost-latency-tradeoffs.md) | Product Manager | Eval cost is part of the per-task budget analysis |

---

## 📊 Evaluation Checklist (Meta — for the EDD process itself)

- [ ] Eval dataset contains ≥ 10 examples before any CI gate is enforced
- [ ] 40% of examples held out as test set — never tuned against
- [ ] Each metric run 3× and averaged — single-run scores not used for decisions
- [ ] Adversarial examples included — at least 20% of dataset are edge cases
- [ ] Eval cost per CI run documented and within budget
- [ ] Dataset version incremented every time examples or labels change

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "V. Scaling: Evaluation-Driven Development (EDD)" and "The Quick and Dirty Philosophy" sections.*
*Template version: v1.0.0*
