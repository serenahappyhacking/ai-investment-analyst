## Permissions (Auto-Approve)

Tool permissions are configured in `.claude/settings.local.json` (not in this file).
Current broad patterns auto-approve: Read, Write, Edit, Bash(npm/npx/git/gh/curl/*), MCP tools.

To launch with additional CLI overrides:
```bash
claude --allowedTools "Bash(npm run test)" "Write" "Read"
```

For full auto-approve (no confirmations at all):
```bash
claude --dangerously-skip-permissions
```

---

## Session Management

### Start of Session
1. Read `claude-progress.txt` before doing anything else.
2. Read `AGENTS.md` (if it exists) to understand project structure and boundaries.
3. Confirm understanding of current state before proceeding with any task.

### End of Session
Before the session ends, update `claude-progress.txt` with:
- **Last Updated**: current date and time
- **Current State**: brief summary of where the project stands right now
- **What Was Completed**: list of concrete changes made in this session (files created, modified, deleted; tests added/fixed; features implemented)
- **What Is Blocked**: any issues, dependencies, or decisions that need human input
- **Next Steps**: prioritized list of what should be done in the next session

### Rules
- Keep `claude-progress.txt` concise — under 50 lines. Overwrite previous session content, do not append infinitely.
- If a major architectural decision was made, also update `AGENTS.md` (if it exists).
- Never delete or truncate progress info without writing the replacement first.
