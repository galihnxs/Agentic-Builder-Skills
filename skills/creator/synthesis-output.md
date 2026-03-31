# Skill: Synthesis Output

**Role:** Creator (Writer / Designer)
**Phase:** Execution
**Autonomy Level:** Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Synthesis Output is the pattern for transforming raw research findings, structured data, and intermediate agent outputs into polished, user-facing content — reports, summaries, narratives, or structured documents. The Creator agent receives the assembled outputs from Researcher and Data Analyst agents and produces the final artifact that the user actually reads. It never fetches data. It never runs code. It only synthesises.

The critical design constraint is the **single responsibility boundary**: the Creator receives fully assembled inputs and produces a finished output. It does not go back and re-fetch missing data, re-run analyses, or make judgment calls about what information to include. Those decisions belong upstream. If the inputs are incomplete, the Creator flags it rather than improvising.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A well-scoped Creator agent produces consistently formatted output regardless of how varied the upstream inputs were. Without it, synthesis is scattered across multiple agents producing inconsistent tone, structure, and depth.
- **Cost implication:** The Creator uses no external tools — pure LLM generation. At 1,000-token output, cost ≈ $0.005–0.015. It is the cheapest agent in the pipeline and should never be asked to do double duty as a researcher.
- **Latency implication:** Pure generation with no tool calls: 2–5s for typical report lengths. The Creator is never the latency bottleneck.
- **When to skip this:** Simple, single-sentence or single-value outputs that need no narrative structuring. If the Researcher's output is already the final answer, routing through the Creator adds latency with no value.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- Fully assembled inputs from upstream agents: research findings, data summaries, analytical conclusions
- A defined output template (format, sections, word count, tone)
- A style guide or persona definition passed in the system prompt

**Workflow:**

1. **Receive assembled inputs** — The Creator receives structured JSON containing all upstream outputs. It does not receive raw tool results or intermediate states.
2. **Validate completeness** — Check that all required input fields are present. If any required input is missing or marked `status: failed`, output a `CANNOT_COMPLETE` with specific gaps identified.
3. **Select template** — Based on `output_type` (report, summary, narrative, structured_doc), load the appropriate format constraints.
4. **Generate** — Produce the full output in a single LLM call. The Creator does not iterate — it synthesises from what it has.
5. **Pass to Evaluator** — Output routes to the [`reflection-pattern`](../evaluator/reflection-pattern.md) before delivery. The Creator's output is never delivered directly to the user without evaluation.

**Failure modes to watch:**
- `DataInvention` — Caused by: Creator filling gaps in missing upstream data with plausible-sounding fabrications. Fix: include an explicit constraint: "If a required data point is not in the inputs, write '[DATA UNAVAILABLE]' — never estimate or approximate."
- `TemplateIgnorance` — Caused by: Creator ignoring the output format specification and generating free-form prose. Fix: structure the format specification as a numbered checklist in the system prompt, not as prose instructions.
- `UpstreamBleed` — Caused by: Creator receiving raw tool outputs (search results, DataFrames) instead of processed summaries. Fix: Researcher and Data Analyst outputs must be summarised before being passed to the Creator — never pass raw payloads.
- `RoleDrift` — Caused by: Creator agent being asked to "also search for more data if needed." Fix: the Creator system prompt must include an explicit prohibition on tool use.

**Integration touchpoints:**
- Receives from: [`rag-skill`](../researcher/rag-skill.md), [`web-search-integration`](../researcher/web-search-integration.md), [`code-execution-pattern`](../data-analyst/code-execution-pattern.md) — via the Orchestrator, not directly
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — mandatory gate before user delivery
- Required by: [`multi-agent-chain`](./multi-agent-chain.md) — the Creator is always the terminal agent in a linear chain

---

## ⚠️ Constraints & Guardrails

- **Context window:** All upstream inputs passed to the Creator must fit within 6,000 tokens (leaving 2,000+ for generation). If assembled inputs exceed this, summarise upstream outputs before passing — do not truncate mid-document.
- **Cost ceiling:** Pure generation at typical report length (500–1,500 tokens): $0.005–0.02 per synthesis. No tool call costs. This is the lowest-cost agent in the pipeline.
- **Model requirement:** Use a capable language model (Claude Sonnet, GPT-4o) for polished prose output. Smaller models produce noticeably lower quality narrative synthesis. This is a model quality bottleneck — don't downgrade the Creator to save cost.
- **Non-determinism:** The same inputs may produce slightly different prose across runs. For internally consistent reports (numbers, dates, proper nouns), use `temperature=0.3`. For narrative content, `temperature=0.7` produces more natural writing.
- **Human gate required:** Yes — for any Creator output that will be published externally, sent to clients, or used in regulated contexts. The Evaluator gate is insufficient for high-stakes external content.

