---
name: agentic-skills-library
title: Agentic Skills Library
description: Complete library of 31 agentic patterns and roles (Architect, PM, Evaluator, etc)
---

# Agentic Skills Library

Access 31 battle-tested agentic patterns, organized by role. Each skill is a complete pattern implementation covering architecture, prompts, schemas, and evaluation criteria.

## 📚 Skills by Role

### Architect (4 skills)
Infrastructure, plumbing, and technical orchestration patterns for AI systems.
- **mcp-integration** — Integrate Model Context Protocol servers as tool backends
- **skill-based-architecture** — Modular skill registry with semantic routing
- **state-observability** — Traceable execution graphs and state management
- **tool-orchestration** — Deterministic tool dispatch and result composition

### Compliance (3 skills)
Governance, legal constraints, and human oversight for autonomous agents.
- **governance-as-code** — Machine-readable compliance rules and policies
- **human-in-the-loop** — Integration points for human review and override
- **regional-legal-check** — Multi-region compliance verification patterns

### Creator (2 skills)
Multi-step synthesis and output generation patterns.
- **multi-agent-chain** — Sequential multi-agent workflows and handoff
- **synthesis-output** — Unified output generation from multiple sources

### Data Analyst (4 skills)
Code execution, sandboxing, and data transformation patterns.
- **code-execution-pattern** — Safe code execution with isolation
- **sandbox-setup** — Containerized execution environments
- **self-healing-code** — Auto-fixing code generation patterns
- **readme** — Code execution pattern documentation

### Evaluator (3 skills)
Evaluation frameworks, LLM-as-judge, and reflection patterns.
- **component-evaluation** — Individual component quality metrics
- **llm-as-judge** — Using LLMs for structured evaluation
- **reflection-pattern** — Self-critique and improvement loops

### Orchestrator (4 skills)
Task decomposition, planning, and multi-agent coordination.
- **json-xml-output** — Structured output schemas
- **multi-agent-coordination** — Synchronized multi-agent execution
- **planning-pattern** — Goal decomposition and task planning
- **task-decomposition** — Breaking complex goals into subtasks

### Product Manager (5 skills)
Strategic frameworks for product decisions, cost optimization, and feasibility.
- **agentic-workflow-design** — End-to-end workflow architecture
- **cost-latency-tradeoffs** — Model/routing decisions for cost vs speed
- **eval-driven-development** — Using evaluations to drive product decisions
- **evaluation-matrix** — Multi-dimensional evaluation frameworks
- **feasibility-framework** — Assessing technical and business feasibility

### Protector (3 skills)
Defense patterns, injection handling, and safety constraints.
- **injection-defense** — Prompt injection and jailbreak resistance
- **non-determinism-handling** — Managing model output variability
- **sandboxing-defense** — Containment and privilege isolation

### Researcher (3 skills)
Advanced pattern research: RAG, ReAct, web integration.
- **rag-skill** — Retrieval-Augmented Generation patterns
- **react-pattern** — Reasoning + Acting loop patterns
- **web-search-integration** — Real-time web search integration

---

## 🚀 How to Use

Each skill is a standalone, self-contained pattern that can be applied to your own codebase.

### To Access a Specific Skill

From Claude Code, spawn the skill you need:

```
/architect-skills skill-based-architecture
/compliance-skills governance-as-code
/pm-skills eval-driven-development
```

### Structure of Each Skill

Every skill includes:
- **Markdown documentation** — Full explanation, theory, and use cases
- **manifest.json** — Metadata and schema definitions
- **System prompts** — Ready-to-use role prompts
- **Code examples** — Implementation templates (Go, Python, JavaScript)
- **Evaluation criteria** — How to measure success
- **Related skills** — Links to complementary patterns

### Quick Start

1. **Find the skill** — Browse the list above or check the role directories
2. **Read the documentation** — Understand when and why to use it
3. **Copy the templates** — Extract system prompts, schemas, code
4. **Adapt to your codebase** — Customize for your specific use case
5. **Evaluate the results** — Use the provided evaluation criteria

---

## 📊 Skill Metadata

All 31 skills have standardized metadata:
- **Version:** v1.0.0
- **Role:** One of 9 agentic roles
- **Phase:** Design / Implementation / Validation
- **Autonomy Level:** Low / Medium / High
- **Layer:** Skill Layer / Tool Layer / Data Layer

View the complete collection in `collection.json`

---

## 📂 Repository Structure

```
Agentic-Builder-Skills/
├── SKILL.md                          # This file
├── collection.json                   # Complete skill registry
├── scripts/
│   ├── generate_manifests.js         # Generate manifest.json files
│   └── generate_skill_wrappers.js    # Generate CLAUDE_SKILL.md files
└── skills/
    ├── architect/
    ├── compliance/
    ├── creator/
    ├── data-analyst/
    ├── evaluator/
    ├── orchestrator/
    ├── product-manager/
    ├── protector/
    └── researcher/
```

---

## 🔄 Regenerating Manifests

If you update skill markdown files:

```bash
cd scripts
node generate_manifests.js      # Regenerate manifest.json files
node generate_skill_wrappers.js # Regenerate CLAUDE_SKILL.md wrappers
```

---

## 📚 Reference

- **Full documentation:** See individual skill markdown files
- **Marketplace registry:** `collection.json`
- **Skill manifests:** `skills/{role}/{skill_name}/manifest.json`
- **Claude Code wrappers:** `skills/{role}/{skill_name}/CLAUDE_SKILL.md`

---

## About Agentic Patterns

These 31 skills represent the current state-of-the-art in agentic AI system design (as of March 2026). They cover:

- **System architecture** — How to structure multi-agent systems
- **Safety & compliance** — Governance, legal, and human oversight
- **Cost optimization** — Token budgeting and model selection
- **Evaluation** — Measuring agent quality and reliability
- **Implementation** — Code patterns and templates

Use these patterns to build reliable, cost-effective, and compliant AI agents.

---

*Source: Agentic-Builder-Skills v1.0.0*
*Last updated: April 1, 2026*
