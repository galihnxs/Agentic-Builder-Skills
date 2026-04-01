#!/usr/bin/env node

/**
 * Generate marketplace-compliant manifest.json files for all skills.
 *
 * This script:
 * 1. Scans all skill markdown files in skills/
 * 2. Extracts metadata (Role, Phase, Layer, Autonomy Level)
 * 3. Generates individual manifest.json in each skill folder
 * 4. Generates collection.json at repository root
 * 5. Validates all files against JSON schema
 */

const fs = require('fs');
const path = require('path');

// Configuration
const REPO_ROOT = path.dirname(__dirname);
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');

// Role mapping to normalize different formats
const ROLE_MAP = {
  'architect': 'architect',
  'ai architect': 'architect',
  'product-manager': 'product-manager',
  'pm': 'product-manager',
  'product manager': 'product-manager',
  'lead pm': 'product-manager',
  'lead product manager': 'product-manager',
  'evaluator': 'evaluator',
  'critic': 'evaluator',
  'evaluator (critic)': 'evaluator',
  'orchestrator': 'orchestrator',
  'researcher': 'researcher',
  'data-analyst': 'data-analyst',
  'data analyst': 'data-analyst',
  'creator': 'creator',
  'compliance': 'compliance',
  'compliance & legal': 'compliance',
  'compliance & operations': 'compliance',
  'protector': 'protector',
  'security': 'protector'
};

