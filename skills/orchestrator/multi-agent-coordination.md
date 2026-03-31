# Skill: Multi-Agent Coordination

**Role:** Orchestrator (Manager)
**Phase:** Orchestration
**Autonomy Level:** Semi → High
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Multi-Agent Coordination is the architectural pattern for distributing a complex task across multiple specialised agents — each with a focused persona, a dedicated toolset, and a bounded scope of responsibility. Instead of asking one LLM to research, analyse, write, and review all in a single context window, a Manager Agent sits at the centre: it receives the user's goal, delegates sub-tasks to specialist agents, and synthesises the results.

The analogy from the source material is precise: this is moving from a single freelancer to a specialised department. The same underlying model can play every role — but subdividing tasks into distinct "agent roles" makes complex workflows easier to build, debug, and scale. When a 5,000-token research task fails, you know exactly which agent produced the bad output and why.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Multi-agent systems reduce the "blast radius" of errors. A failure in the Researcher agent does not corrupt the Creator agent's output — they are isolated. This means faster diagnosis, cheaper recovery, and higher overall system reliability.
- **Cost implication:** Specialised agents can run on smaller, cheaper models for their focused task. A Researcher doing keyword extraction doesn't need GPT-4o — Haiku handles it. The Manager (reasoning + routing) does. Model-tier routing across agents reduces total cost by 30–60% on mixed-complexity pipelines.
- **Latency implication:** Independent agents can run in parallel when their tasks have no dependency. A 3-agent parallel research task takes the time of the slowest agent, not the sum of all three.
- **When to skip this:** Tasks that are genuinely single-step and don't benefit from specialisation. Adding a Manager layer to a simple "summarise this document" task adds latency and cost with no quality benefit.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- At least 2 specialised sub-agents defined with unique system prompts and toolsets
- A Manager Agent system prompt that knows the capabilities of each sub-agent
- A shared state object all agents read from and write to
- The [`json-xml-output`](./json-xml-output.md) skill implemented — all inter-agent messages are structured JSON

**Two Primary Patterns:**

**Pattern A — Linear Chain (Relay Race):**
Each agent's output becomes the next agent's input. Simple, predictable, debuggable.
```
Researcher → Data Analyst → Creator → Evaluator → User
```
- Use when: each step genuinely depends on the previous step's full output
- Risk: errors propagate forward through the entire chain

**Pattern B — Manager-Led (Hub and Spoke):**
The Manager delegates, collects, and synthesises. Agents may run in parallel.
```
         ┌→ Researcher ─┐
User → Manager → Analyst  → Manager → Creator → User
         └→ Researcher ─┘
```
- Use when: sub-tasks are partially independent, or the Manager needs to review and revise sub-agent work
- Risk: Manager becomes a bottleneck; its failure affects all agents

**Workflow (Manager-Led):**

1. **Manager receives goal** — User intent arrives with context and available sub-agents.
2. **Manager creates delegation plan** — Outputs a JSON array of tasks, each assigned to a named sub-agent with explicit input and expected output.
3. **Parallel dispatch** — Tasks with no dependencies are dispatched concurrently. Tasks with dependencies wait for their prerequisite outputs.
4. **Sub-agent execution** — Each sub-agent runs independently with its own system prompt, toolset, and context. Sub-agents do not communicate with each other — only with the Manager via the shared state.
5. **Manager collects outputs** — Reads each sub-agent's `AgentOutput` from the shared state.
6. **Manager reviews and revises** — If a sub-agent output has `confidence: low` or `status: failure`, the Manager can re-delegate or request a reflection cycle.
7. **Manager synthesises** — Combines all sub-agent outputs into the final response.

**Failure modes to watch:**
- `AgentContextBleed` — Caused by: passing one agent's full conversation history to another agent. Fix: agents share state via a structured JSON object, never raw conversation history.
- `ManagerOverload` — Caused by: giving the Manager agent too many sub-agents to coordinate in one context window. Fix: max 5 sub-agents per Manager. Use hierarchical managers for larger systems.
- `CircularDelegation` — Caused by: Agent A delegates to Agent B which delegates back to Agent A. Fix: the Manager is the only entity that can delegate. Sub-agents cannot initiate delegation.
- `StateRacecondition` — Caused by: two parallel agents writing to the same state key concurrently. Fix: use unique output keys per agent (`researcher_1_output`, `researcher_2_output`). Never share mutable state between parallel agents.

**Integration touchpoints:**
- Requires: [`json-xml-output`](./json-xml-output.md) — all delegation messages and sub-agent responses
- Requires: [`planning-pattern`](./planning-pattern.md) — Manager uses planning to structure delegation
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — Manager routes low-confidence outputs for reflection
- Requires: [`state-observability`](../architect/state-observability.md) — shared state must be traceable

---

## ⚠️ Constraints & Guardrails

