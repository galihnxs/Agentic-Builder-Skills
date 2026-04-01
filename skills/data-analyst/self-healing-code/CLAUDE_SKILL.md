---
name: self-healing-code
description: Self-Healing Code is the error recovery loop for code-executing agents: when the sandbox returns an error, the agent does not give up — it receives the exact error message, diagnoses the specific cause, and generates a corrected version. This is a specialised application of the [`reflection-pattern`](../evaluator/reflection-pattern.md) where the external feedback signal is binary and precise: the code either ran or it didn't, and the error message tells you exactly what went wrong.
---

# Skill: Self-Healing Code

**Role:** data-analyst
**Version:** v1.0.0
**Phase:** Quality Control
**Autonomy Level:** Semi
**Layer:** Skill Layer

## What This Skill Does

Self-Healing Code is the error recovery loop for code-executing agents: when the sandbox returns an error, the agent does not give up — it receives the exact error message, diagnoses the specific cause, and generates a corrected version. This is a specialised application of the [`reflection-pattern`](../evaluator/reflection-pattern.md) where the external feedback signal is binary and precise: the code either ran or it didn't, and the error message tells you exactly what went wrong.

## When to Use

Use this skill for self-healing code tasks.

## How to Invoke

Call this skill from Claude Code to access the "Self-Healing Code" pattern and implementation.

## Reference Documentation

See the README.md in this directory for full documentation.

---

*This is an auto-generated wrapper. Source: Agentic-Builder-Skills*
