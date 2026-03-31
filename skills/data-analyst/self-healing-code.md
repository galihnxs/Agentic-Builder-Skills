# Skill: Self-Healing Code

**Role:** Data Analyst (Coder)
**Phase:** Execution → Quality Control
**Autonomy Level:** Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Self-Healing Code is the pattern of feeding a code execution error back to the LLM — with the exact error message and the failing code — and asking it to diagnose the problem and generate a corrected version. It is the Reflection Pattern applied specifically to code, where the "external feedback" is binary and objective: the code either runs without error or it doesn't. This objectivity makes code self-healing the most powerful and reliable application of the reflection loop.

Unlike reflection on text outputs (where the LLM guesses what might be wrong), code self-healing is grounded in a concrete, machine-generated error message. A `KeyError: 'revenue_q3'` is unambiguous — the LLM can diagnose it, fix it, and re-submit with high confidence.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Turns a code generation failure from a hard stop into a recoverable state. First-attempt code success rates for capable models are 70–85% on real-world data tasks. With 2–3 self-healing cycles, this reaches 95–99%.
- **Cost implication:** 3 self-healing cycles cost ~$0.02 total. Routing to human debugging costs 15–60 minutes of engineering time. The economic case is not close.
- **Latency implication:** Each healing cycle adds 1 LLM call + 1 sandbox execution (~3–6s). For user-facing flows with tight SLAs, cap at 2 cycles and route to async processing on failure.
- **When to skip this:** Code that must be deterministically correct on first attempt for compliance or legal reasons (financial calculations with audit trails, medical dosage computations). In these cases, use pre-validated, manually-written code functions — not LLM-generated code.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A sandboxed execution environment returning structured stdout + stderr + exit code
- The failing code string (stored in state, not regenerated from scratch)
- The original task instruction (needed so the LLM understands what the fixed code should accomplish)
- A `max_attempts` counter (recommended: 3)

**Workflow:**

1. **Capture failure** — Sandbox returns `exit_code != 0`. Capture stderr (error message) and stdout (partial output if any).
2. **Sanitise error** — Strip file system paths and environment details from stderr (see [`sandboxing-defense`](../protector/sandboxing-defense.md) sanitiser). The LLM needs the error type and message, not the host system layout.
3. **Healing call** — Send to the Data Analyst: original task + failing code + sanitised error message. Ask for a corrected script.
4. **Re-execute** — Submit the corrected script to the sandbox. Increment the attempt counter.
5. **Success** — Exit code 0 and non-empty stdout: self-healing succeeded. Return the result.
6. **Failure continues** — Exit code != 0 again: repeat from step 2 with the new error.
7. **Max attempts reached** — Return `status: failure` with the final error and all attempted scripts logged. Route to human review.

**Failure modes to watch:**
- `HealingLoop` — Caused by: the same error recurring across all healing attempts because the LLM keeps making the same fix. Fix: include all previous failed scripts + errors in the healing call context so the LLM can see what it already tried.
- `NewBugIntroduced` — Caused by: the LLM fixing one error but introducing a new one in a different part of the script. Fix: when the exit code changes but is still non-zero, treat it as a new error — do not count it as a healing success.
- `ContextLoss` — Caused by: sending only the error message without the failing code. Fix: always include the full failing script in the healing call.
- `OverHealingAttempts` — Caused by: no max_attempts guard. Fix: enforce 3 attempts maximum. Log all attempts for post-mortem analysis.

