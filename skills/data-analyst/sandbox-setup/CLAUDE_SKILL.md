---
name: sandbox-setup
description: Sandbox Setup is the infrastructure configuration skill that defines the execution environment for LLM-generated code. It specifies which Python libraries are pre-installed, what filesystem paths are accessible, what network destinations are whitelisted, and what resource limits apply. A well-configured sandbox is what makes the [`code-execution-pattern`](./code-execution-pattern.md) safe to run in production — it is the difference between "the LLM can write code" and "the LLM can write code that can't hurt us."
---

# Skill: Sandbox Setup

**Role:** data-analyst
**Version:** v1.0.0
**Phase:** Design → Integration
**Autonomy Level:** Low
**Layer:** Tool Layer

## What This Skill Does

Sandbox Setup is the infrastructure configuration skill that defines the execution environment for LLM-generated code. It specifies which Python libraries are pre-installed, what filesystem paths are accessible, what network destinations are whitelisted, and what resource limits apply. A well-configured sandbox is what makes the [`code-execution-pattern`](./code-execution-pattern.md) safe to run in production — it is the difference between "the LLM can write code" and "the LLM can write code that can't hurt us."

## When to Use

Use this skill for sandbox setup tasks.

## How to Invoke

Call this skill from Claude Code to access the "Sandbox Setup" pattern and implementation.

## Reference Documentation

See the README.md in this directory for full documentation.

---

*This is an auto-generated wrapper. Source: Agentic-Builder-Skills*
