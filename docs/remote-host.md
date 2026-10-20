# Remote Odin: set it up and connect

Odin can run its sessions on an EC2 instance in your own AWS account instead
of on your Mac. Each session there runs Claude in tmux, so it keeps working
with the laptop asleep or shut. Odin reaches the instance through AWS Systems
Manager (SSM) with your own AWS sign-in: no open port, no public IP, no SSH
key to manage, and nothing to install beyond Odin.

> The code: `apps/desktop/src/main/lib/remote-host` (AWS, SSM, the session
> scripts, the host service), `apps/desktop/src/main/remote-shell` (what a
> pane runs to reach the host) and `RemoteHostSection.tsx` in Settings.

## Before you start

- **A Mac (Apple Silicon or Intel) or Windows x64.** Odin downloads AWS's
  session-manager-plugin for those on first use; a Linux laptop can't connect
  yet.
- **An AWS profile** in `~/.aws/config` that can see the account, SSO or
  access keys. With SSO, the aws CLI you already use signs in; when the
  sign-in expires later, Odin opens the approval page by itself.
- **An EC2 instance you created**, in the region you'll pick. Ubuntu and
  Amazon Linux images work as they come: they ship the SSM agent and EC2
  Instance Connect, which Odin's one-time login keys need. The instance needs
  outbound internet (SSM, claude.ai, GitHub) and a login user with
  passwordless sudo, as the default `ubuntu` or `ec2-user` has.
- **What your AWS sign-in must be allowed to do.** EC2: describe instances
  and tags, start instances. SSM: describe instance information, send
  command, get command invocation, start session. EC2 Instance Connect: send
  SSH public key. "Set up access" also needs IAM (get instance profile,
  create role, attach role policy, create instance profile, add role to
  instance profile) and EC2 associate instance profile.
- **GitHub connected in Odin**, so the agent on the host can clone and push
  with your token.

## Set it up

Everything is in Settings > Sessions > Remote host.

1. **Pick the account.** Choose the AWS profile and region. Every instance in
   the region is listed; add tags (for example `Owner = you`) or use the
   search box to shorten the list.
2. **Start** the instance if it is stopped. It shows as running within about
   a minute.
3. **Set up access** if the row says "SSM offline". Odin attaches the
   `AmazonSSMManagedInstanceCore` policy to the instance's role, or makes an
   `OdinSsmHost` role and instance profile and attaches that. The SSM agent
   registers on its own within a few minutes; rebooting the instance makes
   it quicker.
4. **Set the SSH username** to the image's login user: `ubuntu` on Ubuntu,
   `ec2-user` on Amazon Linux. Sessions run as that user.
5. **Set up** once the row says "SSM online". Over SSM, Odin installs what
   sessions need and is missing: tmux, git, curl and python3 from the
   package manager, Claude Code and the GitHub CLI into the user's
   `~/.local/bin`, and Odin's own small host service under systemd. A minute
   or two; the row then says "set up for sessions". Safe to run again.
6. **Use.** The first time, your browser opens once to approve Claude: the
   host gets its own sign-in to your Claude plan, kept encrypted on the Mac,
   and refreshes it by itself after that. The host is now in use, with repos
   cloned under `~/repos` there.
7. **Optional switches**, in the same section:
   - *Connectors on the host*: Slack, Notion, Jira, GitHub, ClickUp. Their
     tokens go to the host, readable only by Odin's service user there, so
     tasks from those sources work with the Mac closed. Anyone who can open
     a root shell on the instance can still read them. Gmail never goes.
     A task from a source whose connector isn't on the host stays on the Mac.
   - *Claude setup on the host*: copies your `~/.claude` instructions,
     skills, commands and agents, plugins, settings and hooks to the host.
     Never your login, accounts, conversations or history. Press "Sync
     again" after you change them here. Hooks that name a file the host
     doesn't have are dropped and listed.
   - *API key at the plan limit*: a session that hits your plan's usage
     limit continues on the `ANTHROPIC_API_KEY` from your shell, billed per
     token, for five hours or until the limit resets. Off, it waits.

## Work on it

- **Where a session runs.** With "Sessions start on <host>" on, new sessions
  start there, Night Agent runs included. The new-session dialog has a
  "This computer / Remote: <host>" picker for one session. With the switch
  off, new sessions start on the Mac; a session already on the host still
  resumes there. Turning the switch off also removes the connector tokens
  from the host.
- **What happens at launch.** The pane logs in over SSM with a one-time key
  and attaches to a tmux session named after the conversation. The host
  clones the repo's origin under `~/repos/<name>` over https with your
  GitHub token, adds a worktree at `.worktrees/odin-<id>` on branch
  `odin/<id>`, and runs Claude there. Files you name in the prompt (under
  50 MB) are copied to `~/.odin/files` on the host first, and the prompt
  names the copies.
- **What you see.** The card wears a server icon: green while connected,
  yellow and pulsing while connecting, red and struck through when not
  connected (Resume connects again). The chat view says "Connected to",
  "Could not connect to" or "Disconnected from <host>" with the time. The
  transcript is mirrored back every two seconds, so the chat view, Resume
  and Session History work as for a local session.
- **The agent and your Mac.** The agent's calls to Odin (board actions,
  hooks, file reads) travel back through the pane's tunnel; connector calls
  are answered on the host itself. With the Mac asleep, the agent is told
  plainly that Odin can't be reached, and connector calls still work. The
  agent is also told it runs on the host, so it makes its own worktrees and
  opens PRs with `gh` from there instead of using Odin's worktree and Shell
  actions.
- **Moving and ending.** In the card menu, "Run on this computer" copies the
  conversation to the Mac and ends it on the host; "Restart session" quits
  Claude on the host and starts it again. Done ends the tmux session there.
  "Change host" in Settings picks another instance.
- **Night Agent.** While the Mac is awake, Odin sends tonight's plan to the
  host; a runner there starts the tasks one at a time in tmux. Sessions it
  ran show up on the board a few minutes after Odin opens.

## If something fails

| What you see | What to do |
|---|---|
| "AWS did not answer" | Wrong profile or region, or an expired SSO session. Pick again, or run `aws sso login --profile <name>`. |
| "SSM offline" that stays | Press Set up access, then wait a few minutes or reboot the instance. The instance needs outbound access to SSM. |
| "setup could not install Claude" | No outbound internet on the instance, or the SSH username isn't the image's login user. Fix it and press Set up again. |
| "Blocked: your AWS sign-in expired" in a pane | Approve the sign-in in the browser tab Odin opened. Press Enter in the pane for a new link. |
| "Couldn't write the tokens on the host" | The SSH username needs passwordless sudo, and the host needs systemd. |
| A host session asks you to log in to Claude | Settings > Sessions > Remote host > "Sign in again". |
| "SSM connections are not available on linux" | Only a Mac or Windows x64 can connect for now. |

Odin never stops the instance. Stop it in AWS when you don't need it; Start
in Settings brings it back.
