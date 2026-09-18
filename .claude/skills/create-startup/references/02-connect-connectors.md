# Step 2 — Connect the service connectors

Goal: the user should never have to open a dashboard and copy keys for services that expose an
MCP. Connect each service's MCP server so you can configure it directly. Most are remote HTTP
servers with a one-time browser OAuth login.

`--scope project` writes these to `.mcp.json` at the repo root, so they ship with the boilerplate
— anyone who clones it inherits the same connectors and only needs to authenticate.

## 2a. Add the connectors

**Management connectors** — let you create and configure resources on the user's account:

| Service | Add command |
| --- | --- |
| Supabase | `claude mcp add --scope project --transport http supabase https://mcp.supabase.com/mcp` |
| Autumn | `claude mcp add --scope project --transport http autumn https://mcp.useautumn.com/mcp` |
| PostHog | `claude mcp add --scope project --transport http posthog https://mcp.posthog.com/mcp` |
| Resend | `claude mcp add --scope project --transport http resend https://mcp.resend.com/mcp` |
| Vercel | `claude mcp add --scope project --transport http vercel https://mcp.vercel.com` |

**Docs / dev-tools connectors** — no account config, but they make building accurate:

| Service | How to add |
| --- | --- |
| OpenAI docs | `claude mcp add --scope project --transport http openaiDeveloperDocs https://developers.openai.com/mcp` |
| Next.js devtools | stdio server (below) — activates once `pnpm dev` runs |

The Next.js devtools server is local stdio and only connects to a running Next 16+ dev server, so
add it to `.mcp.json` now and it stays dormant until Step 5:

```json
{
  "mcpServers": {
    "next-devtools": { "command": "pnpm", "args": ["dlx", "next-devtools-mcp@latest"] }
  }
}
```

## 2b. Not an MCP connector: Better Auth

Better Auth's "MCP plugin" turns *your* app into an OAuth provider for external MCP clients — it
is **not** a server that configures Better Auth for you. There's nothing to connect; Better Auth
is already wired in `src/infra/auth/auth.ts` and is configured via env (Google/Microsoft creds in
Step 4). Mention this so it isn't mistaken for a missing integration.

## 2c. Authenticate each connector

1. Tell the user to run `/mcp` in Claude Code.
2. For each server (`supabase`, `autumn`, `posthog`, `resend`, `vercel`, `openaiDeveloperDocs`),
   have them select it and choose **Authenticate**, completing the browser sign-in. Each grants
   this session the same access as their own account on that service — approve only what's
   recognized.
3. OAuth in Claude Code must run from a **regular terminal**, not an embedded IDE terminal. If a
   server won't authenticate, retry from a plain terminal.

## 2d. Verify

- Run `claude mcp list` and confirm every server is connected.
- Confirm `.mcp.json` contains all seven entries (five management + OpenAI docs + next-devtools).
- Report a short checklist (connected / needs auth / skipped), then move to Step 3.

> If the user only wants local development for now, Resend and Vercel auth can be deferred — but
> for the production end state, all five management connectors should be authenticated.
