# Skill: Evaluation Matrix

**Role:** Evaluator (Critic) + Lead PM
**Phase:** Quality Control → Design
**Autonomy Level:** Low
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The Evaluation Matrix is the decision framework that maps every agent output type to the correct evaluation method based on two axes: (1) whether a per-example ground truth exists, and (2) whether the evaluation criteria are objective or subjective. It is not a tool — it is a forcing function that prevents the most common evaluation mistake in agentic systems: using the wrong type of eval for a given task and either over-engineering (expensive LLM-as-Judge for a task checkable with regex) or under-engineering (regex for a task requiring semantic understanding).

The matrix defines four quadrants, each with a specific evaluation technique, example use case, and implementation path. Every new agent skill added to a system must be placed in one of these quadrants before an eval can be written for it.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Teams that skip eval framework design end up with a mix of incompatible eval methods, inconsistent pass thresholds, and no clear way to compare component quality over time. The matrix creates a shared evaluation vocabulary across PM and engineering.
- **Cost implication:** Code-based evals cost near-zero per run. Choosing them over LLM-as-Judge wherever possible reduces eval infrastructure cost by 80%+.
- **Latency implication:** The matrix is a design-time decision, not a runtime cost. It saves engineering time by eliminating debating which eval approach to use on each new component.
- **When to skip this:** You have one agent, one output type, and a clear ground truth. In that case, use code-based eval directly — the matrix is for systems with multiple output types requiring different eval approaches.

---

## 🛠️ How it Works (The Engineering Perspective)

**The Four Quadrants:**

```
                    PER-EXAMPLE GROUND TRUTH
                    EXISTS                    DOES NOT EXIST
                ┌────────────────────────┬────────────────────────┐
    OBJECTIVE   │ Q1: Code-Based Eval    │ Q2: Rule-Based Eval    │
  (measurable)  │ Regex, schema check,   │ Word count, char limit,│
                │ SQL execution, exact   │ format constraints     │
                │ field match            │ (same rule every run)  │
                ├────────────────────────┼────────────────────────┤
    SUBJECTIVE  │ Q3: LLM-Judge + GT     │ Q4: LLM-Judge + Rubric │
  (requires     │ Check if 5 gold-std    │ Tone, coherence,       │
   judgment)    │ points appear in essay │ relevance, empathy     │
                └────────────────────────┴────────────────────────┘
```

**Q1 — Objective + Ground Truth (Code-Based, 100% accurate)**
- Use when: the correct output is known and checkable by code
- Examples: invoice date extraction, SQL result matching, JSON schema adherence, code that must execute without error
- Implementation: regex match, schema validation, exact field comparison, unit test execution

**Q2 — Objective + No Ground Truth (Rule-Based, 100% accurate)**
- Use when: there is a universal constraint that every output must satisfy, regardless of input
- Examples: marketing copy must be ≤ 10 words, response must include a call-to-action, code must be under 50 lines
- Implementation: `len(text.split()) <= 10`, character count, regex for required patterns

**Q3 — Subjective + Ground Truth (LLM-Judge with Gold Standard, ~85–95% accurate)**
- Use when: quality is qualitative but there are known "must-have" elements
- Examples: research report must mention 5 specific breakthroughs, support reply must acknowledge the customer's frustration
- Implementation: LLM-as-Judge checks if each gold standard element is adequately covered

**Q4 — Subjective + No Ground Truth (LLM-Judge with Rubric, ~85–95% accurate)**
- Use when: quality is qualitative and the standard varies by input
- Examples: tone appropriateness, logical coherence, relevance to user intent
- Implementation: LLM-as-Judge with a rubric of binary/categorical criteria

**Workflow:**

1. **List all output types** in your system (each distinct agent output that reaches the next stage or the user)
2. **Place each in a quadrant** using the two-axis test
3. **Select the evaluation technique** from the quadrant
4. **Write the eval** using the appropriate skill: [`component-evaluation`](./component-evaluation.md) for the harness, [`llm-as-judge`](./llm-as-judge.md) for Q3/Q4
5. **Set pass thresholds** — document them. "We decided 85% is production-ready because..." is a valid decision. Undocumented thresholds drift.

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable — the matrix is a design tool.
- **Cost ceiling:** Q1 and Q2 evals cost near-zero. Q3 and Q4 evals cost per LLM-Judge call. Budget Q3/Q4 evals separately from Q1/Q2.
- **Model requirement:** Not applicable at the matrix level. Individual evals within Q3/Q4 require a capable Judge model.
- **Non-determinism:** Q1 and Q2 are fully deterministic. Q3 and Q4 have ±5–15% variance across runs — mitigate with 3-run averaging on borderline cases.
- **Human gate required:** Yes — for initial quadrant placement of any new output type. Engineering can propose, but PM and a senior engineer must confirm before the eval is written.

