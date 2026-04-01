---
name: json-xml-output
description: Structured output enforcement is the practice of constraining an LLM's response to a machine-readable format — JSON or XML — so that downstream code can parse and act on it without brittle text extraction. When an agent says "I'll check the price," the calling code has no idea whether that maps to `get_price(item="sunglasses")` or `lookup_cost(id=123)`. A structured output contract eliminates this ambiguity by creating a typed, predictable interface between the LLM's reasoning and the system's execution layer.
---

# Skill: JSON & XML Structured Output

**Role:** orchestrator
**Version:** v1.0.0
**Phase:** Orchestration
**Autonomy Level:** Low → Semi
**Layer:** Skill Layer

## What This Skill Does

Structured output enforcement is the practice of constraining an LLM's response to a machine-readable format — JSON or XML — so that downstream code can parse and act on it without brittle text extraction. When an agent says "I'll check the price," the calling code has no idea whether that maps to `get_price(item="sunglasses")` or `lookup_cost(id=123)`. A structured output contract eliminates this ambiguity by creating a typed, predictable interface between the LLM's reasoning and the system's execution layer.

## When to Use

Use this skill for json & xml structured output tasks.

## How to Invoke

Call this skill from Claude Code to access the "JSON & XML Structured Output" pattern and implementation.

## Reference Documentation

See the README.md in this directory for full documentation.

---

*This is an auto-generated wrapper. Source: Agentic-Builder-Skills*