---

## 📦 Ready-to-Use Artifact: Creator Agent System Prompt

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Creator in a multi-agent system. Your single responsibility is:
Transform assembled research findings and data into polished, user-facing content.

You NEVER fetch data, run code, call APIs, or perform any external action.
You ONLY synthesise from the inputs you receive.

## Inputs
You will receive a JSON object containing:
- `output_type`: report | executive_summary | narrative | structured_doc | email
- `audience`: The intended reader (e.g., "C-suite executive", "clinical psychologist", "end user")
- `tone`: formal | professional | conversational | technical
- `word_limit`: Maximum word count for the output (hard limit)
- `required_sections`: Array of section names that MUST appear in the output
- `research_findings`: Summarised outputs from the Researcher agent
- `data_summary`: Summarised outputs from the Data Analyst agent
- `citations`: Source references to include

## Output Rules
1. Structure the output according to `output_type` and `required_sections` — in order, no omissions.
2. Do NOT exceed `word_limit`. If content must be cut, cut the least important points — never cut required sections.
3. Match `tone` throughout. Do not switch tone mid-document.
4. For every factual claim from research: include the citation in parentheses.
5. If a required data point is missing from inputs: write [DATA UNAVAILABLE: {field_name}] — never estimate.
6. NEVER add information not present in the inputs — you synthesise, not research.

## Output Format
Output the finished content directly, preceded by a brief metadata block:

---
output_type: [type]
word_count: [actual count]
sections_completed: [list]
missing_data_fields: [list of any [DATA UNAVAILABLE] instances, or "none"]
confidence: high | medium | low
---

[The synthesised content here]

## Hard Constraints
- NEVER use a tool — you have none
- NEVER invent data, statistics, or quotes
- NEVER exceed word_limit
- ALWAYS complete all required_sections
- If inputs are critically incomplete (>2 required fields missing), output: {"status": "CANNOT_COMPLETE", "missing_fields": [...], "minimum_inputs_needed": "..."}
```

### Option B · JSON Schema (Creator Input Contract)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CreatorInput",
  "type": "object",
  "required": ["output_type", "audience", "tone", "word_limit", "required_sections", "research_findings"],
  "properties": {
    "output_type": {
      "type": "string",
      "enum": ["report", "executive_summary", "narrative", "structured_doc", "email"]
    },
    "audience": { "type": "string" },
    "tone": { "type": "string", "enum": ["formal", "professional", "conversational", "technical"] },
    "word_limit": { "type": "integer", "minimum": 50, "maximum": 5000 },
    "required_sections": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "research_findings": { "type": "string", "description": "Summarised Researcher output. Max 2000 tokens." },
    "data_summary": { "type": ["string", "null"], "description": "Summarised Data Analyst output. null if no analysis was performed." },
    "citations": { "type": "array", "items": { "type": "object", "properties": { "title": { "type": "string" }, "source": { "type": "string" } } } }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`multi-agent-chain`](./multi-agent-chain.md) | Creator | The Creator is always the terminal agent in a chain |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Creator output always passes through reflection before delivery |
| [`llm-as-judge`](../evaluator/llm-as-judge.md) | Evaluator | Final quality scoring of Creator output |
| [`agentic-workflow-design`](../product-manager/agentic-workflow-design.md) | Product Manager | Pattern selection determines when the Creator is used |

---

## 📊 Evaluation Checklist

- [ ] `[DATA UNAVAILABLE]` placeholder verified — Creator does not fabricate missing data
- [ ] Word limit enforced — output does not exceed `word_limit` in 20 test runs
- [ ] All `required_sections` present in every output — no section omissions
- [ ] Tool use confirmed absent — Creator has no tools and makes no external calls
- [ ] Output routed through reflection before user delivery — verified in integration test

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "The Creator (Writer/Designer)" and "Multi-Agent Systems" sections.*
*Template version: v1.0.0*
