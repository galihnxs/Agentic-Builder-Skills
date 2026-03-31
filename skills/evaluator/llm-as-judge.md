# Skill: LLM-as-Judge

**Role:** Evaluator (Critic)
**Phase:** Quality Control
**Autonomy Level:** Low
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

LLM-as-Judge is the pattern of using a high-capability language model to evaluate the quality of another model's output on subjective criteria — tone, relevance, coherence, accuracy — that cannot be checked with a regex or schema validator. The Judge reads the output against a grading rubric, produces a discrete label (never a numeric score), and provides a one-sentence justification for its decision. It is the second tier of the Evaluation Trinity: more powerful than code-based checks, less authoritative than human annotation.

The critical design rule is that the Judge must be more capable than the model being judged. A GPT-4o-mini cannot reliably grade a GPT-4o output. A capable Judge with a well-designed rubric achieves 85–95% alignment with human annotation — making it cost-effective for high-volume pipelines where human review of every output is impractical.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Enables automated quality gates on subjective outputs (marketing copy tone, report coherence, support reply empathy) at scale — without hiring an annotation team for every run.
- **Cost implication:** LLM-as-Judge costs ~$0.002–0.01 per evaluation. Human annotation costs $0.05–0.50+. For pipelines producing 1,000+ outputs per day, this is a 10–50× cost reduction on quality control.
- **Latency implication:** 1 additional LLM call (~1–3s). Run asynchronously post-delivery for user-facing flows where the latency budget is tight.
- **When to skip this:** When a code-based check can answer the question. "Is this JSON valid?" does not need a Judge. "Is this response empathetic?" does.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A grading rubric with discrete, well-defined labels (never 1–10 scales)
- A Judge model at least as capable as the model being graded
- The original task instruction — the Judge needs to know what "good" looks like for this specific task
- Ground truth examples (3–5 gold standard input/output pairs) included in the Judge's prompt as calibration

**Workflow:**

1. **Collect inputs** — Gather: the original task instruction, the model's output, any constraints the output must satisfy, and 3–5 gold standard examples.
2. **Run Judge call** — Send all inputs to the Judge with the grading rubric. The Judge outputs a discrete label + justification.
3. **Validate Judge output** — The Judge's own output must be schema-validated. Judges hallucinate labels too.
4. **Route on label** — `pass` → forward to next stage. `fail` → trigger reflection or escalate. `borderline` → route to human review queue.
5. **Track alignment** — Periodically compare Judge labels to human annotations on a sample. If alignment drops below 80%, update the rubric or switch Judge models.

**Failure modes to watch:**
- `PositivityBias` — Caused by: Judge models that default to charitable assessments. Fix: include explicit "what failure looks like" examples in the rubric. Add a "hard fail conditions" section.
- `VagueCriteria` — Caused by: asking the Judge to evaluate "quality" without defining it. Fix: every criterion in the rubric must be answerable with a binary or categorical label.
- `SelfGrading` — Caused by: using the same model instance to both generate and judge its output. Fix: always use a separate Judge call, ideally a different model or a different system prompt with an adversarial persona.
- `LabelDrift` — Caused by: the Judge's interpretation of labels shifting as the system prompt evolves. Fix: include calibration examples in every Judge call. These examples anchor the label definitions.

**Integration touchpoints:**
- Receives from: [`reflection-pattern`](./reflection-pattern.md) — judges the final output after reflection cycles
- Feeds into: [`component-evaluation`](./component-evaluation.md) — Judge labels become component eval metrics
- Feeds into: [`evaluation-matrix`](./evaluation-matrix.md) — aggregated Judge results populate the matrix
- Required by: [`multi-agent-coordination`](../orchestrator/multi-agent-coordination.md) — Manager uses Judge to assess sub-agent output quality

---

## ⚠️ Constraints & Guardrails

- **Context window:** Judge prompt = task instruction + output + rubric + 3–5 examples ≈ 2,000–4,000 tokens. Budget accordingly. For long outputs, summarise before judging — never send a 10,000-token document to the Judge.
- **Cost ceiling:** ~$0.005 per Judge call on GPT-4o. At 10,000 outputs/day = $50/day. Monitor volume and add sampling if costs spike.
- **Model requirement:** Claude 3.5 Sonnet, GPT-4o, or Gemini 1.5 Pro minimum. Do not use Haiku/mini-tier models as Judges for anything requiring nuanced assessment.
- **Non-determinism:** The same output may receive different labels across Judge runs. Mitigate by: (a) using temperature=0 for Judge calls, (b) running 3 Judge calls and taking majority vote for borderline cases.
- **Human gate required:** Yes — for `borderline` labels and for any Judge decision that triggers a consequential action (blocking a publication, escalating a support ticket).

