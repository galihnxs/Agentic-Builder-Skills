---
name: llm-as-judge
description: LLM-as-Judge is the pattern of using a high-capability language model to evaluate the quality of another model's output on subjective criteria — tone, relevance, coherence, accuracy — that cannot be checked with a regex or schema validator. The Judge reads the output against a grading rubric, produces a discrete label (never a numeric score), and provides a one-sentence justification for its decision. It is the second tier of the Evaluation Trinity: more powerful than code-based checks, less authoritative than human annotation.
---

# Skill: LLM-as-Judge

**Role:** evaluator
**Version:** v1.0.0
**Phase:** Quality Control
**Autonomy Level:** Low
**Layer:** Skill Layer

## What This Skill Does

LLM-as-Judge is the pattern of using a high-capability language model to evaluate the quality of another model's output on subjective criteria — tone, relevance, coherence, accuracy — that cannot be checked with a regex or schema validator. The Judge reads the output against a grading rubric, produces a discrete label (never a numeric score), and provides a one-sentence justification for its decision. It is the second tier of the Evaluation Trinity: more powerful than code-based checks, less authoritative than human annotation.

## When to Use

Use this skill for llm-as-judge tasks.

## How to Invoke

Call this skill from Claude Code to access the "LLM-as-Judge" pattern and implementation.

## Reference Documentation

See the README.md in this directory for full documentation.

---

*This is an auto-generated wrapper. Source: Agentic-Builder-Skills*
