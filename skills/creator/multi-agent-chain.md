# Skill: Multi-Agent Chain

**Role:** Creator (Writer / Designer)
**Phase:** Orchestration → Execution
**Autonomy Level:** Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The Multi-Agent Chain is the linear workflow pattern where specialised agents are connected in a relay sequence: the output of each agent becomes the input for the next. Each agent has a single, bounded responsibility — Researcher finds data, Data Analyst processes it, Creator synthesises it — and no agent can reach back to modify a previous agent's work or skip ahead.

The chain pattern is the simplest and most reliable multi-agent architecture. It trades flexibility for predictability: you always know exactly how many LLM calls will be made, in what order, and what each produces. For tasks with a clear, linear dependency structure, it is the correct choice over manager-led orchestration — which adds planning overhead and variance with no benefit when the task flow is already well-defined.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A chain is the production-ready multi-agent pattern for well-understood, repeatable workflows. Report generation, document summarisation, data-to-narrative pipelines — these are all naturally linear and benefit from the chain's predictability and debuggability.
- **Cost implication:** A 3-agent chain has exactly 3 LLM calls. Cost is fully predictable and budgetable. There are no "surprise" manager calls or reflection iterations unless explicitly added.
- **Latency implication:** Sequential by design — total latency = sum of all agent latencies. If parallelism is needed, use the parallel fan-out pattern instead (see [`agentic-workflow-design`](../product-manager/agentic-workflow-design.md)).
- **When to skip this:** When the task has conditional branching ("if research finds X, change the approach"), retry logic at the chain level, or when agent B needs to inform agent A's work. Use manager-led orchestration for those cases.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A defined sequence of agents with typed input/output contracts at each boundary
- Each agent's output schema validated before passing to the next agent
- A chain-level `session_id` that threads through every agent for traceability

**Workflow:**

1. **Define the chain** — List the agents in sequence with their roles, input sources, and output targets. Each agent's output schema must match the next agent's input schema.
2. **Agent 1 executes** — Receives user intent + tool access. Produces a structured JSON output.
3. **Validate boundary** — The orchestrator validates Agent 1's output against Agent 2's input schema. On failure: retry Agent 1 once, then escalate.
4. **Agent 2 executes** — Receives Agent 1's validated output as its primary input. Produces its own structured JSON output.
5. **Continue chain** — Repeat for each subsequent agent.
6. **Terminal agent (Creator)** — The final agent in the chain always produces the user-facing output. Its output is routed through the [`reflection-pattern`](../evaluator/reflection-pattern.md) before delivery.
7. **Chain-level error handling** — If any agent produces a terminal failure (after retries), the chain halts and surfaces the failure point with its full input/output context.

**Standard Chain Configurations:**

| Chain Name | Agent Sequence | Use Case |
|---|---|---|
| Research → Synthesis | Researcher → Creator | Quick summarisation of a specific topic |
| Research → Analyse → Synthesise | Researcher → Data Analyst → Creator | Data-driven report generation |
| Retrieve → Validate → Synthesise | RAG Researcher → Evaluator → Creator | Knowledge-base grounded content |
| Search → Code → Synthesise | Web Researcher → Data Analyst → Creator | Competitive analysis with metrics |

**Failure modes to watch:**
- `BoundaryMismatch` — Caused by: Agent 1's output schema not matching Agent 2's input schema. Fix: define and validate schemas at every boundary. Never pass raw LLM text between agents — always use JSON contracts.
- `ErrorPropagation` — Caused by: Agent 1 producing a low-quality output that Agent 2 processes without complaint, producing a plausible-looking but wrong final output. Fix: add a validation gate at each boundary — not just schema validation but semantic validation (are required fields non-empty? Are confidence levels acceptable?).
- `ChainOverextension` — Caused by: adding agents to the chain that could be handled by extending an existing agent's responsibility. Fix: only add a new agent when the new responsibility requires different tools or a different system prompt — not just a longer prompt.

**Integration touchpoints:**
- Uses: [`synthesis-output`](./synthesis-output.md) — the Creator is always the terminal agent
- Uses: [`react-pattern`](../researcher/react-pattern.md) — Researcher agents in the chain use the ReAct loop
- Uses: [`reflection-pattern`](../evaluator/reflection-pattern.md) — terminal output gate
- Designed by: [`agentic-workflow-design`](../product-manager/agentic-workflow-design.md) — chain selection is a PM + Architect decision

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each agent in the chain should receive only the outputs it directly needs — not the full history of all previous agents. Pass processed summaries, not raw tool outputs, across chain boundaries.
- **Cost ceiling:** N-agent chain = N LLM calls minimum. Document the expected call count and cost per chain execution. Get PM approval for chains with > 5 agents.
- **Model requirement:** Each agent in the chain can use a different model optimised for its role. Researcher: capable model with tool use. Data Analyst: code-capable model. Creator: high-quality prose model. Mix strategically.
- **Non-determinism:** Each agent in the chain introduces independent non-determinism. Variance compounds across agents. For high-stakes chains, run the full chain 3× and use majority voting on the Creator's output.
- **Human gate required:** Yes — at the boundary before any agent with `side_effects: true`. Never allow a chain to autonomously pass through a side-effect agent without a human gate.

