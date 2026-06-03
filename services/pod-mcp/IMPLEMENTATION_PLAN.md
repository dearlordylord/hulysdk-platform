# pod-mcp — native Huly MCP endpoint (PoC)

Status: **scaffolding**. Branch `feature/pod-mcp` off `develop`.

## Goal

Let a user's coding agent talk to Huly as an MCP server **without installing the
standalone `@firfi/huly-mcp`**. Huly self-hosted exposes `/mcp` directly; the agent
points at `https://<their-huly>/mcp` and authenticates with a Huly token.

This pod is the spike that proves the architecture end-to-end with a minimal tool set.

## Scope (PoC)

- Protocol: MCP `2026-07-28` stateless only (`server/discover`, `tools/list`, `tools/call`).
- Tools: `list_projects`, `create_issue`. Nothing else.
- Auth: Path A — `Authorization: Bearer <huly-token>` (see "Auth" below).
- Transport: stateless HTTP, reusing the dispatcher copied from the standalone server.

Out of scope for the PoC: resources, the full 229-tool catalog, OAuth browser flow
(Path B), the shared `mcp-2026-core` package extraction, billing/telemetry.

## Request flow

```
agent --HTTP POST /mcp--> express
  Authorization: Bearer <huly-token>           [1] extractToken(headers) -> Token | 401
  MCP-Protocol-Version: 2026-07-28             [2] shouldDispatchMcp2026Request(req)
  body: { method, params, ... }                [3] dispatchMcp2026Request(req, res, handlers)
                                               [4] resolveSession(Token) -> TxOperations
                                               [5] handler runs tool over server-client
                                               [6] result wrapped (resultType/ttlMs) -> JSON-RPC
```

The dispatcher (`src/mcp/http-2026-dispatcher.ts`) is **Huly-agnostic** — copied verbatim
from the standalone server's committed worktree (`feature/2026-stateless-http`, `7c52399`).
It depends only on the `McpProtocolHandlers` interface. The Huly-specific work is the
*implementation* of that interface (steps 4–5).

## Verified Huly facts (citations into platform_fork)

| Concern | Facility | Reference |
|---|---|---|
| Pod bootstrap | `setMetadata(serverToken.metadata.Secret/Service, …)`, `setMetadata(serverClient.metadata.Endpoint, AccountsURL)` | `services/ai-bot/pod-ai-bot/src/start.ts:33-36` |
| Validate agent token | `extractToken(req.headers): Token \| undefined` (verifies signature vs `ServerSecret`); `undefined -> 401` | `…/pod-ai-bot/src/server/server.ts:27,41-44` |
| Open session as user | `createClient(transactorEndpoint, token): Promise<Client>` → wrap in `TxOperations` | `…/pod-ai-bot/src/utils/platform.ts:16,22-24` |
| Resolve transactor endpoint | account-client `getWorkspaceInfo()` → endpoint, then `connectPlatform(token, endpoint)` | `…/pod-ai-bot/src/workspace/workspaceClient.ts:121`, `…/utils/account.ts:41-45` |
| Tools target | `tracker.class.Project`, `tracker.class.Issue` | `plugins/tracker/src/index.ts:367-368` |
| Build/packaging | rush monorepo; `"build": "compile"` (platform-rig); tsconfig extends `@hcengineering/platform-rig/profiles/default` | `…/pod-ai-bot/package.json:13-31`, `tsconfig.json:2` |

## Auth

**Path A (this PoC): static Bearer = Huly token.**
- Agent: `claude mcp add --transport http huly https://<huly>/mcp --header "Authorization: Bearer <token>"`.
- Pod: `extractToken(req.headers)` validates + decodes it (no new auth code; reuses Huly's JWT signed by `SERVER_SECRET`).
- Session: per request, resolve the transactor endpoint for `token.workspace` and
  `createClient(endpoint, rawToken)` → the agent acts **as that user**, with that user's permissions.

**Path B (future): OAuth 2.1 browser flow.** Huly is an OAuth *client* (SSO), not a
*server* — there are no `authorize`/`token`/`.well-known`/DCR endpoints. So Path B needs
either Huly to add an authorization server, or this pod to act as a thin OAuth façade
wrapping Huly login. Deferred. The seam below keeps it pluggable.

### The seam (keeps Path B drop-in)

```
type HulySession = { ops: TxOperations; account: AccountUuid; workspace: WorkspaceUuid; close: () => Promise<void> }
resolveSession(req): Promise<HulySession>   // Path A: extractToken + createClient.  Path B later: swap body only.
```

The dispatcher and tool handlers never see a token — only a resolved `HulySession`.

## Files

```
services/pod-mcp/
  IMPLEMENTATION_PLAN.md          this file
  package.json                    @hcengineering/pod-mcp; rush + platform-rig; deps below   [next increment]
  tsconfig.json                   extends platform-rig default                              [done]
  src/
    index.ts                      dotenv config(); void start()                             [done]
    config.ts                     ACCOUNTS_URL, SERVER_SECRET, SERVICE_ID, PORT             [done]
    start.ts                      bootstrap metadata + express + wire dispatcher            [next]
    session.ts                    resolveSession seam (Path A)                              [next]
    mcp/
      http-2026-dispatcher.ts     COPIED verbatim from standalone (Huly-agnostic)           [done, copied]
      protocol-handlers.ts        McpProtocolHandlers interface (interface-only here)       [done]
      handlers.ts                 createMcpProtocolHandlers(session-factory) impl           [next]
    tools/
      list-projects.ts            findAll(tracker.class.Project)                            [next]
      create-issue.ts             create issue under a project                              [next]
      index.ts                    tool registry (name -> {schema, run})                     [next]
```

Deps to add (`workspace:^` unless external): `@hcengineering/core`, `tracker`,
`account-client`, `server-client`, `server-token`, `platform`, `server-core`, plus
external `@modelcontextprotocol/sdk` (pin to the version the dispatcher targets — see
standalone repo), `express`, `cors`, `dotenv`.

## Build-phase tasks (next increment, in order)

1. `package.json` + register the project in `rush.json` (rush won't see it otherwise).
2. Reconcile the copied dispatcher to platform conventions: change `./protocol-handlers.js`
   import to extensionless `./protocol-handlers`; reformat double-quote/dprint style to
   Huly's `eslint-config-standard-with-typescript` (single quotes, no semicolons) **or**
   add a per-dir eslint override for the copied kernel. (Kernel is new to the repo; pick one.)
3. `session.ts` — verify `getWorkspaceInfo()` return shape (endpoint field) and `createClient`
   signature against `…/pod-ai-bot/src/workspace/workspaceClient.ts` before writing.
4. `handlers.ts` + tools. For `create_issue`, cross-check issue creation (number sequence,
   default status, rank) against `.reference/huly-examples/platform-api/examples/issue-*.ts`
   and the standalone server's tracker tools — do **not** guess the issue-creation shape.
5. `start.ts` — bootstrap, then `rush bundle --to @hcengineering/pod-mcp` to verify build.

## Integration test (definition of done for the PoC)

Against local Huly (`.huly-local`), with a real Huly token:

```
INIT='{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}'
LIST='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{...}}}'
CALL='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
# POST each to http://localhost:<port>/mcp with:
#   Authorization: Bearer <huly-token>
#   MCP-Protocol-Version: 2026-07-28, Mcp-Method: <method>, Accept: application/json, text/event-stream
```

Pass = `server/discover` returns server identity; `tools/list` returns the 2 tools;
`list_projects` returns the workspace's real projects; `create_issue` creates an issue
visible in the Huly UI, scoped to the token's user.
