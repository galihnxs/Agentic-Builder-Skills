# Skill: Feasibility Framework

**Role:** Lead PM
**Phase:** Design
**Autonomy Level:** Low (decision framework)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The Feasibility Framework is the PM's decision tool for determining whether a proposed agentic feature should be built as a low-autonomy workflow, a semi-autonomous agent, or a highly autonomous system — and whether to build it at all. It maps task characteristics (predictability, data format, SOP availability, user input variance) onto a spectrum from "easy to build and reliable" to "hard to build and experimental."

Low-autonomy systems are currently providing massive value to businesses because they are predictable and controllable. High-autonomy systems are at the frontier of active research — powerful but harder to control. The PM's job is to match the system to the task, not to default to maximum autonomy because it sounds impressive.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Building a high-autonomy agent for a task that works perfectly as a deterministic workflow wastes engineering budget and introduces unpredictability with no user benefit. The Feasibility Framework prevents this misallocation.
- **Cost implication:** Low-autonomy systems (deterministic workflows) cost 60–80% less per run than high-autonomy systems (LLM decides all steps at runtime). The autonomy level should be the minimum required to solve the problem.
- **Latency implication:** Deterministic workflows have predictable latency. High-autonomy agents have variable latency that scales with the number of self-decided steps. User-facing flows should bias toward lower autonomy.
- **When to skip this:** This framework should never be skipped. Even "obviously" high-autonomy tasks benefit from a feasibility check — often the high-autonomy path can be simplified once the task is decomposed.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A clear user story: "As a [user], I want [outcome], so that [value]"
- An understanding of available data formats and sources
- An estimate of how variable user inputs will be in production

**Workflow:**

1. **Score the task** — Rate the task on four dimensions (see artifact below): step predictability, data format, SOP existence, input variance.
2. **Map to autonomy tier** — Each dimension scores Low/Medium/High autonomy. The overall tier is the maximum (most demanding) across all dimensions.
3. **Check the "Harder to Build" column** — If the task requires on-the-fly planning, multimodal data, or highly unpredictable inputs, flag this as an enterprise-grade or experimental build.
4. **Define the MVP scope** — Even if the final system is high-autonomy, the MVP should be the lowest autonomy tier that delivers user value. Increment autonomy only when the lower tier's limitations are proven to block users.
5. **Estimate and approve** — Produce a cost and latency estimate for the chosen tier. Get explicit PM + engineering sign-off before starting implementation.

**Failure modes to watch:**
- `AutonomyInflation` — Caused by: engineering teams defaulting to "let the LLM decide everything" because it feels more impressive. Fix: require the PM to approve the autonomy tier explicitly, not just the feature.
- `ScopeUnderEstimate` — Caused by: scoring all dimensions as Low when the actual user input variance is High. Fix: run 20 real user queries through the scoring rubric before finalising the tier assessment.
- `MVPSkip` — Caused by: building the full high-autonomy system before validating that users actually need that level of flexibility. Fix: ship the deterministic workflow first, measure where users hit its limits, then add autonomy.

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable.
- **Cost ceiling:** Use the autonomy tier to set the per-task cost budget. Low: < $0.01/task. Semi: $0.01–0.10/task. High: $0.10–1.00/task. Anything above $1.00/task requires explicit board-level business case.
- **Model requirement:** Not applicable to the framework itself.
- **Non-determinism:** Higher autonomy = higher non-determinism = harder to guarantee consistent user experience. Document the acceptable non-determinism tolerance in the product spec.
- **Human gate required:** Yes — for any system scored as "High" autonomy before it handles live user traffic. Pilot with internal users first.

---

## 📦 Ready-to-Use Artifact: Feasibility Scoring Rubric

### Option A · Feasibility Scoring Prompt (Skill Layer)

