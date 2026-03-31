# Skill: Self-Healing Code

**Role:** Data Analyst (Coder)
**Phase:** Quality Control
**Autonomy Level:** Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Self-Healing Code is the error recovery loop for code-executing agents: when the sandbox returns an error, the agent does not give up — it receives the exact error message, diagnoses the specific cause, and generates a corrected version. This is a specialised application of the [`reflection-pattern`](../evaluator/reflection-pattern.md) where the external feedback signal is binary and precise: the code either ran or it didn't, and the error message tells you exactly what went wrong.

The key advantage over generic reflection is that code errors are ground truth. A `KeyError: 'due_date'` tells the LLM exactly what field was missing. A `ModuleNotFoundError: No module named 'plotly'` tells it exactly which library is not available. This specificity makes self-healing far more effective for code than for natural language tasks — and justifies up to 3 healing iterations before escalating.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Without self-healing, a single syntax error in LLM-generated code causes the entire analytical task to fail, requiring human intervention. With self-healing, the agent recovers autonomously from the vast majority of code errors without any human involvement.
- **Cost implication:** Each self-healing iteration adds 1 LLM call (~$0.005–0.02) + 1 sandbox execution (~$0.001). Cap at 3 iterations. Total self-healing overhead: ≤ $0.06 per task. Far cheaper than human escalation.
- **Latency implication:** Each healing iteration adds ~3–7s (LLM call + sandbox run). For 3 iterations max: adds ≤ 21s. Acceptable for background analytical tasks; too slow for real-time user-facing flows. Use 1 healing iteration max for user-facing flows.
- **When to skip this:** Tasks where code failure is itself important information (e.g., "does this SQL query return results?" — a failure means no results, not a bug). Skip self-healing when the error is the expected output.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A working [`code-execution-pattern`](./code-execution-pattern.md) pipeline
- The sandbox returning structured error output (exit code, stdout, stderr)
- A `max_healing_iterations` limit (recommended: 2–3)
- The original task instruction and code available in the healing context

**Workflow:**

1. **Execution fails** — The sandbox returns a non-zero exit code. The error log (stderr) is captured.
2. **Error classification** — Classify the error type from the stderr before sending to the LLM:
   - `SyntaxError` / `IndentationError` → structural code error, fixable
   - `NameError` / `KeyError` / `IndexError` → logic error, fixable
   - `ModuleNotFoundError` → library not in sandbox allow-list, not fixable by healing — escalate immediately
   - `TimeoutError` → code is too slow, partially fixable (optimise algorithm)
   - `MemoryError` → code uses too much memory, partially fixable (process in chunks)
3. **Healing call** — Send to the LLM: original task + original code + error type + exact error message. Request a corrected version.
4. **Re-execute** — Run the corrected code in the sandbox.
5. **Loop or escalate** — If it passes: return the result. If it fails again: increment iteration counter. If `max_healing_iterations` reached: escalate to human review with the full error history.

**Failure modes to watch:**
- `HealingLoop` — Caused by: the LLM fixing one error and introducing a new one each iteration. Fix: include the full error history in each healing call, not just the latest error — this prevents the LLM from "forgetting" what it already tried.
- `UnfixableError` — Caused by: attempting to heal `ModuleNotFoundError` by having the LLM try a different library that's also not installed. Fix: classify errors before healing — unfixable errors escalate immediately without consuming healing iterations.
- `OverHeal` — Caused by: the LLM rewriting the entire code on the first healing iteration instead of fixing the specific error. Fix: include an explicit constraint: "Fix ONLY the specific error identified. Do not rewrite sections that are working."
- `SilentFailure` — Caused by: code that exits with code 0 but produces incorrect output (wrong calculation, empty result). Fix: include output validation in the healing trigger — not just exit code checks.

