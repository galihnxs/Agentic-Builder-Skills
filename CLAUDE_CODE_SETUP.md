# Adding Agentic Skills to Claude Code

Your 31 skills are now registered as a Claude Code plugin. Here's how to activate them.

---

## Option 1: Add as a Local Plugin (Recommended)

### In Claude Code Settings

1. Open Claude Code **Settings** → **Customize**
2. Go to **Personal plugins**
3. Click **+** to add a new plugin
4. Enter the path to the Agentic-Builder-Skills repository:
   ```
   /Users/galih/Documents/GitHub/core-itera/Agentic-Builder-Skills
   ```
   (or adjust path for your system)
5. Claude Code will automatically discover the `.claude-plugin/plugin.json` manifest

### In settings.json

Alternatively, edit your Claude Code settings.json:

```json
{
  "personalPlugins": [
    {
      "path": "/path/to/Agentic-Builder-Skills",
      "enabled": true
    }
  ]
}
```

---

## Option 2: Via Environment Variable

Set the plugin path before launching Claude Code:

```bash
export CLAUDE_PLUGINS_PATH="/path/to/Agentic-Builder-Skills"
```

Then launch Claude Code.

---

## Option 3: Via GitHub Repository

If you push to GitHub:

1. Make sure the repository is public (or grant access)
2. In Claude Code settings, add:
   ```
   https://github.com/galihnxs/Agentic-Builder-Skills.git
   ```

---

## What Happens After Registration

Once registered, you'll see:

### In Claude Code Skills Panel
- **Personal plugins** section shows "agentic-skills-library"
- All 31 skills appear as expandable list
- Organized by role (architect, compliance, creator, etc.)

### Quick Access
Click any skill to:
- View quick reference (CLAUDE_SKILL.md)
- Access full documentation
- Read manifest metadata
- Copy system prompts and schemas

---

## Verifying Installation

After adding the plugin, check that you see:

```
Skills Panel
├── agentic-skills-library
│   ├── architect (4 skills)
│   ├── compliance (3 skills)
│   ├── creator (2 skills)
│   ├── data-analyst (4 skills)
│   ├── evaluator (3 skills)
│   ├── orchestrator (4 skills)
│   ├── product-manager (5 skills)
│   ├── protector (3 skills)
│   └── researcher (3 skills)
```

---

## Using Skills in Claude Code

Once installed, you can:

### 1. **Browse Skills**
   - Open Skills panel
   - Expand "agentic-skills-library"
   - Expand any role to see skills
   - Click skill name to view details

### 2. **Read Documentation**
   - Click any skill
   - View CLAUDE_SKILL.md (quick reference)
   - Open full markdown file (complete docs)
   - Check manifest.json (technical metadata)

### 3. **Copy Artifacts**
   - System prompts
   - JSON schemas
   - Code templates
   - Examples

### 4. **Reference in Sessions**
   - Link to skills in your chat
   - Share skill names with collaborators
   - Build on patterns from multiple skills

---

## Troubleshooting

### Skills Not Appearing?

1. **Check plugin path:** Verify path is correct and repository exists
2. **Reload Claude Code:** Close and reopen
3. **Check permissions:** Ensure read access to repository
4. **Verify plugin.json:** Check `.claude-plugin/plugin.json` exists and is valid JSON

### Plugin Loads But No Skills?

1. Check that skill paths in plugin.json point to existing files
2. Run: `node scripts/generate_skill_wrappers.js` to regenerate CLAUDE_SKILL.md
3. Reload Claude Code

### Only Some Skills Appear?

1. Verify all CLAUDE_SKILL.md files exist:
   ```bash
   find skills -name "CLAUDE_SKILL.md" | wc -l
   # Should output: 31
   ```
2. If less than 31, regenerate:
   ```bash
   node scripts/generate_skill_wrappers.js
   ```

---

## File Structure Claude Code Reads

```
Agentic-Builder-Skills/
├── .claude-plugin/
│   └── plugin.json                    ← Claude Code reads this
└── skills/
    ├── architect/
    │   ├── skill-based-architecture/
    │   │   ├── CLAUDE_SKILL.md       ← Quick reference
    │   │   ├── skill-based-architecture.md    ← Full docs
    │   │   └── manifest.json          ← Metadata
    │   └── [3 more...]
    └── [8 other roles...]
```

---

## Next Steps

After installation:

1. **Explore skills** — Browse all 31 patterns
2. **Find your use case** — Use USAGE_GUIDE.md
3. **Read documentation** — Full markdown files for each skill
4. **Copy artifacts** — System prompts, schemas, code
5. **Apply patterns** — Adapt to your projects

---

## Support

- **Quick reference:** CLAUDE_SKILL.md in each skill folder
- **Full docs:** Skill markdown files (e.g., skill-based-architecture.md)
- **All skills:** SKILL.md (master index)
- **Usage guide:** USAGE_GUIDE.md
- **Plugin config:** .claude-plugin/plugin.json

---

*Agentic-Builder-Skills is now integrated with Claude Code!*
