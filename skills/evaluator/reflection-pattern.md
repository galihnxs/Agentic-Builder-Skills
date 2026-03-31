# Skill: Reflection Pattern

**Role:** Evaluator (Critic)
**Phase:** Quality Control
**Autonomy Level:** Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The Reflection Pattern is the process of prompting an LLM to read its own initial output, identify specific flaws, and produce an improved version — before that output ever reaches the user or the next agent in the pipeline. It transforms every agent from a single-pass generator into a self-correcting loop: Generate → Critique → Revise.

The key architectural insight is that self-reflection alone gives only a "modest bump" in quality. The pattern becomes significantly more powerful when the reflection step receives **external information** — error logs, unit test failures, API responses, or word count constraints — rather than asking the LLM to guess what is wrong. That external grounding is what separates a quality gate from wishful thinking.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Reduces user-visible errors on structured extraction tasks (e.g., invoice dates, report sections) from ~40% to under 5% with 2-3 reflection cycles — without upgrading the underlying model.
- **Cost implication:** A GPT-3.5 in an agentic reflection loop outperforms GPT-4 in a single-pass call on the HumanEval benchmark. Reflection is cheaper than model upgrades for quality problems.
- **Latency implication:** Each reflection cycle adds 1 LLM call (~1–3s). Cap at 3 cycles for user-facing flows. Use async reflection for background processing where latency is not the constraint.
- **When to skip this:** Tasks with a verifiable ground truth that can be checked with code (e.g., "does this SQL query execute without error?"). Use the code execution result as feedback directly rather than asking the LLM to reflect on nothing.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A defined "Version 1" output from the upstream agent or LLM call
- At least one of: an external feedback signal (error log, test result, constraint check), OR a graded rubric the LLM can apply to its own output
- A `max_cycles` limit (recommended: 3) to prevent infinite loops

**Workflow:**

1. **Generate V1** — The upstream agent produces an initial output. This is the raw material for reflection.
2. **Gather external feedback** — Before asking the LLM to reflect, run any deterministic checks available:
   - Does the code compile / execute without error? → pass the error log
   - Does the output meet format constraints (word count, JSON schema, required fields)? → pass the constraint violations
   - Did unit tests pass? → pass the test report
3. **Reflection call** — Send V1 + external feedback to the Evaluator. The Evaluator identifies: (a) what is factually wrong, (b) what constraint is violated, (c) what is missing. It does NOT produce a new version yet — it produces a critique.
4. **Revision call** — Send V1 + the critique to the generator. The generator produces V2 addressing the specific points raised.
5. **Re-check** — Run the same deterministic checks on V2. If it passes, exit the loop. If not, repeat from step 3 with the new feedback.
6. **Hard stop** — After `max_cycles`, exit regardless. Flag the output as `confidence: low` and route to human review if still failing.

**Failure modes to watch:**
- `EmptyReflection` — Caused by: asking the LLM to reflect without any external feedback, resulting in generic praise. Fix: always provide at least one concrete constraint violation or error message. "Reflect on your output" with no context produces noise, not signal.
- `InfiniteLoop` — Caused by: no `max_cycles` guard. Fix: enforce hard limit. Log every cycle's output for debugging.
- `ReflectionHallucination` — Caused by: the Evaluator inventing problems that don't exist. Fix: use a stronger model for the reflection step than for the generation step. "The grader must be more capable than the student."
- `OverReflection` — Caused by: running reflection on simple, deterministic tasks. Fix: only invoke the Reflection Pattern for tasks where output quality is subjective or multi-constraint.

**Integration touchpoints:**
- Receives from: any upstream agent producing a V1 output
- Feeds into: [`llm-as-judge`](./llm-as-judge.md) — for final quality scoring after reflection cycles complete
- Required by: [`planning-pattern`](../orchestrator/planning-pattern.md) — the final synthesis step should pass through reflection
- Triggered by: [`code-execution-pattern`](../data-analyst/code-execution-pattern.md) — code failures automatically trigger a reflection cycle

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each reflection cycle adds V1 (~500–1,000 tokens) + feedback (~200 tokens) + critique (~300 tokens). A 3-cycle loop on a long output can consume 8,000+ tokens. Use a model with at least 16K context for multi-cycle reflection on long documents.
- **Cost ceiling:** 3 reflection cycles on GPT-4o ≈ $0.03–0.06 per task. Budget this explicitly. For high-volume pipelines, use a smaller model (Haiku, GPT-4o-mini) for reflection and frontier model only for final revision.
- **Model requirement:** The reflection (critic) step benefits from a **reasoning model** ("thinking model") — these are especially effective at finding logical errors and constraint violations. The revision step can use a standard model.
- **Non-determinism:** The same V1 may receive different critiques across cycles. This is acceptable — what matters is that the final output passes deterministic checks, not that the critique is identical.
- **Human gate required:** Yes — after `max_cycles` are exhausted with no passing output. Do not silently surface a failed reflection output to users.

---

## 📦 Ready-to-Use Artifact: Reflection Evaluator System Prompt

*Paste into your Evaluator agent's system prompt. Pair with the revision prompt below.*

### Option A · System Prompt (Skill Layer)

#### Evaluator (Critic) — produces the critique, not the revision

