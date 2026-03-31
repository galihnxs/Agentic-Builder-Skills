# Skill: Agentic Workflow Design

**Role:** Lead PM
**Phase:** Design
**Autonomy Level:** Semi (design pattern selection)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Agentic Workflow Design is the process of choosing the right architecture pattern for a specific task — before any code is written. It maps a user's goal to one of four foundational patterns: a **Linear Chain** (relay race), a **Manager-Led Orchestration** (hub and spoke), a **Parallel Fan-Out** (concurrent independent tasks), or a **ReAct Loop** (single agent with tool access). The wrong pattern for a task creates unnecessary complexity; the right pattern makes the system maintainable and scalable.

The key insight is that an agentic workflow takes longer to execute than a single LLM call but delivers significantly higher quality — because it mimics how humans actually work: plan, research, draft, reflect, revise. The PM's job is to justify that quality-latency tradeoff for each workflow, and pick the simplest pattern that achieves the required quality.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** The wrong pattern creates technical debt that compounds. A linear chain built for a task that actually needs manager-led orchestration will require a full rewrite when edge cases emerge. Pattern selection upfront prevents this.
- **Cost implication:** Linear chains are cheapest (fixed number of LLM calls). Manager-led orchestration adds the manager's LLM calls. ReAct loops scale cost with the number of tool calls. Match the pattern to the acceptable cost ceiling.
- **Latency implication:** Parallel fan-out can reduce latency by 50–70% on independent multi-source tasks. Linear chains have the most predictable latency. Manager-led orchestration has the highest variance.
- **When to skip this:** Single-step tasks with no sequencing requirements. If the task maps cleanly to one LLM call + one tool call, a workflow pattern adds overhead with no benefit.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A scored feasibility assessment (see [`feasibility-framework`](./feasibility-framework.md))
- A decomposed block list (see [`task-decomposition`](../orchestrator/task-decomposition.md))
- An understanding of which blocks are independent (parallelisable) vs. dependent (sequential)

**Workflow:**

1. **Identify dependency structure** — From the decomposed blocks, draw the dependency graph. Are most blocks sequential (A → B → C)? Are some independent (B and C can run while A is running)?
2. **Select the pattern** — Use the decision table in the artifact below.
3. **Define agent roles** — For manager-led orchestration: name each sub-agent, its single responsibility, and its tool set. Use specific system prompts, not generic ones.
4. **Define the communication protocol** — How do agents pass data? Structured JSON (recommended) or natural language (acceptable for simple chains, fragile at scale)?
5. **Define failure handling** — What happens if sub-agent B fails? Does the manager retry, skip, or escalate to human review?
6. **Document the pattern choice** — Write one paragraph justifying the selected pattern over the alternatives. This becomes the architecture decision record.

**Pattern Quick Reference:**

| Pattern | Use when | Cost | Latency | Reliability |
|---|---|---|---|---|
| Linear Chain | Steps are fully sequential, each depends on previous | Low | Predictable | High (simple to debug) |
| Manager-Led | Complex tasks needing reflection, revision, or dynamic routing | High | Variable | Medium (manager adds LLM variance) |
| Parallel Fan-Out | Multiple independent data sources or subtasks | Medium | Low (concurrent) | High per branch |
| ReAct Loop | Single agent needs iterative tool access to answer one question | Medium | Variable | Medium |

**Failure modes to watch:**
- `PatternMismatch` — Caused by: using a linear chain for a task that needs the manager to reflect and revise mid-execution. Fix: if the task has conditional logic ("if research finds X, change the approach"), it needs manager-led orchestration.
- `AgentRoleDrift` — Caused by: sub-agents given vague system prompts that allow them to exceed their bounded responsibility. Fix: every sub-agent system prompt must include a "you ONLY do X" constraint.
- `CommunicationFragility` — Caused by: agents passing natural language between each other instead of structured JSON. Fix: enforce JSON contracts at every agent boundary.

---

## ⚠️ Constraints & Guardrails

- **Context window:** Multi-agent workflows must manage context carefully. Each sub-agent should receive only the context scoped to its task — not the full session history. History contamination causes agents to drift from their assigned role.
- **Cost ceiling:** Manager-led orchestration can easily double the LLM call count vs. a linear chain (manager call + sub-agent call per step). Get explicit budget approval before choosing this pattern.
- **Model requirement:** The Manager agent benefits from a reasoning model. Sub-agents can use cheaper, faster models if their tasks are well-scoped.
- **Non-determinism:** Manager-led orchestration has the highest non-determinism — the manager may produce different sub-task assignments for the same input. Add a `plan_hash` to the execution trace to detect plan variance across runs.
- **Human gate required:** Yes — before the manager agent delegates to any sub-agent with `side_effects: true`. The manager cannot autonomously approve its own delegation of side-effect tasks.

