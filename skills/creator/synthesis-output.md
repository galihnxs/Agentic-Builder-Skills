# Skill: Synthesis & Structured Output

**Role:** Creator (Writer / Designer)
**Phase:** Execution
**Autonomy Level:** Low → Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Synthesis is the Creator agent's core capability: taking raw research, data analysis results, and retrieved context from upstream agents and transforming them into polished, user-facing output. The Creator does not retrieve information — it receives finished inputs and assembles them into a coherent, well-structured deliverable. This separation of "gathering" (Researcher/Analyst) from "creating" (Creator) prevents the most common multi-agent failure: one agent trying to both find information and present it in a single pass, doing both poorly.

The Creator's output is the only output in the pipeline that a human directly reads or acts on — making it the highest-stakes role for tone, clarity, and format compliance.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Separating synthesis from research dramatically improves output quality. A Creator working from verified, structured inputs from the Researcher and Analyst produces outputs that are coherent, grounded, and well-structured — something a single "do everything" agent rarely achieves.
- **Cost implication:** The Creator uses core LLM capabilities (no external tools required in most cases), making it the cheapest agent to run per token generated. The value comes from the quality of inputs it receives, not from expensive tool calls.
- **Latency implication:** No tool calls = no additional latency beyond the LLM generation time. The Creator's speed is bounded by output length and model speed.
- **When to skip this:** The output is purely structured data consumed by another system (not a human). If the consumer is code, not a person, the Data Analyst can produce the final output directly without a synthesis pass.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- Structured inputs from upstream agents (Researcher output, Analyst output, or both)
- A defined output format: report, summary, email, caption, JSON document, slide narrative
- A tone specification: formal, conversational, technical, empathetic
- Any hard constraints: word count, required sections, mandatory disclosures

**Workflow:**

1. **Receive assembled inputs** — The Manager/Orchestrator passes all upstream agent outputs as a structured context object.
2. **Verify completeness** — Check that all required inputs are present and have `status: success`. If any input has `status: failure`, the Creator flags this in its output rather than fabricating missing information.
3. **Apply output format** — Structure the output according to the requested format. A report has sections and headings; a caption has a character limit; a support reply has an empathy opening.
4. **Apply tone** — Adjust language register based on the specified tone. The same information delivered in "technical" vs "conversational" tone produces very different text.
5. **Cite sources** — Every factual claim must be attributed to the upstream agent or source that produced it. The Creator never introduces new facts not present in its inputs.
6. **Pass to Evaluator** — Output must go through [`reflection-pattern`](../evaluator/reflection-pattern.md) or [`llm-as-judge`](../evaluator/llm-as-judge.md) before reaching the user.

**Failure modes to watch:**
- `FactFabrication` — Caused by: Creator "filling in gaps" when upstream inputs are incomplete. Fix: explicit instruction to flag missing information rather than invent it.
- `ToneMismatch` — Caused by: Creator defaulting to a formal tone when conversational was requested. Fix: include tone specification and 1–2 examples in the system prompt.
- `FormatIgnored` — Caused by: Creator producing free-form text when structured sections were requested. Fix: include the exact section headers in the system prompt as a template.
- `LengthOverrun` — Caused by: Creator ignoring word/character limits. Fix: include a code-based eval check (Q2 in the evaluation matrix) for length compliance.

---

## ⚠️ Constraints & Guardrails

- **Context window:** Creator input = all upstream agent outputs. Cap individual upstream outputs at 500 tokens each before passing to the Creator. For 5 upstream agents: ~2,500 tokens input + system prompt + generation.
- **Cost ceiling:** No tool calls. Cost = input tokens + output tokens × model rate. For a 500-word report: ~$0.005–0.02 on frontier models.
- **Model requirement:** Capable model for complex synthesis (GPT-4o, Claude 3.5 Sonnet). For simple formatting and short output (captions, subject lines), Haiku/GPT-4o-mini is sufficient.
- **Non-determinism:** The same inputs may produce slightly different phrasing across runs. This is acceptable for creative/prose outputs. For legal or compliance outputs where exact wording matters, use a human-in-the-loop gate.
- **Human gate required:** Yes — for any output that will be published, sent externally, or used in a legal/financial context without human review.

---

## 📦 Ready-to-Use Artifact: Creator Agent System Prompt

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Creator in a multi-agent system. Your responsibility is:
Transform verified research and analysis into a polished, user-facing deliverable.

You do NOT retrieve information. You do NOT run calculations.
You ONLY synthesise, structure, and write from the inputs you receive.

## Inputs
You will receive:
- `task_instruction`: What type of deliverable to produce and for whom
- `upstream_results`: Structured outputs from upstream agents (Researcher, Analyst, etc.)
- `output_format`: report | email | caption | summary | slide_narrative | json_document
- `tone`: formal | conversational | technical | empathetic
- `constraints`: Hard limits (word count, required sections, mandatory disclosures)

## Rules for Using Upstream Data
- Use ONLY information present in `upstream_results`
- If a required piece of information has `status: failure` in upstream_results: write "[DATA NOT AVAILABLE: {{reason}}]" in the relevant section — do NOT fabricate
- Cite the source agent for every key fact: "According to the Researcher..." or "Analysis shows..."
- Never present the Analyst's computed numbers as if you calculated them yourself

## Output Structure
Follow the format specified in `output_format` exactly.
For reports: include all required section headers, even if a section must say "Data not available."
For captions: stay within the character limit — count before outputting.
For emails: include subject line, greeting, body, and sign-off.

## Output Format
{
  "status": "success | partial | failure",
  "deliverable": "Your synthesised output",
  "format_used": "report | email | caption | ...",
  "missing_data": ["list any upstream inputs that were missing or failed"],
  "word_count": 0,
  "next_action": "pass_to_evaluator | request_human_review"
}

## Hard Constraints
- NEVER introduce facts not present in upstream_results
- NEVER exceed the word/character limit specified in constraints
- ALWAYS flag missing data — never silently omit required sections
- Set next_action to request_human_review for any output that will be published or sent externally
```

---

### Option B · Creator Input Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CreatorInput",
  "type": "object",
  "required": ["task_instruction", "upstream_results", "output_format", "tone"],
  "properties": {
    "task_instruction": { "type": "string" },
    "upstream_results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["agent", "status", "result"],
        "properties": {
          "agent": { "type": "string" },
          "status": { "type": "string", "enum": ["success", "failure", "partial"] },
          "result": { "type": "string" },
          "sources": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "output_format": {
      "type": "string",
      "enum": ["report", "email", "caption", "summary", "slide_narrative", "json_document"]
    },
    "tone": { "type": "string", "enum": ["formal", "conversational", "technical", "empathetic"] },
    "constraints": {
      "type": "object",
      "properties": {
        "max_words": { "type": ["integer", "null"] },
        "max_chars": { "type": ["integer", "null"] },
        "required_sections": { "type": "array", "items": { "type": "string" } },
        "mandatory_disclosures": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`multi-agent-chain`](./multi-agent-chain.md) | Creator | Creator is the terminal node in the multi-agent chain |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Creator output goes to reflection before reaching the user |
| [`llm-as-judge`](../evaluator/llm-as-judge.md) | Evaluator | Judge evaluates tone, completeness, and constraint adherence |

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "Multi-Agent Systems" Creator role section.*
*Template version: v1.0.0*
