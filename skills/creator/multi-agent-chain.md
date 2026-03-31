# Skill: Multi-Agent Chain

**Role:** Creator + Orchestrator
**Phase:** Orchestration → Execution
**Autonomy Level:** Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The Multi-Agent Chain is the linear pipeline pattern where each agent's output becomes the next agent's input — a relay race where information flows sequentially from gathering to analysis to creation to evaluation. It is the simpler of the two multi-agent communication patterns (the other being Manager-led orchestration) and the right choice when each step genuinely depends on the full output of the previous step, with no opportunity for parallelism.

A well-designed chain is defined by what each agent does NOT do: the Researcher does not write; the Creator does not retrieve; the Evaluator does not create. These boundaries prevent context bleed, simplify debugging, and make each agent independently replaceable.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** The chain makes failure attribution trivial. When the final output is wrong, you check the chain links in order and find the exact agent where quality degraded. Without the chain, a monolithic agent's failure is a black box.
- **Cost implication:** Chain structure enables model-tier routing: cheap models for simple links (keyword extraction, formatting), expensive models only where reasoning is needed (synthesis, planning). Typical savings: 40–60% vs. running all steps on a frontier model.
- **Latency implication:** Sequential chains add latency equal to the sum of all agent call times. For latency-sensitive use cases, evaluate whether any chain links can be parallelised (they often can for the research phase).
- **When to skip this:** When steps are fully independent and can run in parallel — use Manager-led coordination instead. The chain's sequential constraint only makes sense when each step requires the previous step's complete output.

---

## 🛠️ How it Works (The Engineering Perspective)

**The Standard Research → Analyse → Create → Evaluate Chain:**

```
User Query
    ↓
[Researcher]  — ReAct loop, web search + RAG → research_output
    ↓
[Data Analyst] — Code execution, statistical analysis → analysis_output
    ↓
[Creator]     — Synthesis, formatting → draft_output
    ↓
[Evaluator]   — Reflection + Judge → final_output or reject_with_feedback
    ↓
User
```

**Chain State Object (passed between all links):**

```json
{
  "session_id": "chain-abc123",
  "user_query": "Analyse Coreitera's Q3 2025 revenue vs Q2 and explain the trend",
  "chain_links": [
    {
      "agent": "researcher",
      "status": "success",
      "result": "...",
      "sources": ["database_query", "web_search"],
      "completed_at": "2026-03-31T10:00:01Z"
    },
    {
      "agent": "data_analyst",
      "status": "success",
      "result": "{\"q3_revenue\": 4200000, \"q2_revenue\": 3560000, \"growth\": 17.98}",
      "completed_at": "2026-03-31T10:00:04Z"
    }
  ],
  "current_link": "creator",
  "final_output": null
}
```

**Workflow:**

1. **Initialise chain state** — Create the state object with session_id and user_query.
2. **Execute Link 1 (Researcher)** — Run the Researcher with the user query. Append output to chain_links.
3. **Gate check** — Is the Researcher output `status: success` with `confidence: high`? If no — either retry or route to human review. Never pass low-confidence research forward.
4. **Execute Link 2 (Analyst)** — Pass the Researcher output as `input_data`. Append output.
5. **Gate check** — Same pattern. A failed analysis should not reach the Creator.
6. **Execute Link 3 (Creator)** — Pass the full `chain_links` array. Creator reads both research and analysis. Produces draft.
7. **Execute Link 4 (Evaluator)** — Reflection cycle on the draft using the original user_query as the task instruction.
8. **Final gate** — If Evaluator labels `pass`: deliver to user. If `fail`: route back to Creator with critique (max 1 revision cycle before human escalation).

**Failure modes to watch:**
- `CascadingFailure` — Caused by: passing a failed link's output to the next link without checking status. Fix: mandatory gate check between every link. Never skip.
- `ContextAccumulation` — Caused by: passing the entire chain_links history to every subsequent agent, consuming context budget unnecessarily. Fix: each agent receives only its direct input, not the full chain history. The Orchestrator manages the state.
- `LinkSkipping` — Caused by: skipping the Evaluator "to save time." Fix: Evaluator is not optional in a production chain. Document this rule in CONTRIBUTING.md.

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each chain link adds its output to the state object. Total state size should stay under 4,000 tokens. Summarise large intermediate outputs before passing downstream.
- **Cost ceiling:** 4-link chain (Researcher + Analyst + Creator + Evaluator) = minimum 4 LLM calls. With tool calls and reflection: 8–12 calls total. Estimate per-chain cost explicitly.
- **Model requirement:** Varies per link. See individual skill pages for model tier recommendations.
- **Non-determinism:** The chain is only as deterministic as its most non-deterministic link. Use temperature=0 for Analyst and Evaluator links where consistency is critical.
- **Human gate required:** Yes — before the final output leaves the system for any external action (publication, sending, billing).

---

## 📦 Ready-to-Use Artifact: Chain Orchestration Config

### Option B · Chain Definition Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChainDefinition",
  "description": "Declarative definition of a multi-agent chain pipeline",
  "type": "object",
  "required": ["chain_id", "name", "links"],
  "properties": {
    "chain_id": { "type": "string" },
    "name": { "type": "string" },
    "links": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["order", "agent_role", "skill_ref", "input_from", "gate_policy"],
        "properties": {
          "order": { "type": "integer", "minimum": 1 },
          "agent_role": { "type": "string", "enum": ["researcher", "data_analyst", "creator", "evaluator"] },
          "skill_ref": { "type": "string", "description": "Path to the skill markdown file this link uses" },
          "model": { "type": "string", "description": "Model to use for this link" },
          "input_from": {
            "type": "string",
            "description": "Source of input: 'user_query' | 'previous_link' | 'link_N'"
          },
          "gate_policy": {
            "type": "string",
            "enum": ["pass_on_success", "pass_always", "require_human_approval"],
            "description": "What to do with the output before passing to the next link"
          }
        }
      }
    }
  },
  "example": {
    "chain_id": "research-report-v1",
    "name": "Research + Analysis + Report Chain",
    "links": [
      { "order": 1, "agent_role": "researcher", "skill_ref": "skills/researcher/react-pattern.md", "model": "gpt-4o", "input_from": "user_query", "gate_policy": "pass_on_success" },
      { "order": 2, "agent_role": "data_analyst", "skill_ref": "skills/data-analyst/code-execution-pattern.md", "model": "gpt-4o", "input_from": "previous_link", "gate_policy": "pass_on_success" },
      { "order": 3, "agent_role": "creator", "skill_ref": "skills/creator/synthesis-output.md", "model": "claude-3-5-sonnet", "input_from": "previous_link", "gate_policy": "pass_on_success" },
      { "order": 4, "agent_role": "evaluator", "skill_ref": "skills/evaluator/reflection-pattern.md", "model": "gpt-4o", "input_from": "previous_link", "gate_policy": "require_human_approval" }
    ]
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`multi-agent-coordination`](../orchestrator/multi-agent-coordination.md) | Orchestrator | Manager-led pattern — use when parallelism is needed |
| [`synthesis-output`](./synthesis-output.md) | Creator | Creator is the third link in the standard chain |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Evaluator is always the final link |

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "The Linear Workflow (Chain)" section.*
*Template version: v1.0.0*
