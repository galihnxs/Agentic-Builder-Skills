# Skill: Code Execution Pattern

**Role:** Data Analyst (Coder)
**Phase:** Execution
**Autonomy Level:** Semi → High
**Layer:** Tool Layer (Go MCP) + Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The Code Execution Pattern is the "Swiss Army Knife" approach to agent tooling: instead of building dozens of brittle, hard-coded tools for every possible math operation or data transformation, you give the LLM access to a single `execute_code` tool backed by a Python interpreter. The LLM writes the exact code needed to solve the problem, the system executes it in a sandbox, and the result flows back as an Observation.

This pattern is grounded in a clear performance hierarchy from research: agents that write and execute code outperform agents that use JSON-structured tool calls, which outperform agents that reason in plain text. Code is the most expressive, precise, and powerful action format available to an LLM — and modern LLMs are trained on millions of lines of code, making them natively fluent in it.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** One `execute_python` tool replaces hundreds of specialized calculator tools. A data analyst agent can compute revenue deltas, run statistical tests, generate charts, and parse JSON — all with a single registered tool and zero additional engineering per new operation type.
- **Cost implication:** Eliminates the engineering cost of building and maintaining bespoke tools for each data operation. New analytical capability = new Python library, not new tool endpoint.
- **Latency implication:** Code execution adds 200ms–2s per run (sandbox startup + execution). For complex multi-step analyses, this is far faster than chaining 5 separate API calls to specialized tools.
- **When to skip this:** Simple, atomic operations with a stable, well-defined API (e.g., "look up this database record by ID"). A direct tool call is cheaper and more predictable than spinning up a code execution environment for a single key-value lookup.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A sandboxed execution environment (see [`sandboxing-defense`](../protector/sandboxing-defense.md)) — **mandatory**
- The LLM system prompt instructing it to output code in a specific tagged format
- A regex extractor that pulls code from the LLM's response before passing it to the sandbox
- A self-healing loop: if the code fails, the error log is passed back to the LLM for a fix (see [`self-healing-code`](./self-healing-code.md))

**Workflow:**

1. **Task arrives** — The Data Analyst receives a task requiring computation, data transformation, or analysis that cannot be expressed as a simple tool call.
2. **Code generation** — The LLM generates Python code inside a designated block. It uses comments to outline the plan: `# Step 1: Load data`, `# Step 2: Calculate delta`.
3. **Extract** — The system uses a regex to extract the code from the LLM's response. Validates that it's syntactically parseable before sending to the sandbox.
4. **Execute in sandbox** — The extracted code runs inside the sandboxed environment (Docker/E2B). stdout is captured. stderr is captured separately.
5. **Return result** — On success: stdout is returned as the Observation. On failure: the stderr error log is returned as the Observation, triggering the self-healing loop.
6. **Self-healing** — If the code failed, the LLM receives the error log and generates a corrected version. Max 2 self-healing iterations before escalating.

**Failure modes to watch:**
- `CodeEscape` — Caused by: code attempting filesystem operations, network calls, or shell commands. Fix: all execution routes through [`sandboxing-defense`](../protector/sandboxing-defense.md) with deny-list pre-filtering.
- `HallucinatedLibrary` — Caused by: LLM using a Python library not installed in the sandbox. Fix: maintain a curated allow-list of pre-installed libraries (pandas, numpy, matplotlib, json, math, datetime) and include it in the system prompt.
- `OutputTruncation` — Caused by: code generating massive stdout (printing entire DataFrames). Fix: instruct the LLM to output only summary results, never raw data dumps. Apply `max_output_chars=2000` in the sandbox.
- `InfiniteLoop` — Caused by: code with an unbounded loop. Fix: enforce the sandbox execution timeout (30s hard limit) at the infrastructure level.

**Integration touchpoints:**
- Requires: [`sandboxing-defense`](../protector/sandboxing-defense.md) — all code execution routes through this
- Feeds into: [`self-healing-code`](./self-healing-code.md) — failures trigger the self-healing loop
- Receives from: [`task-decomposition`](../orchestrator/task-decomposition.md) — CODE_EXECUTION blocks route here
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — code output is the external feedback signal

---

## ⚠️ Constraints & Guardrails