```markdown
## Role
You are the Evaluator in a multi-agent quality control system. Your single responsibility is:
Read a draft output and produce a structured critique. You do NOT rewrite the output.

## Inputs
You will receive:
- `draft`: The V1 output to evaluate
- `task_instruction`: What the output was supposed to accomplish
- `constraints`: Hard constraints the output must satisfy (format, length, required fields, etc.)
- `external_feedback`: Results from deterministic checks (error logs, test results, constraint violations). This is your most important input — ground your critique here first.

## Your Process
1. Read `external_feedback` first. If there are concrete errors or violations, these are your primary findings.
2. Read `task_instruction` to understand what "success" looks like.
3. Read `draft` against both of the above.
4. Identify: (a) concrete violations of `constraints`, (b) factual errors or hallucinations, (c) missing required elements, (d) quality issues (clarity, coherence, tone) — only if (a)-(c) are clean.
5. Be specific. Do not say "improve the writing." Say "Line 3 states X but the source data shows Y."

## Output Format
Respond ONLY in the following JSON structure. No preamble.

{
  "passed": false,
  "cycle": 1,
  "critical_issues": [
    {
      "type": "constraint_violation | factual_error | missing_element | quality",
      "location": "where in the draft (e.g. 'paragraph 2', 'field: due_date', 'line 7')",
      "description": "Exactly what is wrong",
      "evidence": "Quote from external_feedback or draft that supports this finding"
    }
  ],
  "revision_instructions": "One paragraph of specific, actionable instructions for the generator to fix ALL critical issues in V2.",
  "confidence": "high | medium | low"
}

## Hard Constraints
- NEVER say the draft is good if `external_feedback` contains errors or violations
- NEVER invent issues not grounded in `external_feedback`, `constraints`, or `task_instruction`
- NEVER rewrite the draft — only critique it
- If the draft passes all constraints and has no factual errors, set `passed: true` and `critical_issues: []`
- Maximum 5 critical issues per cycle — focus on the most impactful
```

#### Generator (Reviser) — produces V2 from the critique

```markdown
## Role
You are the Generator in a reflection loop. You have produced a draft that a critic has reviewed.
Your single responsibility is: produce an improved V2 that addresses every issue in the critique.

## Inputs
- `original_draft`: Your V1 output
- `task_instruction`: The original task
- `critique`: The structured critique from the Evaluator
- `constraints`: The hard constraints your output must satisfy

## Your Process
1. Read `critique.revision_instructions` — this is your primary guide.
2. For each item in `critique.critical_issues`: address it explicitly in V2.
3. Do not change anything in V1 that was not flagged — preserve what was correct.
4. Verify your V2 satisfies every item in `constraints` before outputting.

## Output Format
Output the revised content directly. No preamble. No "Here is my revision:".
If the task requires JSON output, output valid JSON only.
```

---

### Option B · JSON Schema (Reflection Cycle State)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ReflectionCycleState",
  "description": "Tracks the state of a reflection loop across cycles",
  "type": "object",
  "required": ["task_id", "current_cycle", "max_cycles", "draft", "status"],
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Unique identifier for this reflection task. Format: reflect-[uuid4]"
    },
    "current_cycle": {
      "type": "integer",
      "minimum": 1,
      "description": "Current reflection cycle number. Starts at 1."
    },
    "max_cycles": {
      "type": "integer",
      "default": 3,
      "description": "Hard limit. When current_cycle exceeds this, exit and route to human review."
    },
    "draft": {
      "type": "string",
      "description": "The current version of the output being evaluated."
    },
    "external_feedback": {
      "type": ["string", "null"],
      "description": "Output from deterministic checks: error logs, test results, constraint violations."
    },
    "critique": {
      "type": ["object", "null"],
      "description": "The structured critique from the last Evaluator call. null on cycle 1 before first critique."
    },
    "status": {
      "type": "string",
      "enum": ["in_progress", "passed", "failed_max_cycles", "escalated_to_human"],
      "description": "Current loop status."
    },
    "cycle_history": {
      "type": "array",
      "description": "Full history of drafts and critiques across cycles for debugging.",
      "items": {
        "type": "object",
        "properties": {
          "cycle": { "type": "integer" },
          "draft": { "type": "string" },
          "external_feedback": { "type": "string" },
          "critique": { "type": "object" },
          "passed": { "type": "boolean" }
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
| [`llm-as-judge`](./llm-as-judge.md) | Evaluator | Final scoring after reflection cycles complete |
| [`code-execution-pattern`](../data-analyst/code-execution-pattern.md) | Data Analyst | Code execution failures are the best external feedback signal for reflection |
| [`planning-pattern`](../orchestrator/planning-pattern.md) | Orchestrator | The synthesis step of any plan should pass through at least 1 reflection cycle |
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Code-based external feedback must be generated inside a sandbox |

---

## 📊 Evaluation Checklist

Before considering this skill "production-ready" in your system:

- [ ] Reflection loop tested with ≥ 20 real V1 outputs from your domain
- [ ] `max_cycles` hard limit enforced — verified loop cannot run indefinitely
- [ ] External feedback signal identified and connected (not pure self-reflection)
- [ ] Evaluator model is equal or stronger than Generator model
- [ ] `passed: true` criteria are deterministic, not subjective
- [ ] `escalated_to_human` routing implemented for `failed_max_cycles` state
- [ ] Cycle history logged for every production run — enables post-mortem debugging

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — Reflection Pattern |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "Reflection Design Pattern" and "The Golden Rule of Reflection" sections.*
*Template version: v1.0.0 — see [`_template/SKILL_TEMPLATE.md`](../../_template/SKILL_TEMPLATE.md)*