---

## 📦 Ready-to-Use Artifact: Chain Definition Schema + Boundary Validator

### Option B · JSON Schema (Chain Definition)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentChainDefinition",
  "description": "Defines a linear multi-agent chain with typed boundaries",
  "type": "object",
  "required": ["chain_id", "chain_name", "agents"],
  "properties": {
    "chain_id": { "type": "string", "description": "Unique chain identifier. Format: chain-[name]-[version]" },
    "chain_name": { "type": "string" },
    "description": { "type": "string", "description": "One sentence: what this chain produces and when to use it" },
    "agents": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["position", "role", "skill_ref", "input_from", "output_schema", "side_effects"],
        "properties": {
          "position": { "type": "integer", "minimum": 1, "description": "Execution order. 1 = first." },
          "role": { "type": "string", "enum": ["researcher", "data-analyst", "creator", "evaluator", "orchestrator"] },
          "skill_ref": { "type": "string", "description": "Skill page reference. e.g. 'skills/researcher/react-pattern.md'" },
          "input_from": { "type": "string", "enum": ["user", "previous_agent"], "description": "Where this agent's primary input comes from" },
          "output_schema": { "type": "object", "description": "JSON Schema for this agent's output. Must match next agent's expected input." },
          "side_effects": { "type": "boolean", "description": "true = human gate required before this agent executes" },
          "model_preference": { "type": "string", "description": "Preferred model for this agent. e.g. 'claude-sonnet', 'gpt-4o-mini'" },
          "max_retries": { "type": "integer", "default": 1, "description": "Max retries on failure before chain halts" }
        }
      }
    },
    "terminal_agent_position": { "type": "integer", "description": "Position of the final agent (Creator). Its output routes to the user." },
    "evaluation_gate": { "type": "boolean", "default": true, "description": "If true, terminal output passes through reflection-pattern before delivery." }
  }
}
```

### Option A · Example Chain Definition (Skill Layer — Research → Synthesise)

```markdown
## Chain: Research → Synthesise
**chain_id:** chain-research-synthesise-v1
**description:** Takes a topic query, researches it via web search and RAG, then produces a structured report.

### Agent 1: Researcher
- **Role:** researcher
- **Skill:** skills/researcher/react-pattern.md
- **Input:** User query
- **Output:** { "findings": [...], "citations": [...], "confidence": "high|medium|low" }
- **Side effects:** false
- **Model:** claude-sonnet (needs tool use + reasoning)

### Agent 2: Creator
- **Role:** creator
- **Skill:** skills/creator/synthesis-output.md
- **Input:** Agent 1 output as `research_findings`
- **Output:** Structured report in the user-specified format
- **Side effects:** false
- **Model:** claude-sonnet (needs high-quality prose generation)

### Terminal Gate
- Output of Agent 2 → reflection-pattern → user delivery
- Human gate required if: output will be published externally

### Boundary Contract
Agent 1 output MUST contain:
- `findings`: array with at least 1 item
- `citations`: array (may be empty)
- `confidence`: "high" | "medium" | "low"

If Agent 1 output fails validation:
- Retry Agent 1 once with an expanded query
- If still failing: halt chain, return { "status": "INSUFFICIENT_DATA", "reason": "..." }
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`synthesis-output`](./synthesis-output.md) | Creator | Always the terminal agent in a chain |
| [`react-pattern`](../researcher/react-pattern.md) | Researcher | Researcher agents in the chain use this loop |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Terminal output gate before user delivery |
| [`agentic-workflow-design`](../product-manager/agentic-workflow-design.md) | Product Manager | Chain is one of four patterns — selected based on task structure |
| [`multi-agent-coordination`](../orchestrator/multi-agent-coordination.md) | Orchestrator | Manager-led alternative when chain's linear structure is insufficient |

---

## 📊 Evaluation Checklist

- [ ] Every chain boundary has an explicit JSON schema — no untyped text passing
- [ ] Boundary validation tested — invalid Agent 1 output correctly triggers retry/halt
- [ ] Side-effect gates verified — chain pauses at every `side_effects: true` agent
- [ ] Cost per chain execution documented and approved by PM
- [ ] Terminal output routed through reflection — verified in integration test
- [ ] Chain tested end-to-end with 10 real user queries before production

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "The Linear Workflow (Chain)" and "Communication Patterns" sections.*
*Template version: v1.0.0*