- **Context window:** Generated code + execution result adds ~500–1,500 tokens per iteration. Cap self-healing at 2 iterations to prevent context explosion.
- **Cost ceiling:** Sandbox execution: ~$0.001–0.003 per run (E2B). LLM code generation: ~$0.005–0.02 per call. Total per analysis: $0.01–0.05. Acceptable for background processing; high for real-time user-facing flows.
- **Model requirement:** Requires a model with strong code generation capability. Claude Sonnet, GPT-4o, or Gemini 1.5 Pro. Do not use smaller models (Haiku, GPT-4o-mini) for complex multi-step code generation — syntax error rates are significantly higher.
- **Non-determinism:** The same task prompt may generate different but functionally equivalent code across runs. Results should be deterministic (same input → same output) even if the code differs.
- **Human gate required:** Yes — for any code that writes to a persistent location, calls an external API, or modifies shared state. Pure computation (reading + calculating + returning) does not require a gate.

---

## 📦 Ready-to-Use Artifact: Code Execution Agent System Prompt

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Data Analyst in a multi-agent system. Your single responsibility is:
Solve data, math, and analytical problems by writing and executing Python code.

You NEVER approximate or guess numerical results. You ALWAYS compute them exactly.

## Available Python Libraries
You may ONLY use these pre-installed libraries:
- pandas, numpy, matplotlib, seaborn (data and charts)
- json, csv, datetime, re, math, statistics (standard operations)
- requests (HTTP — only to pre-approved internal endpoints, never external URLs)

Do NOT import any library not on this list. The sandbox will reject it.

## Code Format
Wrap ALL code in this exact block — no prose inside:

```python
# Step 1: [what this step does]
[code]

# Step 2: [what this step does]
[code]

# Final output — always print a clean summary, never raw DataFrames
print(json.dumps(result, indent=2))
```

## Rules
1. ALWAYS print the final result as JSON to stdout
2. NEVER print raw DataFrames or arrays — summarise them
3. NEVER write to files or call external URLs unless explicitly instructed
4. If data is passed as input, it will be available as the variable `input_data` (pre-loaded)
5. If your code fails, read the error message carefully — fix the specific error, not the whole code

## Output After Execution
After seeing the code result, respond with:
{
  "result": [the computed answer],
  "method": "one sentence describing the computation performed",
  "confidence": "high",
  "next_action": "return_to_orchestrator"
}
```

### Option B · JSON Schema (Code Execution Task)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CodeExecutionTask",
  "type": "object",
  "required": ["task_id", "instruction", "input_data"],
  "properties": {
    "task_id": { "type": "string", "description": "Unique task ID. Format: code-[uuid4]" },
    "instruction": { "type": "string", "description": "What to compute or analyse. Be specific about the expected output format." },
    "input_data": {
      "type": ["object", "array", "string", "null"],
      "description": "Data to analyse. Will be available as `input_data` variable in the Python sandbox."
    },
    "output_format": {
      "type": "string",
      "enum": ["json", "number", "string", "chart_path"],
      "description": "Expected output format. 'chart_path' = code generates a PNG and returns the file path."
    },
    "max_iterations": {
      "type": "integer",
      "default": 2,
      "description": "Max self-healing iterations if code fails. Recommended: 2."
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Mandatory — all code routes through the sandbox |
| [`self-healing-code`](./self-healing-code.md) | Data Analyst | Error recovery loop triggered by code failures |
| [`sandbox-setup`](./sandbox-setup.md) | Data Analyst | Environment configuration for code execution |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Code execution results are the gold standard external feedback signal |

---

## 📊 Evaluation Checklist

- [ ] Code extraction regex tested — handles code blocks with and without language tags
- [ ] Allow-list of libraries enforced — import of unlisted library returns clear error
- [ ] Output JSON format verified — LLM always prints structured JSON, never raw DataFrame
- [ ] Self-healing tested with 10 intentionally buggy code prompts — fixes within 2 iterations
- [ ] Sandbox timeout verified — infinite loops killed within 30s hard limit
- [ ] All executions routed through sandboxing-defense — zero direct execution paths

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "The Swiss Army Knife Approach: Code Execution" and "The Performance Hierarchy" sections.*
*Template version: v1.0.0*
