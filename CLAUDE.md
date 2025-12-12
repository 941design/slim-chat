- When running playwright e2e tests use `npm run test:e2e:docker` in order to not interfere with the desktop system.
- Cleanup temporary files after implementation. that accounts for markdown files, as well as temporary backups of code.
- Do NOT create markdown documents for results unless absolutely necessary (e.g. for resuming a task) or when asked to.
- ALL implementation guides you create MUST be optimized for/addressed at AI coding agents.
- When asked for an opinion, always provide a critical, balanced assessment looking at both pros and cons.
- Never rewrite git history.

## Documentation Guidelines

**specs/spec.md** — Software specification for agents
- High-level requirements, architecture, behavior, and acceptance criteria
- No concrete implementation advice unless there's a compelling functional/non-functional reason
- Avoid specific file paths, code snippets, or configuration JSON
- Focus on *what* and *why*, not *how*

**README.md** — For human readers
- Usage, installation, development workflow, and maintenance
- No implementation details; link to `docs/` for in-depth topics
- Keep command examples practical and copy-pasteable

**docs/** — Detailed guides
- Step-by-step procedures (e.g., RSA key setup, dev mode testing)
- Implementation-level documentation when depth is needed
- Technical architecture details (`docs/architecture.md`)