```markdown
## Role
You are the Feasibility Analyst. Score a proposed agentic feature across four dimensions
to determine the appropriate autonomy tier and flag build risks.

## Scoring Dimensions

### 1. Step Predictability
- LOW autonomy (score: 1): Steps are fully predetermined. A human could write the exact sequence before seeing any user input. Example: "PDF → extract date → validate format → save to DB."
- SEMI autonomy (score: 2): Steps are mostly predetermined but the agent can choose between 2–3 predefined tool options based on context.
- HIGH autonomy (score: 3): Steps must be planned at runtime. The agent cannot know the sequence until it sees the specific input.

### 2. Data Format
- LOW (score: 1): All inputs and outputs are text-only (structured or unstructured).
- SEMI (score: 2): Inputs include structured data (JSON, CSV, SQL) requiring parsing.
- HIGH (score: 3): Inputs require multimodal processing (vision, audio, video).

### 3. SOP Availability
- LOW (score: 1): A clear, documented Standard Operating Procedure exists that covers ≥ 90% of cases.
- SEMI (score: 2): A partial SOP exists; the agent handles edge cases with judgment.
- HIGH (score: 3): No SOP exists. The agent must infer the correct approach from context.

### 4. User Input Variance
- LOW (score: 1): User inputs are highly predictable and templated. Low variance.
- SEMI (score: 2): User inputs vary in phrasing but the underlying intent is bounded.
- HIGH (score: 3): User inputs are highly unpredictable. The same feature may be invoked with wildly different intents.

## Output Format
{
  "feature_name": "string",
  "scores": {
    "step_predictability": 1-3,
    "data_format": 1-3,
    "sop_availability": 1-3,
    "user_input_variance": 1-3
  },
  "overall_tier": "LOW | SEMI | HIGH",
  "tier_rationale": "One sentence: which dimension drove the overall tier and why",
  "recommended_mvp_tier": "LOW | SEMI",
  "build_risks": ["list of specific risks based on HIGH-scored dimensions"],
  "estimated_cost_per_task_usd": "< 0.01 | 0.01-0.10 | 0.10-1.00 | > 1.00",
  "proceed": true
}

## Hard Rule
- `overall_tier` is always the MAXIMUM score across all four dimensions.
- `recommended_mvp_tier` is always ONE tier below `overall_tier` unless overall_tier is LOW.
- NEVER recommend building HIGH autonomy as the MVP.
```

### Option B · JSON Schema (Feasibility Assessment)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FeasibilityAssessment",
  "type": "object",
  "required": ["feature_name", "scores", "overall_tier", "proceed"],
  "properties": {
    "feature_name": { "type": "string" },
    "scores": {
      "type": "object",
      "required": ["step_predictability", "data_format", "sop_availability", "user_input_variance"],
      "properties": {
        "step_predictability": { "type": "integer", "minimum": 1, "maximum": 3 },
        "data_format": { "type": "integer", "minimum": 1, "maximum": 3 },
        "sop_availability": { "type": "integer", "minimum": 1, "maximum": 3 },
        "user_input_variance": { "type": "integer", "minimum": 1, "maximum": 3 }
      }
    },
    "overall_tier": { "type": "string", "enum": ["LOW", "SEMI", "HIGH"] },
    "tier_rationale": { "type": "string" },
    "recommended_mvp_tier": { "type": "string", "enum": ["LOW", "SEMI"] },
    "build_risks": { "type": "array", "items": { "type": "string" } },
    "estimated_cost_per_task_usd": { "type": "string" },
    "proceed": { "type": "boolean" }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`agentic-workflow-design`](./agentic-workflow-design.md) | Product Manager | Workflow design begins after feasibility tier is confirmed |
| [`cost-latency-tradeoffs`](./cost-latency-tradeoffs.md) | Product Manager | Cost estimates from feasibility feed into the tradeoff analysis |
| [`task-decomposition`](../orchestrator/task-decomposition.md) | Orchestrator | Decomposition of the scored feature begins after feasibility approval |
| [`eval-driven-development`](./eval-driven-development.md) | Product Manager | EDD applies immediately after the MVP is scoped |

---

## 📊 Evaluation Checklist

- [ ] 20 real user queries run through the scoring rubric before finalising tier
- [ ] HIGH-autonomy features piloted with internal users before public launch
- [ ] Cost-per-task estimate documented and approved by finance/PM
- [ ] MVP scoped to one tier below the overall tier assessment

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Feasibility Framework" and "Practical Application vs. Research" sections.*
*Template version: v1.0.0*