**Integration touchpoints:**
- Triggered by: [`code-execution-pattern`](./code-execution-pattern.md) — failures here trigger self-healing
- Uses: [`sandboxing-defense`](../protector/sandboxing-defense.md) — healing iterations also run in the sandbox
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — after successful healing, output passes through reflection
- Informs: [`sandbox-setup`](./sandbox-setup.md) — recurring `ModuleNotFoundError` patterns signal missing libraries in the config

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each healing iteration adds original code (~500 tokens) + error log (~200 tokens) + corrected code (~500 tokens). After 3 iterations: ~3,600 tokens of healing context. Use a model with 8K+ context for healing.
- **Cost ceiling:** Max 3 healing iterations × ($0.02 LLM + $0.003 sandbox) = ~$0.07 total healing overhead. Document this in the per-task cost budget.
- **Model requirement:** Use the same model for healing as for generation — or a stronger one. Never downgrade the model for healing iterations. Reasoning models (Claude Sonnet, GPT-4o) are particularly effective at diagnosing and fixing code errors.
- **Non-determinism:** The same error may produce different fixes across healing calls. If 2 iterations produce different fixes that both fail, the error may be fundamentally ambiguous — escalate rather than trying a 3rd approach.
- **Human gate required:** Yes — after `max_healing_iterations` are exhausted. The full error history must be surfaced to the human reviewer, not just the final error message.

---

## 📦 Ready-to-Use Artifact: Self-Healing System Prompt + Error Classifier

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Code Healer. You receive a failed code execution and produce a corrected version.

## Inputs
- `original_task`: What the code was supposed to accomplish
- `original_code`: The code that failed
- `error_type`: Classified error category
- `error_message`: The exact error from stderr
- `error_history`: All previous healing attempts and their errors (empty on first attempt)

## Your Process
1. Read `error_message` carefully. Identify the SPECIFIC line and cause.
2. Check `error_history` — have you already tried a similar fix? If yes, try a different approach.
3. Fix ONLY the specific error. Do not rewrite code that was working correctly.
4. If `error_type` is "ModuleNotFoundError": Do NOT attempt to substitute another library.
   Instead, output: {"status": "UNFIXABLE", "reason": "Library X is not in the sandbox allow-list"}
5. If `error_type` is "TimeoutError": Rewrite the algorithm to process data in smaller batches.
6. Verify your fix mentally: would the corrected code avoid the specific error?

## Output Format
{
  "status": "FIXED | UNFIXABLE | UNCERTAIN",
  "corrected_code": "the complete corrected Python code (only if status=FIXED)",
  "fix_description": "One sentence: exactly what was wrong and what was changed",
  "confidence": "high | medium | low"
}

## Hard Constraints
- NEVER use libraries not in the sandbox allow-list: pandas, numpy, matplotlib, seaborn, scipy, scikit-learn, openpyxl, python-dateutil, and Python stdlib only
- NEVER rewrite working sections of the code — fix the minimal change needed
- NEVER increase resource usage (memory, CPU) without explicit justification
- If status=UNFIXABLE, explain exactly what is missing and what the operator must do to fix it
```

### Option B · JSON Schema (Healing State)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SelfHealingState",
  "type": "object",
  "required": ["task_id", "iteration", "max_iterations", "status"],
  "properties": {
    "task_id": { "type": "string" },
    "iteration": { "type": "integer", "minimum": 1 },
    "max_iterations": { "type": "integer", "default": 3 },
    "status": {
      "type": "string",
      "enum": ["healing", "success", "escalated", "unfixable"]
    },
    "original_code": { "type": "string" },
    "current_code": { "type": "string" },
    "error_history": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "iteration": { "type": "integer" },
          "error_type": { "type": "string" },
          "error_message": { "type": "string" },
          "fix_applied": { "type": "string" },
          "fix_succeeded": { "type": "boolean" }
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
| [`code-execution-pattern`](./code-execution-pattern.md) | Data Analyst | Failures in this skill trigger self-healing |
| [`sandbox-setup`](./sandbox-setup.md) | Data Analyst | Recurring `ModuleNotFoundError` signals missing library in the sandbox config |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | After successful healing, output passes through standard reflection |
| [`human-in-the-loop`](../compliance/human-in-the-loop.md) | Compliance | Exhausted healing iterations escalate to HITL |

---

## 📊 Evaluation Checklist

- [ ] `ModuleNotFoundError` classified as UNFIXABLE — no healing iterations consumed
- [ ] Error history passed in every healing call — LLM does not repeat the same failed fix
- [ ] `max_healing_iterations` enforced — loop cannot run indefinitely
- [ ] Healing tested with 10 common error types from your domain
- [ ] Silent failure detection implemented — output validation beyond just exit code 0
- [ ] Escalation path tested — failed healing surfaces full error history to human reviewer

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Reflection in Coding" and "Self-Healing (Reflection)" sections.*
*Template version: v1.0.0*