---

## 📦 Ready-to-Use Artifact: LLM Judge System Prompt

### Option A · Judge System Prompt (Skill Layer)

```markdown
## Role
You are an impartial Judge evaluating the quality of an AI-generated output.
Your job is to apply the rubric below and return a discrete label with a one-sentence justification.

You are adversarial by default. You look for failures, not successes.
If in doubt between "pass" and "fail", choose "fail".

## Task Context
- Original instruction: {{TASK_INSTRUCTION}}
- Hard constraints: {{CONSTRAINTS}}

## Output to Evaluate
{{OUTPUT_TO_JUDGE}}

## Grading Rubric
Evaluate against EACH criterion. One failing criterion = overall "fail".

Criterion 1 — Factual Accuracy
  PASS: Every factual claim is either directly sourced from provided data or appropriately hedged as uncertain
  FAIL: Any unsourced factual claim presented as certain. Any date, number, or name not verifiable from inputs.

Criterion 2 — Constraint Adherence
  PASS: All hard constraints from the task instruction are satisfied
  FAIL: Any constraint is violated, even partially

Criterion 3 — Completeness
  PASS: The output addresses all parts of the task instruction
  FAIL: Any required element is missing or substantially incomplete

Criterion 4 — Relevance
  PASS: The output contains no content irrelevant to the task
  FAIL: More than 10% of the output is tangential or off-topic

## Gold Standard Examples (Calibration)
These are examples of PASS outputs for similar tasks. Use them to calibrate your assessment.
{{GOLD_STANDARD_EXAMPLES}}

## Output Format
Respond ONLY with this JSON. No preamble.
{
  "label": "pass | fail | borderline",
  "justification": "One sentence. Cite the specific criterion and evidence.",
  "failing_criterion": "criterion_name or null if pass",
  "requires_human_review": false
}

## Hard Rules
- NEVER use numeric scores (1–10)
- NEVER say "overall good but..." — if any criterion fails, label is "fail"
- Use "borderline" ONLY when criteria genuinely conflict or evidence is ambiguous
- Set requires_human_review: true for borderline or any output that could cause harm if wrong
```

---

### Option B · Judge Result Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JudgeResult",
  "type": "object",
  "required": ["label", "justification", "failing_criterion", "requires_human_review"],
  "additionalProperties": false,
  "properties": {
    "label": {
      "type": "string",
      "enum": ["pass", "fail", "borderline"],
      "description": "pass = all criteria met. fail = at least one criterion failed. borderline = conflicting evidence."
    },
    "justification": {
      "type": "string",
      "maxLength": 300,
      "description": "One sentence citing the specific criterion and evidence for the label."
    },
    "failing_criterion": {
      "type": ["string", "null"],
      "description": "Name of the first failing criterion. null if label is pass."
    },
    "requires_human_review": {
      "type": "boolean",
      "description": "true for borderline labels or outputs with potential for harm if wrong."
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`reflection-pattern`](./reflection-pattern.md) | Evaluator | Judge runs after reflection cycles to confirm quality improvement |
| [`component-evaluation`](./component-evaluation.md) | Evaluator | Judge labels feed component-level metrics |
| [`evaluation-matrix`](./evaluation-matrix.md) | Evaluator | Aggregated pass/fail rates populate the matrix |

---

## 📊 Evaluation Checklist

- [ ] Judge model confirmed ≥ capability of model being judged
- [ ] Rubric tested with gold standard examples — alignment ≥ 85% vs. human labels
- [ ] Temperature=0 set on Judge calls for consistency
- [ ] `borderline` routing to human review queue implemented
- [ ] Judge output schema validated — not just trusted as correct
- [ ] Alignment check scheduled: compare Judge vs. human labels monthly

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "Quality Control: The Evaluation Trinity" and "The Rules of the Judge" sections.*
*Template version: v1.0.0*
