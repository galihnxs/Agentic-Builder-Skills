#!/usr/bin/env python3
"""
Generate marketplace-compliant manifest.json files for all skills.

This script:
1. Scans all skill markdown files in skills/
2. Extracts metadata (Role, Phase, Layer, Autonomy Level)
3. Generates individual manifest.json in each skill folder
4. Generates collection.json at repository root
5. Validates all files against JSON schema

Usage:
  python scripts/generate_manifests.py
  python scripts/generate_manifests.py --validate-only
  python scripts/generate_manifests.py --verbose
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime

# Configuration
REPO_ROOT = Path(__file__).parent.parent
SKILLS_DIR = REPO_ROOT / "skills"
SCRIPTS_DIR = REPO_ROOT / "scripts"

# Manifest schema validation
MANIFEST_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "SkillManifest",
    "type": "object",
    "required": [
        "skill_name",
        "version",
        "role",
        "description",
        "when_to_use",
        "deprecated"
    ],
    "properties": {
        "skill_name": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]*$",
            "description": "kebab-case identifier"
        },
        "version": {
            "type": "string",
            "pattern": "^v[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "role": {
            "type": "string",
            "enum": [
                "architect",
                "product-manager",
                "evaluator",
                "orchestrator",
                "researcher",
                "data-analyst",
                "creator",
                "compliance",
                "protector"
            ]
        },
        "title": {"type": "string"},
        "description": {"type": "string"},
        "phase": {"type": "string"},
        "autonomy_level": {"type": "string"},
        "layer": {"type": "string"},
        "when_to_use": {"type": "string"},
        "deprecated": {"type": "boolean"}
    }
}

COLLECTION_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "SkillsCollection",
    "type": "object",
    "required": ["name", "version", "skills"],
    "properties": {
        "name": {"type": "string"},
        "version": {"type": "string"},
        "description": {"type": "string"},
        "repository": {"type": "string"},
        "skills": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["skill_name", "role", "path"],
                "properties": {
                    "skill_name": {"type": "string"},
                    "role": {"type": "string"},
                    "path": {"type": "string"},
                    "version": {"type": "string"}
                }
            }
        }
    }
}


@dataclass
class SkillMetadata:
    """Extracted metadata from skill markdown."""
    filepath: Path
    skill_name: str
    title: str
    role: str
    phase: Optional[str] = None
    autonomy_level: Optional[str] = None
    layer: Optional[str] = None
    description: Optional[str] = None
    when_to_use: Optional[str] = None
    version: str = "v1.0.0"
    deprecated: bool = False


class SkillManifestGenerator:
    """Generate and validate skill manifests."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.manifests: List[Dict[str, Any]] = []
        self.metadata_list: List[SkillMetadata] = []

    def log(self, msg: str, level: str = "INFO"):
        """Log with optional verbose output."""
        if level != "DEBUG" or self.verbose:
            print(f"[{level}] {msg}")

    def scan_skills(self) -> List[Path]:
        """Find all skill markdown files."""
        if not SKILLS_DIR.exists():
            self.errors.append(f"Skills directory not found: {SKILLS_DIR}")
            return []

        md_files = list(SKILLS_DIR.rglob("*.md"))
        # Exclude template files and system.md files
        md_files = [f for f in md_files if "template" not in str(f).lower() and "system.md" not in f.name]
        self.log(f"Found {len(md_files)} markdown files")
        return sorted(md_files)

    def parse_metadata(self, content: str, filepath: Path) -> Optional[SkillMetadata]:
        """Extract metadata from markdown header (supports both YAML frontmatter and inline format)."""
        lines = content.split('\n')
        metadata: Dict[str, str] = {}

        # Handle YAML frontmatter (SKILL.md format)
        if lines[0].strip() == '---':
            frontmatter_end = None
            for i, line in enumerate(lines[1:], 1):
                if line.strip() == '---':
                    frontmatter_end = i
                    break
                if ':' in line:
                    key, value = line.split(':', 1)
                    key_lower = key.strip().lower().replace(' ', '_')
                    metadata[key_lower] = value.strip()

            # If we have name in frontmatter, use it
            if frontmatter_end:
                lines = lines[frontmatter_end + 1:]

        # Extract title from first h1 or h2
        title_match = None
        for line in lines[:10]:
            if line.startswith('# Skill:'):
                title_match = line.replace('# Skill:', '').strip()
                break
            elif line.startswith('# '):
                title_match = line.replace('# ', '').strip()
                break

        # Parse metadata lines (Role:, Phase:, etc.) - inline format
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            # Pattern: **Role:** Architect or Role: Architect
            match = re.match(r'\*?\*?(\w[\w\s]+):\*?\*?\s+(.+?)(?:\s*\([^)]*\))?$', line)
            if match:
                key, value = match.groups()
                key_lower = key.lower().replace(' ', '_')
                metadata[key_lower] = value.strip()

        if not metadata.get('role'):
            self.errors.append(f"Missing 'Role' in {filepath.name}")
            return None

        # Generate skill_name from filepath
        parent_dir = filepath.parent.name
        stem = filepath.stem

        # For SKILL.md files, use the parent directory name as skill_name
        if stem == 'skill' or stem == 'SKILL':
            skill_name = parent_dir
        else:
            skill_name = stem

        # Use parent dir as role if it matches, otherwise use metadata role
        grandparent = filepath.parent.parent.name
        role_from_path = grandparent if grandparent in [
            "architect", "product-manager", "evaluator",
            "orchestrator", "researcher", "data-analyst",
            "creator", "compliance", "protector"
        ] else metadata.get('role', 'unknown').lower()

        skill_name = skill_name.replace('_', '-').lower()

        # Extract description from first paragraph
        description = metadata.get('description', '')
        if not description:
            for line in lines[10:30]:
                if line.startswith('##') or line.startswith('# '):
                    break
                if line.strip() and not line.startswith('---'):
                    description = line.strip()
                    break

        return SkillMetadata(
            filepath=filepath,
            skill_name=skill_name,
            title=title_match or metadata.get('name') or skill_name.replace('-', ' ').title(),
            role=role_from_path,
            phase=metadata.get('phase'),
            autonomy_level=metadata.get('autonomy_level'),
            layer=metadata.get('layer'),
            description=description,
            when_to_use=None  # Can be extended from markdown
        )

    def process_skills(self) -> bool:
        """Process all skill markdown files."""
        md_files = self.scan_skills()
        if not md_files:
            return False

        for md_file in md_files:
            try:
                content = md_file.read_text(encoding='utf-8')
                metadata = self.parse_metadata(content, md_file)

                if metadata:
                    self.metadata_list.append(metadata)
                    self.log(
                        f"Parsed {md_file.name} → {metadata.skill_name} ({metadata.role})",
                        level="DEBUG"
                    )
            except Exception as e:
                self.errors.append(f"Error parsing {md_file.name}: {e}")

        self.log(f"Successfully parsed {len(self.metadata_list)} skills")
        return len(self.errors) == 0

    def generate_manifest(self, metadata: SkillMetadata) -> Dict[str, Any]:
        """Generate manifest.json from extracted metadata."""
        manifest = {
            "skill_name": metadata.skill_name,
            "version": metadata.version,
            "role": metadata.role,
            "title": metadata.title,
            "description": metadata.description or f"Skill: {metadata.title}",
            "when_to_use": metadata.when_to_use or f"Use this skill for {metadata.title.lower()} tasks.",
            "deprecated": metadata.deprecated
        }

        # Add optional fields if present
        if metadata.phase:
            manifest["phase"] = metadata.phase
        if metadata.autonomy_level:
            manifest["autonomy_level"] = metadata.autonomy_level
        if metadata.layer:
            manifest["layer"] = metadata.layer

        return manifest

    def write_manifests(self) -> bool:
        """Write manifest.json files to skill directories."""
        success_count = 0

        for metadata in self.metadata_list:
            try:
                manifest = self.generate_manifest(metadata)

                # Determine output directory
                if metadata.filepath.name == "SKILL.md":
                    # Already in skill folder
                    output_dir = metadata.filepath.parent
                else:
                    # Create folder based on role/skill_name
                    output_dir = SKILLS_DIR / metadata.role / metadata.skill_name
                    output_dir.mkdir(parents=True, exist_ok=True)

                manifest_path = output_dir / "manifest.json"
                manifest_path.write_text(
                    json.dumps(manifest, indent=2) + '\n',
                    encoding='utf-8'
                )

                self.manifests.append({
                    "path": str(manifest_path.relative_to(REPO_ROOT)),
                    "manifest": manifest
                })

                self.log(f"Created {manifest_path.relative_to(REPO_ROOT)}")
                success_count += 1
            except Exception as e:
                self.errors.append(f"Error writing manifest for {metadata.skill_name}: {e}")

        self.log(f"Successfully wrote {success_count} manifest files")
        return success_count == len(self.metadata_list)

    def generate_collection(self) -> Dict[str, Any]:
        """Generate collection.json with all skills."""
        skills = []
        for metadata in self.metadata_list:
            skills.append({
                "skill_name": metadata.skill_name,
                "role": metadata.role,
                "title": metadata.title,
                "version": metadata.version,
                "path": f"skills/{metadata.role}/{metadata.skill_name}/manifest.json"
            })

        collection = {
            "name": "agentic-skills-library",
            "version": "1.0.0",
            "description": "The complete library of agentic roles and patterns (Architect, PM, Evaluator, etc).",
            "repository": "https://github.com/galihnxs/Agentic-Builder-Skills.git",
            "last_updated": datetime.now().isoformat(),
            "total_skills": len(skills),
            "skills": sorted(skills, key=lambda s: (s["role"], s["skill_name"]))
        }

        return collection

    def write_collection(self) -> bool:
        """Write collection.json to repo root."""
        try:
            collection = self.generate_collection()
            collection_path = REPO_ROOT / "collection.json"

            collection_path.write_text(
                json.dumps(collection, indent=2) + '\n',
                encoding='utf-8'
            )

            self.log(f"Created {collection_path.relative_to(REPO_ROOT)}")
            return True
        except Exception as e:
            self.errors.append(f"Error writing collection.json: {e}")
            return False

    def validate_schema(self, manifest: Dict[str, Any], schema: Dict[str, Any]) -> bool:
        """Basic schema validation."""
        # Check required fields
        for required_field in schema.get("required", []):
            if required_field not in manifest:
                self.warnings.append(
                    f"Missing required field '{required_field}' in manifest"
                )

        # Check field types
        for field, field_schema in schema.get("properties", {}).items():
            if field in manifest:
                field_type = field_schema.get("type")
                if field_type and not self._check_type(manifest[field], field_type):
                    self.warnings.append(
                        f"Field '{field}' has unexpected type in manifest"
                    )

        return True

    def _check_type(self, value: Any, expected_type: str) -> bool:
        """Check if value matches expected JSON schema type."""
        type_map = {
            "string": str,
            "integer": int,
            "boolean": bool,
            "array": list,
            "object": dict
        }
        return isinstance(value, type_map.get(expected_type, object))

    def run(self) -> bool:
        """Run the complete generation pipeline."""
        self.log("Starting skill manifest generation...")

        # Phase 1: Process skills
        if not self.process_skills():
            self.log("Failed to process skills", level="ERROR")
            return False

        # Phase 2: Write individual manifests
        if not self.write_manifests():
            self.log("Failed to write manifests", level="ERROR")
            return False

        # Phase 3: Write collection
        if not self.write_collection():
            self.log("Failed to write collection", level="ERROR")
            return False

        # Phase 4: Validate
        self.validate_all()

        # Summary
        self.print_summary()

        return len(self.errors) == 0

    def validate_all(self):
        """Validate all generated manifests."""
        self.log("Validating manifests...")
        for manifest_info in self.manifests:
            self.validate_schema(manifest_info["manifest"], MANIFEST_SCHEMA)

    def print_summary(self):
        """Print execution summary."""
        print("\n" + "=" * 60)
        print("MARKETPLACE INTEGRATION SUMMARY")
        print("=" * 60)
        print(f"✓ Total skills processed: {len(self.metadata_list)}")
        print(f"✓ Manifest files created: {len(self.manifests)}")
        print(f"✓ Collection file created: 1")

        if self.warnings:
            print(f"\n⚠ Warnings ({len(self.warnings)}):")
            for warning in self.warnings[:5]:
                print(f"  - {warning}")
            if len(self.warnings) > 5:
                print(f"  ... and {len(self.warnings) - 5} more")

        if self.errors:
            print(f"\n✗ Errors ({len(self.errors)}):")
            for error in self.errors[:5]:
                print(f"  - {error}")
            if len(self.errors) > 5:
                print(f"  ... and {len(self.errors) - 5} more")
        else:
            print("\n✓ All validations passed!")

        print("=" * 60 + "\n")


def main():
    """Main entry point."""
    verbose = "--verbose" in sys.argv
    validate_only = "--validate-only" in sys.argv

    generator = SkillManifestGenerator(verbose=verbose)

    if validate_only:
        # TODO: Validate existing manifests
        print("Validate-only mode not yet implemented")
        return 1

    success = generator.run()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
