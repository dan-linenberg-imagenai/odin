# Remote sessions: Claude runs on the server

## Problem

Remote connect (Settings > Advanced > Remote server) moves only host-service, the
workspace backend, to the server. Every Claude session - Dev Board, New Session,
Start session on Tasks, Raven, Night Agent, automations, resume - is still spawned
by the desktop app's own terminal stack:

```
renderer terminal.createOrAttach -> electron main terminal router
  -> WorkspaceRuntimeRegistry.getDefault() (always local)
  -> DaemonTerminalManager -> the laptop's terminal-host daemon
```

So agents run on the laptop and stop when it sleeps. The goal: with a remote
connected, sessions run on the server, keep working with the laptop closed, and
the board shows the right state when the laptop comes back.

## Approach

Keep the renderer's terminal API exactly as it is and swap the backend under it.
`WorkspaceRuntime` was built for this ("local daemon today, or cloud/SSH in the
future"); host-service already has a durable PTY layer (pty-daemon, detached,
adopted across restarts), a terminal WebSocket, and an agent-hook endpoint.

### 1. Routing runtime (desktop main)
`RoutingTerminalRuntime` becomes the default runtime. In remote mode every
terminal operation goes to `RemoteTerminalRuntime`; otherwise to the local one.
It forwards both backends' events (`data:`, `exit:`, `disconnect:`,
`terminalExit`), so the router, the renderer stream and the board are unchanged.
A pane alive on the laptop stays there, so sessions started before connecting
keep running locally.

Remote mode follows the user's choice, not the tunnel: it holds from Connect to
Disconnect, survives drops (the manager reconnects with backoff) and app restarts
(the active connection is resumed at startup). While the tunnel is down the
session list throws instead of answering "none" - an empty list would read as
every remote session having died, and the board would close or re-launch them on
the laptop.

### 2. RemoteTerminalRuntime (desktop main)
Implements `TerminalRuntime` against host-service through the SSH tunnel.
The host terminal id is the pane id.
- `createOrAttach`: attach if the server has the session, else create it; open
  `WS /terminal/<paneId>`; return a snapshot so the pane paints immediately.
- `write` / `resize` / `detach`: over the WebSocket. `kill`: `terminal.killSession`.
- `management.listSessions`, `readScreen`, `getSession`: `terminal.listSessions` /
  `terminal.snapshot`, mapped to the local shapes (board liveness, screen scan).
- Reconnects the WebSockets after the tunnel drops; output written meanwhile is
  replayed by the server.

### 3. host-service
- `terminal.createSession` gains `command`: run it as `$SHELL -lc <command>`, so the
  PTY ends when Claude ends - the same contract as the local daemon - instead of
  typing it into an interactive shell.
- PTY env adds `ODIN_PANE_ID` / `ODIN_TAB_ID` (the hooks and shell rule key on them).
- A session's cwd gets a host project + workspace on demand (`project` import of the
  repo on the server), which the terminal layer and its reaper require.

### 4. Paths live on the server
In remote mode, a path the laptop can't see is a server path:
- `projects.openFromPath` validates it on the server instead of the laptop disk.
- The default session folder is kept per side (`remoteDefaultRepo` beside
  `defaultRepo`); when none is set, the launcher asks for a server path (checked on
  the server) instead of opening the laptop's folder dialog.
- `filesystem.writeFile` / `createDirectory` for a remote workspace's session files
  (`.odin/task-*.md`, rules, attachments) write on the server.

### 5. Server agent setup (at connect)
- `<odin folder>/hooks/{notify,subagent-cap,shell-rule}.sh`, rendered from the same
  templates as the laptop's.
- Odin's hooks merged into the server's `~/.claude/settings.json`, including
  `skipDangerousModePermissionPrompt`. They are gated on `ODIN_HOME_DIR`, so they do
  nothing for Claude run outside Odin.
- `claude` on the server's PATH for sessions: the system one if present, otherwise
  Claude Code installed into `<odin folder>` with Odin's own Node.

### 6. Status survives the laptop closing
- On the server, `notify.sh` posts each hook to host-service (`notifications.hook`),
  which records the last state per session and broadcasts it on `/events`.
- Desktop main subscribes to `/events` and feeds the same `AGENT_LIFECYCLE` path the
  board already uses, so cards move as they do locally.
- On every (re)connect it replays each live session's last recorded state, and the
  liveness poll marks sessions that ended meanwhile - so after a night with the lid
  shut, the board shows what actually happened.

## Out of scope here (next milestones)

These keep working for local sessions; for remote sessions they are degraded until
ported:
- Transcript features reading `~/.claude/projects` (chat view, briefs, session
  history search, looping detection): need host-service procedures over the
  server's transcripts.
- Diff tab, PR states, worktree storage and the pruner on server paths.
- Night Agent, automations, Slack auto-launch and idle close: renderer timers today,
  so they only fire while the laptop is open. Running them with the lid shut means a
  server-side scheduler.
- The launch gate and disk chip measure the laptop, not the server.
- The `$ODIN_PORT` tools sessions call (`/read`, `/file`, `/odin`, `/shell/run`).
- A Sign in to Claude flow for the server (until then, sign in once in a session's
  terminal).

## Testing
- Unit tests for the runtime mapping, command building and setup rendering.
- An end-to-end harness that drives the real `RemoteTerminalRuntime` against a real
  host-service on a Linux server: launch, stream, input, resize, tunnel drop and
  reconnect with status catch-up, exit, kill.
- CI (lint, typecheck, tests, smoke) for the local path, which must not change.
