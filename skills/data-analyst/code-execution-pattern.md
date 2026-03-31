# Skill: Code Execution Pattern

**Role:** Data Analyst (Coder)
**Phase:** Execution
**Autonomy Level:** Semi
**Layer:** Skill Layer (Markdown/JSON) + Tool Layer (Go MCP)

---

## 📖 What is it?

The Code Execution Pattern replaces a library of brittle, hard-coded calculation tools with a single "master tool": the ability to write and execute Python code in a sandboxed environment. Instead of building individual functions for `calculate_revenue_delta()`, `filter_by_date_range()`, `compute_top_3()`, and hundreds more edge cases, the Data Analyst agent writes a Python script on-the-fly using pandas, NumPy, or any standard library — and executes it to get an exact, deterministic answer.

This pattern works because LLMs are trained on millions of lines of Python code and are exceptionally good at writing correct data manipulation scripts. The switch from "ask the LLM to calculate math" to "ask the LLM to write code that calculates math" dramatically increases accuracy — code is verifiable, LLM arithmetic is not.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Eliminates an entire category of agent failure: hallucinated numerical answers. An agent that writes and runs `df.groupby('product')['revenue'].sum().nlargest(3)` cannot produce a wrong top-3 — the code either runs correctly or it errors, triggering the self-healing loop.
- **Cost implication:** One `execute_python` tool replaces 50–100 specialised calculator endpoints, each requiring maintenance. Engineering cost reduction is significant.
- **Latency implication:** Code execution adds 300ms–2s depending on data size. This is deterministic latency — predictable and cacheable for repeated query patterns.
- **When to skip this:** Simple lookups with no computation (return a config value, format a string). Code execution overhead is not justified when the answer requires no calculation.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A sandboxed Python execution environment (Docker or E2B — see [`sandboxing-defense`](../protector/sandboxing-defense.md))
- Pre-loaded libraries in the sandbox image: pandas, numpy, json, datetime (no internet access)
- Data passed to the sandbox via the `/workspace` directory or as a JSON-encoded parameter
- A self-healing loop: if the code fails, the error log is fed back to the LLM for correction

**Workflow:**

1. **Analyst receives task** — "Which product had the highest revenue growth in Q3 vs Q2?"
2. **LLM writes Python** — Generates a script using comments to outline the plan, then implements it. Comments serve as the "plan" embedded in the code.
3. **Submit to sandbox** — The script is passed to the `sandbox_execute_code` tool (see [`sandboxing-defense`](../protector/sandboxing-defense.md)).
4. **Execute and capture** — The sandbox runs the script. Stdout (the result) and stderr (any errors) are captured.
5. **Success path** — Stdout contains the result. The Analyst formats it and passes to the Orchestrator.
6. **Failure path (self-healing)** — Stderr contains the error. The LLM reads the error message and generates a corrected script. Max 3 attempts.
7. **Hard failure** — After 3 failed attempts, return `status: failure` with the final error message for human review.

**Failure modes to watch:**
- `ImportError` — Caused by: LLM trying to import a library not available in the sandbox image. Fix: include the list of available libraries in the Data Analyst system prompt.
- `DataNotFound` — Caused by: LLM assuming data is available in a variable that wasn't passed in. Fix: always explicitly pass data as a parameter or pre-load it in the sandbox working directory.
- `InfiniteLoop` — Caused by: LLM writing a `while True` loop. Fix: sandbox execution timeout (30s hard limit) handles this.
- `OutputNotPrinted` — Caused by: LLM computing the result but not printing it to stdout. Fix: include in the system prompt: "Always print your final result to stdout using print(). Do not just assign it to a variable."
- `PrecisionError` — Caused by: LLM writing floating-point arithmetic without rounding. Fix: add "Round all monetary values to 2 decimal places" to task constraints.

**Integration touchpoints:**
- Requires: [`sandboxing-defense`](../protector/sandboxing-defense.md) — all code execution must run in a sandbox
- Used within: [`react-pattern`](../researcher/react-pattern.md) — code execution is a TOOL_CALL in the ReAct loop
- Feeds into: [`self-healing-code`](./self-healing-code.md) — failure path triggers self-healing
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — execution errors are the best external feedback signal