---

## 📦 Ready-to-Use Artifact: Evaluation Matrix Template

### Option A · Eval Matrix Planning Template (Skill Layer — paste into PRD or sprint doc)

```markdown
## Evaluation Matrix — [System/Agent Name]
Last updated: {{DATE}}
Owner: {{PM_NAME}} + {{ENGINEERING_LEAD}}

### Output Types in This System

| Output Type | Agent | Quadrant | Eval Method | Pass Threshold | Owner |
|---|---|---|---|---|---|
| Invoice due date extracted | Document Parser | Q1 (Obj + GT) | Regex match against verified dates | 95% | Engineering |
| Marketing caption length | Creator | Q2 (Obj + No GT) | `len(text.split()) <= 10` | 100% | Engineering |
| Research report completeness | Researcher | Q3 (Subj + GT) | LLM-Judge: covers 5 gold points? | 80% | PM + Engineering |
| Support reply tone | Creator | Q4 (Subj + No GT) | LLM-Judge: empathy rubric | 85% | PM + Engineering |

### Quadrant Placement Rules
- Q1: I can write a test case with an exact expected answer → Code eval
- Q2: There is a universal constraint every output must meet → Rule eval
- Q3: Quality is qualitative but gold-standard elements are known → Judge + GT
- Q4: Quality is qualitative and standard varies by input → Judge + Rubric

### Eval Infrastructure
- Q1/Q2 evals run on: every CI/CD pipeline merge
- Q3/Q4 evals run on: every sprint release + any prompt change
- Human review triggered on: pass rate drops >5% from baseline, any borderline cluster

### Threshold Change Process
Any change to a pass threshold requires:
1. PM sign-off with documented business reason
2. Re-run eval on last 3 sprint's data to confirm impact
3. Update this document with the change date and rationale
```

---

### Option B · Eval Registry Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EvalRegistry",
  "description": "Registry of all evaluation definitions for a multi-agent system",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["output_type", "agent", "quadrant", "eval_method", "pass_threshold"],
    "additionalProperties": false,
    "properties": {
      "output_type": { "type": "string", "description": "Human-readable name for this output" },
      "agent": { "type": "string", "description": "Which agent produces this output" },
      "quadrant": {
        "type": "string",
        "enum": ["Q1_objective_ground_truth", "Q2_objective_no_ground_truth", "Q3_subjective_ground_truth", "Q4_subjective_no_ground_truth"]
      },
      "eval_method": {
        "type": "string",
        "enum": ["regex", "schema_validation", "exact_match", "rule_check", "llm_judge_with_ground_truth", "llm_judge_with_rubric"]
      },
      "pass_threshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1,
        "description": "Fraction of test cases that must pass. 1.0 for Q1/Q2, 0.8-0.95 for Q3/Q4."
      },
      "ground_truth_source": {
        "type": ["string", "null"],
        "description": "For Q1/Q3: where ground truth comes from (file path, database, manual annotation)"
      },
      "rubric_file": {
        "type": ["string", "null"],
        "description": "For Q3/Q4: path to the LLM-Judge rubric file"
      },
      "last_run_date": { "type": ["string", "null"], "format": "date" },
      "last_run_pass_rate": { "type": ["number", "null"] }
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`component-evaluation`](./component-evaluation.md) | Evaluator | Implements the test harness for each quadrant |
| [`llm-as-judge`](./llm-as-judge.md) | Evaluator | Powers Q3 and Q4 evaluations |
| [`eval-driven-development`](../product-manager/eval-driven-development.md) | PM | EDD uses the matrix to prioritise which evals to build first |

---

## 📊 Evaluation Checklist

- [ ] Every output type in the system has been placed in a quadrant
- [ ] Pass thresholds documented with business rationale
- [ ] Q1/Q2 evals integrated into CI/CD
- [ ] Q3/Q4 evals scheduled for every sprint release
- [ ] Threshold change process agreed between PM and engineering
- [ ] Eval registry JSON maintained and version-controlled

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "The Evaluation Matrix" and "Case Studies in Iteration" sections.*
*Template version: v1.0.0*