**Integration touchpoints:**
- Triggered by: [`code-execution-pattern`](./code-execution-pattern.md) failure path
- Requires: [`sandboxing-defense`](../protector/sandboxing-defense.md) for re-execution
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — code execution errors are the ideal external feedback signal for the broader reflection loop
- Reports to: [`evaluation-matrix`](../evaluator/evaluation-matrix.md) — healing attempt counts feed into component quality metrics

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each healing call includes: task instruction (~100 tokens) + failing script (~300 tokens) + error (~100 tokens) + all previous attempts (~300 tokens/attempt). A 3-attempt loop uses ~1,500 tokens total.
- **Cost ceiling:** 3 healing attempts = 3 LLM calls + 3 sandbox executions ≈ $0.02 total. Budget as part of the Data Analyst's per-task cost.
- **Model requirement:** Same model as the original code generation step. Do not switch models mid-healing loop — inconsistent code style increases the chance of introducing new errors.
- **Non-determinism:** The same error message may trigger different healing strategies across runs. Some may succeed; some may fail differently. This is acceptable — `max_attempts` is the safety net.
- **Human gate required:** Yes — after `max_attempts` exhausted. A human engineer should review the task, all failed scripts, and all error messages to determine root cause.

---

## 📦 Ready-to-Use Artifact: Self-Healing System Prompt + State Schema

### Option A · Self-Healing System Prompt (Skill Layer)

```markdown
## Role
You are the Data Analyst in a self-healing code loop.
A previous attempt to answer a data question with Python code has failed.
Your job is to diagnose the error and produce a corrected script.

## Original Task
{{ORIGINAL_TASK_INSTRUCTION}}

## Attempt History
{{ATTEMPT_HISTORY}}
Each entry contains: attempt_number, script, error_message.
Study all previous attempts. Do not repeat the same fix that already failed.

## Current Error (Attempt {{CURRENT_ATTEMPT}} of {{MAX_ATTEMPTS}})
Error type: {{ERROR_TYPE}}
Error message: {{ERROR_MESSAGE}}
Failing script:
```python
{{FAILING_SCRIPT}}
```

## Your Diagnosis Process
1. Read the error type and message carefully.
2. Identify the EXACT line causing the error.
3. Determine the root cause — is it: wrong variable name? wrong data structure assumption? missing null check? wrong pandas method?
4. Check attempt history — has this fix been tried before? If yes, try a fundamentally different approach.
5. Write the corrected script.

## Output
ONLY the corrected Python script. No explanation before or after.
The script must include a comment on the line you changed: # FIXED: [one sentence explaining the fix]
```

---

### Option B · Healing State Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SelfHealingState",
  "type": "object",
  "required": ["task_id", "original_task", "current_attempt", "max_attempts", "attempts", "status"],
  "properties": {
    "task_id": { "type": "string" },
    "original_task": { "type": "string" },
    "current_attempt": { "type": "integer", "minimum": 1 },
    "max_attempts": { "type": "integer", "default": 3 },
    "status": {
      "type": "string",
      "enum": ["in_progress", "success", "failed_max_attempts"]
    },
    "attempts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["attempt_number", "script", "exit_code", "stdout", "error_message"],
        "properties": {
          "attempt_number": { "type": "integer" },
          "script": { "type": "string" },
          "exit_code": { "type": "integer" },
          "stdout": { "type": "string" },
          "error_message": { "type": "string" },
          "error_type": { "type": "string" }
        }
      }
    },
    "final_result": {
      "type": ["string", "null"],
      "description": "Populated on success. The stdout of the successful execution."
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`code-execution-pattern`](./code-execution-pattern.md) | Data Analyst | Self-healing is the failure path of code execution |
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Healed scripts are re-executed in the sandbox |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Code self-healing is the most reliable application of reflection |

---

## 📊 Evaluation Checklist

- [ ] Healing loop tested with 10 intentional errors (SyntaxError, KeyError, TypeError, IndexError, AttributeError)
- [ ] Attempt history passed in all healing calls — LLM can see what it already tried
- [ ] Max attempts enforced — loop cannot run indefinitely
- [ ] All failed scripts and errors logged for post-mortem
- [ ] Healing success rate measured: what % of failed scripts recover within 3 attempts?

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "Self-Healing (Reflection)" and "Reflection in Coding" sections.*
*Template version: v1.0.0*