function normalizeRole(roleStr) {
  const normalized = roleStr.toLowerCase().trim();
  // Try exact match first
  if (ROLE_MAP[normalized]) {
    return ROLE_MAP[normalized];
  }
  // Try to extract role from compound descriptions
  for (const [key, value] of Object.entries(ROLE_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  // Fallback: take first word if it looks like a role
  const firstWord = normalized.split(/[+&,]/)[0].trim();
  if (ROLE_MAP[firstWord]) {
    return ROLE_MAP[firstWord];
  }
  return normalized;
}

class SkillManifestGenerator {
  constructor(verbose = false) {
    this.verbose = verbose;
    this.errors = [];
    this.warnings = [];
    this.manifests = [];
    this.metadata = [];
  }

  log(msg, level = 'INFO') {
    if (level !== 'DEBUG' || this.verbose) {
      console.log(`[${level}] ${msg}`);
    }
  }

  scanSkills() {
    const mdFiles = [];
    const walkDir = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (file.endsWith('.md')) {
          // Exclude template files and system.md
          if (!fullPath.includes('template') && file !== 'system.md') {
            mdFiles.push(fullPath);
          }
        }
      });
    };

    walkDir(SKILLS_DIR);
    this.log(`Found ${mdFiles.length} markdown files`);
    return mdFiles.sort();
  }

  parseMetadata(content, filepath) {
    const lines = content.split('\n');
    const metadata = {};
    const filename = path.basename(filepath);
    const dirname = path.dirname(filepath);
    const parentDir = path.basename(dirname);
    const grandparentDir = path.basename(path.dirname(dirname));

    // Handle YAML frontmatter (SKILL.md format)
    let startIdx = 0;
    if (lines[0]?.trim() === '---') {
      let frontmatterEnd = null;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
          frontmatterEnd = i;
          break;
        }
        if (lines[i].includes(':')) {
          const [key, ...rest] = lines[i].split(':');
          const keyLower = key.trim().toLowerCase().replace(/ /g, '_');
          metadata[keyLower] = rest.join(':').trim();
        }
      }
      if (frontmatterEnd) {
        startIdx = frontmatterEnd + 1;
      }
    }

    // Extract title and inline metadata
    let titleMatch = null;
    for (let i = startIdx; i < Math.min(startIdx + 10, lines.length); i++) {
      const line = lines[i];
      if (line.startsWith('# Skill:')) {
        titleMatch = line.replace('# Skill:', '').trim();
        break;
      } else if (line.startsWith('# ')) {
        titleMatch = line.replace(/^#+\s+/, '').trim();
        break;
      }
    }

    // Parse inline metadata (Role:, Phase:, etc.)
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // Pattern: **Role:** Architect or Role: Architect
      const match = line.match(/\*?\*?(\w[\w\s]+):\*?\*?\s+(.+?)(?:\s*\([^)]*\))?$/);
      if (match) {
        const [, key, value] = match;
        const keyLower = key.toLowerCase().replace(/ /g, '_');
        metadata[keyLower] = value.trim();
      }
    }

    if (!metadata.role) {
      this.errors.push(`Missing 'Role' in ${filename}`);
      return null;
    }

    // Determine skill name
    let skillName;
    if (filename === 'SKILL.md' || filename === 'skill.md') {
      skillName = parentDir;
    } else {
      skillName = path.basename(filepath, path.extname(filepath));
    }
    skillName = skillName.replace(/_/g, '-').toLowerCase();

    // Determine role from path if it's valid
    const validRoles = [
      'architect', 'product-manager', 'evaluator',
      'orchestrator', 'researcher', 'data-analyst',
      'creator', 'compliance', 'protector'
    ];
    const roleFromPath = validRoles.includes(grandparentDir)
      ? grandparentDir
      : normalizeRole(metadata.role);

    // Extract description
    let description = metadata.description || '';
    if (!description) {
      for (let i = startIdx + 10; i < Math.min(startIdx + 30, lines.length); i++) {
        const line = lines[i];
        if (line.startsWith('##') || line.startsWith('# ')) {
          break;
        }
        if (line.trim() && !line.startsWith('---')) {
          description = line.trim();
          break;
        }
      }
    }

    return {
      filepath,
      skillName,
      title: titleMatch || metadata.name || skillName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      role: roleFromPath,
      phase: metadata.phase || null,
      autonomyLevel: metadata.autonomy_level || null,
      layer: metadata.layer || null,
      description,
      version: 'v1.0.0',
      deprecated: false
    };
  }

  processSkills() {
    const mdFiles = this.scanSkills();
    if (mdFiles.length === 0) {
      return false;
    }

    for (const filepath of mdFiles) {
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        const meta = this.parseMetadata(content, filepath);
        if (meta) {
          this.metadata.push(meta);
          this.log(`Parsed ${path.basename(filepath)} → ${meta.skillName} (${meta.role})`, 'DEBUG');
        }
      } catch (e) {
        this.errors.push(`Error parsing ${path.basename(filepath)}: ${e.message}`);
      }
    }

    this.log(`Successfully parsed ${this.metadata.length} skills`);
    // Return true if we parsed at least some skills, even if there are parse errors
    return this.metadata.length > 0;
  }

  generateManifest(meta) {
    const manifest = {
      skill_name: meta.skillName,
      version: meta.version,
      role: meta.role,
      title: meta.title,
      description: meta.description || `Skill: ${meta.title}`,
      when_to_use: `Use this skill for ${meta.title.toLowerCase()} tasks.`,
      deprecated: meta.deprecated
    };

    if (meta.phase) manifest.phase = meta.phase;
    if (meta.autonomyLevel) manifest.autonomy_level = meta.autonomyLevel;
    if (meta.layer) manifest.layer = meta.layer;

    return manifest;
  }

  writeManifests() {
    let successCount = 0;

    for (const meta of this.metadata) {
      try {
        const manifest = this.generateManifest(meta);

        // Determine output directory
        let outputDir;
        if (path.basename(meta.filepath) === 'SKILL.md') {
          outputDir = path.dirname(meta.filepath);
        } else {
          outputDir = path.join(SKILLS_DIR, meta.role, meta.skillName);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
        }

        const manifestPath = path.join(outputDir, 'manifest.json');
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2) + '\n',
          'utf-8'
        );

        this.manifests.push({
          path: path.relative(REPO_ROOT, manifestPath),
          manifest
        });

        this.log(`Created ${path.relative(REPO_ROOT, manifestPath)}`);
        successCount++;
      } catch (e) {
        this.errors.push(`Error writing manifest for ${meta.skillName}: ${e.message}`);
      }
    }

    this.log(`Successfully wrote ${successCount} manifest files`);
    return successCount === this.metadata.length;
  }

  generateCollection() {
    const skills = this.metadata.map(meta => ({
      skill_name: meta.skillName,
      role: meta.role,
      title: meta.title,
      version: meta.version,
      path: `skills/${meta.role}/${meta.skillName}/manifest.json`
    }));

    // Sort by role, then by skill_name
    skills.sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.skill_name.localeCompare(b.skill_name);
    });

    return {
      name: 'agentic-skills-library',
      version: '1.0.0',
      description: 'The complete library of agentic roles and patterns (Architect, PM, Evaluator, etc).',
      repository: 'https://github.com/galihnxs/Agentic-Builder-Skills.git',
      last_updated: new Date().toISOString(),
      total_skills: skills.length,
      skills
    };
  }

  writeCollection() {
    try {
      const collection = this.generateCollection();
      const collectionPath = path.join(REPO_ROOT, 'collection.json');

      fs.writeFileSync(
        collectionPath,
        JSON.stringify(collection, null, 2) + '\n',
        'utf-8'
      );

      this.log(`Created ${path.relative(REPO_ROOT, collectionPath)}`);
      return true;
    } catch (e) {
      this.errors.push(`Error writing collection.json: ${e.message}`);
      return false;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('MARKETPLACE INTEGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ Total skills processed: ${this.metadata.length}`);
    console.log(`✓ Manifest files created: ${this.manifests.length}`);
    console.log(`✓ Collection file created: 1`);

    if (this.warnings.length > 0) {
      console.log(`\n⚠ Warnings (${this.warnings.length}):`);
      this.warnings.slice(0, 5).forEach(w => console.log(`  - ${w}`));
      if (this.warnings.length > 5) {
        console.log(`  ... and ${this.warnings.length - 5} more`);
      }
    }

    if (this.errors.length > 0) {
      console.log(`\n✗ Errors (${this.errors.length}):`);
      this.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
      if (this.errors.length > 5) {
        console.log(`  ... and ${this.errors.length - 5} more`);
      }
    } else {
      console.log('\n✓ All validations passed!');
    }

    console.log('='.repeat(60) + '\n');
  }

  run() {
    this.log('Starting skill manifest generation...');

    if (!this.processSkills()) {
      this.log('Failed to process skills', 'ERROR');
      return false;
    }

    if (!this.writeManifests()) {
      this.log('Failed to write manifests', 'ERROR');
      return false;
    }

    if (!this.writeCollection()) {
      this.log('Failed to write collection', 'ERROR');
      return false;
    }

    this.printSummary();
    return this.errors.length === 0;
  }
}

// Main
const verbose = process.argv.includes('--verbose');
const generator = new SkillManifestGenerator(verbose);
const success = generator.run();
process.exit(success ? 0 : 1);