---

## ⚠️ Constraints & Guardrails

- **Context window:** The generated Python script adds ~200–500 tokens. The script + data + error logs in a 3-attempt self-healing loop add ~2,000 tokens. Fits in standard context windows.
- **Cost ceiling:** Code generation call ≈ $0.005. Sandbox execution ≈ $0.001–0.003. Total per code task: ~$0.008. For 3-attempt self-healing: ~$0.02 maximum.
- **Model requirement:** GPT-4o or Claude 3.5 Sonnet for code generation — these models produce working Python reliably. Smaller models generate code that fails on the first execution more often.
- **Non-determinism:** Given the same task and data, the LLM may generate different (but equally correct) code across runs. This is acceptable — correctness is verified by execution, not by code matching.
- **Human gate required:** Yes — any code that writes to a file path outside `/workspace`, makes network calls, or uses system modules (`os`, `subprocess`). The sandbox blocks these at execution, but the Protector should block them at generation.

---

## 📦 Ready-to-Use Artifact: Data Analyst System Prompt

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Data Analyst. Your single responsibility is:
Receive a data analysis question, write Python code to answer it exactly, and return the result.

You NEVER estimate numerical answers. You ALWAYS compute them with code.

## Available Libraries
pandas, numpy, json, datetime, math, statistics, collections
No internet access. No file system access outside /workspace.

## Input Data
Data is provided as JSON in the `input_data` field.
Load it in your script: `import json; data = json.loads(INPUT_DATA_JSON)`

## Your Process
1. Understand the question exactly. What number/list/comparison is needed?
2. Write Python code with comments outlining your plan:
   # Step 1: Load and parse the data
   # Step 2: Filter/group as needed
   # Step 3: Compute the answer
   # Step 4: Print the result
3. Always end with: print(json.dumps({"result": YOUR_ANSWER, "unit": "IDR | % | count | etc"}))
4. If the data is missing a required field, print: print(json.dumps({"error": "missing field: FIELD_NAME"}))

## Output Format
Your response is ONLY the Python script. No explanation before or after.
The script must produce its answer via print() to stdout.

## Hard Constraints
- NEVER use os, subprocess, sys, or any system module
- NEVER import libraries not in the available list
- NEVER make network calls
- NEVER access file paths outside /workspace
- ALWAYS round monetary values to 2 decimal places
- ALWAYS print() your final result — do not just assign it to a variable
```

---

### Option B · Code Execution Task Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CodeExecutionTask",
  "type": "object",
  "required": ["task_id", "question", "input_data"],
  "properties": {
    "task_id": { "type": "string" },
    "question": {
      "type": "string",
      "description": "The specific analytical question to answer with code."
    },
    "input_data": {
      "type": "string",
      "description": "JSON-encoded data the script will process. Passed as INPUT_DATA_JSON variable."
    },
    "output_type": {
      "type": "string",
      "enum": ["number", "list", "comparison", "table", "boolean"],
      "description": "Expected shape of the answer. Guides the LLM's output formatting."
    },
    "constraints": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Additional constraints: ['round to 2 decimals', 'IDR currency', 'exclude nulls']"
    },
    "max_attempts": {
      "type": "integer",
      "default": 3,
      "description": "Maximum self-healing attempts before returning status: failure."
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | All code execution routes through sandboxing — non-negotiable |
| [`self-healing-code`](./self-healing-code.md) | Data Analyst | Failure path triggers self-healing loop |
| [`react-pattern`](../researcher/react-pattern.md) | Researcher | Code execution is a TOOL_CALL within the ReAct loop |

---

## 📊 Evaluation Checklist

- [ ] System prompt tested with 20 real data analysis questions from your domain
- [ ] `print()` output requirement verified — scripts that don't print are caught
- [ ] Self-healing loop tested with intentional syntax errors
- [ ] Sandbox timeout tested — infinite loops are killed within 30s
- [ ] Available library list accurate — no ImportErrors in production

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "The 'Swiss Army Knife' Approach: Code Execution" section.*
*Template version: v1.0.0*
