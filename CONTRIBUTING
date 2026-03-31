# Contributing to Agentic-Builder-Skills

Thank you for contributing. Every skill page in this repo is used by real engineers building real agents. **Quality over quantity.**

---

## The Non-Negotiable Standard

Before submitting, ask yourself: **"Can a developer ship something with this page in under 2 hours?"**

If no — it's not ready.

The three ways a PR gets rejected immediately:
1. The artifact has `// TODO`, `[placeholder]`, or Lorem Ipsum
2. The "Why it Matters" section doesn't cite a specific cost, latency, or reliability impact
3. The skill duplicates an existing page without a documented reason for the divergence

---

## How to Contribute a New Skill Page

### Step 1 · Claim the skill (open an Issue first)

Open an Issue titled: `skill: [role] / [skill-name]`

State in one sentence what failure mode this skill prevents. If someone else is working on it, coordinate before writing.

### Step 2 · Copy the template

```bash
cp _template/SKILL_TEMPLATE.md skills/[role]/[skill-name].md
```

### Step 3 · Fill every section

Every section is mandatory. The only exception: a skill may omit **Option B or Option C** in the artifact section if only one layer applies — but it must have at least one complete, working artifact.

### Step 4 · Choose the right artifact format

```
Task you're documenting                    → Artifact format
─────────────────────────────────────────────────────────────
Agent persona / system prompt logic       → Option A (Markdown system prompt)
Input/output contract for routing         → Option B (JSON Schema)
External tool access (DB, API, code run)  → Option C (Go MCP struct + handler)
```

Do not force a Go snippet into a skill that is purely a reasoning pattern. Do not write a system prompt for a skill that is purely about infrastructure wiring.

### Step 5 · Open a PR

**Title format:** `skill: [role] / [skill-name]`  
**Description:** Fill the PR template (auto-generated).

---

## How to Improve an Existing Skill

1. Open an Issue describing what is wrong or missing
2. Make the change
3. Update the **Changelog** table at the bottom of the skill page
4. PR title: `improve: [role] / [skill-name] — [what changed]`

---

## Quality Checklist for Every PR

The reviewer will check all of these. Save time: check them yourself first.

**Content:**
- [ ] All sections present (no deleted headers)
- [ ] No Lorem Ipsum, no placeholder text, no `[your text here]`
- [ ] "Why it Matters" has at least one concrete metric or tradeoff
- [ ] Constraints section is honest about when NOT to use this skill
- [ ] Related Skills section links to at least one other page

**Artifacts:**
- [ ] System prompt (if present) uses realistic domain copy — not "example input"
- [ ] JSON schema (if present) has a `description` field on every property
- [ ] Go code (if present) compiles — or is clearly marked as pseudocode with a `// PSEUDOCODE` comment at the top
- [ ] Go code (if present) uses struct tags for schema definition, not comments

**Formatting:**
- [ ] File name is kebab-case: `skill-name.md`
- [ ] File lives in the correct `/skills/[role]/` folder
- [ ] Internal links use relative paths and resolve correctly

---

## Skill Roles Reference

Use the exact folder name when choosing a role:

| Folder | Role Name | What they own |
|---|---|---|
| `architect/` | AI Architect | Infrastructure, MCP setup, state management, observability |
| `product-manager/` | Lead PM | Feasibility, evaluation design, cost/latency tradeoffs |
| `evaluator/` | The Evaluator | Quality gates, reflection patterns, LLM-as-Judge |
| `orchestrator/` | The Orchestrator | Planning, routing, JSON output, multi-agent coordination |
| `researcher/` | The Researcher | Web search, RAG, vector DB lookups |
| `data-analyst/` | The Data Analyst | Code execution, sandboxed Python, self-healing logic |
| `creator/` | The Creator | Synthesis, writing, structured output generation |
| `compliance/` | Compliance & Legal | Governance-as-code, regional legal checks, HITL gates |
| `protector/` | The Protector | Sandboxing, injection defense, non-determinism handling |

---

## What Belongs in `/examples`

The `/examples` folder contains **full working agent systems** that combine multiple skills. An example must:

1. Reference ≥ 3 skill pages from different roles
2. Include a working `main.go` (Tool Layer) or a complete `system-prompt.md` (Skill Layer) — not both required, but one is
3. Include a `README.md` explaining the end-to-end flow
4. Include at least 5 test cases with expected outputs

Examples are held to a higher standard than individual skill pages. Open an Issue before starting one.

---

## What Does NOT Belong Here

- Framework documentation (we reference LangChain/LangGraph but don't document their APIs)
- Company-specific integrations (build those in your own fork)
- Skills based on deprecated APIs or models
- Theoretical patterns with no artifact — if you can't produce a working prompt or schema, it's an essay, not a skill

---

## Language & Tone

This repo bridges **PM strategy** and **engineering execution**. Write for both:

- Use plain language in "What is it?" and "Why it Matters"
- Use precise technical terms in "How it Works"
- Never say "simply" or "just" — if it were simple, no one would need a skill page
- Failure modes are not embarrassing — document them clearly

---

*Questions? Open a Discussion. PRs are for code and content, not conversations.*