- **Context window:** The Manager's context grows with each sub-agent output it reads. Cap sub-agent result summaries at 500 tokens each. The Manager should read structured summaries, not full sub-agent conversation histories.
- **Cost ceiling:** Manager call + N sub-agent calls = N+1 LLM calls minimum. For 5 sub-agents: 6 calls. Budget this explicitly. Parallel execution saves latency, not cost.
- **Model requirement:** The Manager should use a capable reasoning model (GPT-4o, Claude 3.5 Sonnet). Sub-agents can use cheaper models sized to their task complexity.
- **Non-determinism:** Different runs may produce different delegation plans for the same input. This is acceptable. What matters is that the final synthesis is correct.
- **Human gate required:** Yes — before any delegation that includes agents with `side_effects: true` tools. The Manager must surface this to the user before dispatching.

---

## 📦 Ready-to-Use Artifact: Manager Agent System Prompt + Delegation Schema

### Option A · Manager System Prompt (Skill Layer)

```markdown
## Role
You are the Manager in a multi-agent system. Your responsibilities are:
1. Receive a user goal
2. Identify which specialist agents are needed and in what order
3. Delegate tasks to those agents with precise instructions
4. Review their outputs and synthesise a final response

You do NOT perform research, analysis, or writing yourself.
You ONLY plan, delegate, review, and synthesise.

## Available Sub-Agents
{{SUB_AGENT_LIST}}
Each entry includes: agent_name, capability_description, input_contract, output_contract.

## Delegation Process
1. Analyse the goal: what information is needed? what must be created?
2. Map each need to the most appropriate sub-agent.
3. Identify dependencies: does any agent need another agent's output first?
4. Dispatch independent tasks in parallel (same parallel_group).
5. After receiving outputs: check status and confidence for each.
   - confidence: low OR status: failure → request reflection or re-delegate
   - confidence: high AND status: success → proceed to synthesis

## Delegation Output Format
When delegating, output ONLY this JSON. No prose.

{
  "delegation_plan": [
    {
      "agent_name": "researcher",
      "task_id": "t1",
      "instruction": "Find the top 3 competitors to Coreitera in the Indonesian PsychTech market. Return names, URLs, and key differentiators.",
      "input_data": null,
      "depends_on": [],
      "parallel_group": 1
    },
    {
      "agent_name": "data_analyst",
      "task_id": "t2",
      "instruction": "Analyse the competitor data and identify the top 2 gaps Coreitera can exploit.",
      "input_data": "{{t1_output}}",
      "depends_on": ["t1"],
      "parallel_group": 2
    }
  ]
}

## Synthesis Rules
- Cite which sub-agent produced each key fact in the final response
- If any sub-agent returned status: failure, acknowledge the gap explicitly
- Do not fabricate data that a sub-agent failed to retrieve
- Keep the synthesis concise — the user wants conclusions, not a transcript of agent outputs
```

---

### Option B · Delegation Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DelegationPlan",
  "type": "object",
  "required": ["delegation_plan"],
  "properties": {
    "delegation_plan": {
      "type": "array",
      "minItems": 1,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["agent_name", "task_id", "instruction", "depends_on", "parallel_group"],
        "additionalProperties": false,
        "properties": {
          "agent_name": {
            "type": "string",
            "description": "Must match a registered sub-agent name exactly."
          },
          "task_id": {
            "type": "string",
            "pattern": "^t[0-9]+$",
            "description": "Unique task identifier. Format: t1, t2..."
          },
          "instruction": {
            "type": "string",
            "description": "Precise, self-contained instruction for the sub-agent. Include: what to find/do, what format to return."
          },
          "input_data": {
            "type": ["string", "null"],
            "description": "Data to pass to this agent. Use {{task_id_output}} template to reference prior task outputs. null if no input needed."
          },
          "depends_on": {
            "type": "array",
            "items": { "type": "string" },
            "description": "task_ids that must complete before this task starts."
          },
          "parallel_group": {
            "type": "integer",
            "minimum": 1,
            "description": "Tasks sharing the same integer run concurrently."
          }
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
| [`planning-pattern`](./planning-pattern.md) | Orchestrator | Manager uses planning internaly for delegation structure |
| [`json-xml-output`](./json-xml-output.md) | Orchestrator | All manager-to-agent and agent-to-manager messages are structured JSON |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Manager routes low-confidence outputs for reflection before synthesis |
| [`state-observability`](../architect/state-observability.md) | Architect | Shared state across agents must be traced end-to-end |
| [`researcher/react-pattern`](../researcher/react-pattern.md) | Researcher | The Researcher sub-agent executes its work via the ReAct loop |

---

## 📊 Evaluation Checklist

- [ ] Manager delegation plan validated against schema before dispatch
- [ ] Parallel execution tested — parallel_group tasks run concurrently, not sequentially
- [ ] Sub-agents confirmed isolated — no direct agent-to-agent communication
- [ ] State race condition tested — concurrent agents write to unique keys only
- [ ] Manager correctly handles sub-agent `status: failure` — does not silently skip
- [ ] Max 5 sub-agents per Manager enforced

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "Multi-Agent Systems" and "Communication Patterns" sections.*
*Template version: v1.0.0*
