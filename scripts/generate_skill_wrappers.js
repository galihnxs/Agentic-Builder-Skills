#!/usr/bin/env node

/**
 * Generate Claude Code skill wrappers from manifest.json files.
 *
 * Creates SKILL.md files that make each skill callable from Claude Code.
 * These wrappers are discoverable by Claude's skill system.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.dirname(__dirname);
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const COLLECTION_PATH = path.join(REPO_ROOT, 'collection.json');

function generateSkillWrapper(manifest, skillPath) {
  const { skill_name, role, title, description, when_to_use, phase, autonomy_level, layer } = manifest;

  const skillDir = path.dirname(skillPath);
  const markdownFile = path.join(skillDir, 'README.md');

  // Check if there's existing markdown documentation
  let docContent = '';
  if (fs.existsSync(markdownFile)) {
    docContent = fs.readFileSync(markdownFile, 'utf-8');
  }

  // Extract first paragraph from markdown for context
  const docLines = docContent.split('\n');
  let docSummary = '';
  for (const line of docLines) {
    if (line.startsWith('# ') || line.startsWith('## ')) continue;
    if (line.trim() && !line.startsWith('**')) {
      docSummary = line.trim();
      break;
    }
  }

  const skillMdContent = `---
name: ${skill_name}
description: ${description || title}
---

# Skill: ${title}

**Role:** ${role}
**Version:** v1.0.0
**Phase:** ${phase || 'Unknown'}
**Autonomy Level:** ${autonomy_level || 'Unknown'}
**Layer:** ${layer || 'Unknown'}

## What This Skill Does

${description || title}

## When to Use

${when_to_use || `Use this skill for ${title.toLowerCase()} tasks.`}

## How to Invoke

Call this skill from Claude Code to access the "${title}" pattern and implementation.

## Reference Documentation

${docSummary ? `> ${docSummary}` : 'See the README.md in this directory for full documentation.'}

---

*This is an auto-generated wrapper. Source: Agentic-Builder-Skills*
`;

  return skillMdContent;
}

function main() {
  console.log('Generating Claude Code skill wrappers...\n');

  try {
    const collection = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf-8'));
    let successCount = 0;
    let skipCount = 0;

    for (const skill of collection.skills) {
      const manifestPath = path.join(REPO_ROOT, skill.path);

      if (!fs.existsSync(manifestPath)) {
        console.log(`⚠ Manifest not found: ${skill.path}`);
        skipCount++;
        continue;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const skillDir = path.dirname(manifestPath);
      const skillMdPath = path.join(skillDir, 'CLAUDE_SKILL.md');

      const wrapper = generateSkillWrapper(manifest, manifestPath);
      fs.writeFileSync(skillMdPath, wrapper, 'utf-8');

      console.log(`✓ Created ${path.relative(REPO_ROOT, skillMdPath)}`);
      successCount++;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('SKILL WRAPPER GENERATION COMPLETE');
    console.log(`${'='.repeat(60)}`);
    console.log(`✓ Generated: ${successCount} skill wrappers`);
    if (skipCount > 0) console.log(`⚠ Skipped: ${skipCount}`);
    console.log(`\nAll skills are now discoverable in Claude Code!\n`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
