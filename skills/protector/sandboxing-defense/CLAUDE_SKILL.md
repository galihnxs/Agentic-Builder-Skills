---
name: sandboxing-defense
description: "Executes code in an isolated Docker sandbox with strict resource limits. All CODE_EXECUTION agent actions must route through this tool. Never call this without first passing the code through the Protector agent review.",
---

# Skill: Sandboxing Defense

**Role:** protector
**Version:** v1.0.0
**Phase:** Safety
**Autonomy Level:** Low
**Layer:** Tool Layer (Go MCP) + Skill Layer

## What This Skill Does

"Executes code in an isolated Docker sandbox with strict resource limits. All CODE_EXECUTION agent actions must route through this tool. Never call this without first passing the code through the Protector agent review.",

## When to Use

Use this skill for sandboxing defense tasks.

## How to Invoke

Call this skill from Claude Code to access the "Sandboxing Defense" pattern and implementation.

## Reference Documentation

See the README.md in this directory for full documentation.

---

*This is an auto-generated wrapper. Source: Agentic-Builder-Skills*