---

## 📦 Ready-to-Use Artifact: Pattern Selection Guide + Agent Persona Template

### Option A · Pattern Selection System Prompt (Skill Layer)

```markdown
## Role
You are the Workflow Architect. Given a task description and its decomposed blocks,
select the most appropriate agentic workflow pattern and define the agent roles.

## Pattern Options

### Linear Chain
Use when: Every block depends on the previous block's output. No parallelism is possible.
Structure: Agent A → Agent B → Agent C
Example: Fetch data → Analyse → Write report

### Manager-Led Orchestration
Use when: The task requires conditional logic, reflection, or revision mid-execution.
The manager can re-plan based on sub-agent outputs.
Structure: Manager → [Researcher, Analyst, Writer] → Manager synthesises
Example: Research (may need more depth) → Draft → Review → Conditionally revise

### Parallel Fan-Out
Use when: Multiple blocks are fully independent and can run concurrently.
Structure: Orchestrator fans out → [Agent A, Agent B, Agent C] run concurrently → Merge
Example: Simultaneously search 3 different databases, then synthesise all results

### ReAct Loop
Use when: A single question requires iterative tool access. The number of tool calls is unknown upfront.
Structure: Agent with toolbox → Thought → Action → Observation → repeat
Example: "What is the current competitive positioning of Company X?" — requires multiple searches

## Output Format
{
  "selected_pattern": "linear_chain | manager_led | parallel_fan_out | react_loop",
  "rationale": "One paragraph explaining why this pattern over the alternatives",
  "agents": [
    {
      "name": "Researcher",
      "responsibility": "One sentence. What this agent does and NOTHING ELSE.",
      "tools": ["tool_name_1", "tool_name_2"],
      "receives_from": "orchestrator | manager | previous_agent_name",
      "sends_to": "manager | next_agent_name | user"
    }
  ],
  "communication_format": "json",
  "failure_policy": "retry_once | skip_and_continue | escalate_to_human"
}

## Hard Constraints
- NEVER assign more than one primary responsibility to a sub-agent
- ALWAYS use JSON as the inter-agent communication format
- NEVER select manager_led if linear_chain is sufficient
- NEVER select react_loop for a task where the number of tool calls is known upfront
```

### Option B · Agent Role Template (JSON)

```json
{
  "agent_name": "Researcher",
  "version": "v1.0.0",
  "pattern": "manager_led",
  "responsibility": "Find the top 3 recent developments on a given topic using web search. Nothing else.",
  "system_prompt_key": "skills/researcher/react-pattern.md",
  "tools": ["web_search", "web_fetch"],
  "input_contract": {
    "topic": "string — the specific topic to research",
    "max_sources": "integer — maximum number of sources to retrieve. Default: 5",
    "date_range_days": "integer — only consider sources from the last N days. Default: 30"
  },
  "output_contract": {
    "findings": "array of {source_url, summary, relevance_score}",
    "status": "success | insufficient_data | tool_failure",
    "confidence": "high | medium | low"
  },
  "side_effects": false,
  "failure_policy": "retry_once_then_return_partial"
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`feasibility-framework`](./feasibility-framework.md) | Product Manager | Feasibility tier determines which patterns are in scope |
| [`task-decomposition`](../orchestrator/task-decomposition.md) | Orchestrator | Block dependency structure drives pattern selection |
| [`multi-agent-coordination`](../orchestrator/multi-agent-coordination.md) | Orchestrator | Manager-led pattern is implemented via this skill |
| [`planning-pattern`](../orchestrator/planning-pattern.md) | Orchestrator | The selected pattern is operationalised as an execution plan |

---

## 📊 Evaluation Checklist

- [ ] Pattern choice documented with explicit rationale vs. alternatives
- [ ] Every sub-agent has a single-sentence responsibility statement
- [ ] JSON contracts defined at every agent boundary
- [ ] Failure policy defined for every agent (retry / skip / escalate)
- [ ] Cost estimate per pattern documented and approved

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Communication Patterns", "The Linear Workflow", and "The Manager-Led Workflow" sections.*
*Template version: v1.0.0*
