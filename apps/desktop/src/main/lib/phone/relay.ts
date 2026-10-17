import { type ChildProcess, spawn } from "node:child_process";
import { homedir } from "node:os";

/**
 * Phone access away from this Wi-Fi: a server you own (an EC2) serves HTTPS
 * and hands each request to Odin through an SSH reverse tunnel this Mac keeps
 * open - outbound, so the router needs no open port. macOS's own ssh, so
 * there's nothing to install. When Odin itself runs on that server later,
 * the server points at it instead and the phone doesn't notice.
 *
 * On the server: Caddy (or any proxy) with `reverse_proxy 127.0.0.1:4747`.
 */
export type RelayConfig = {
	/** `ubuntu@3.76.62.130` - who to log in as, where. */
	ssh: string;
	/** What the phone opens: `https://3-76-62-130.sslip.io`. */
	url: string;
	/** The private key that logs in; `~` allowed. */
	key: string;
};

export type RelayStatus = {
	state: "off" | "connecting" | "connected" | "retrying";
	error: string | null;
};

/** The port the server's proxy forwards to, on the server's loopback. */
const REMOTE_PORT = 4747;
const RETRY_MS = 5_000;
/** ssh -N prints nothing once up: still running this long means the forward held. */
const SETTLE_MS = 3_000;

let child: ChildProcess | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let status: RelayStatus = { state: "off", error: null };

export const relayStatus = () => status;

const expandHome = (path: string) => path.replace(/^~(?=$|\/)/, homedir());

/** ssh's arguments for the tunnel - kept apart so a test can read them. */
export function tunnelArgs(config: RelayConfig, localPort: number): string[] {
	return [
		"-N",
		"-i",
		expandHome(config.key),
		// A forward that can't bind is a failed connection, not a quiet one.
		"-o",
		"ExitOnForwardFailure=yes",
		// Notice a dead link (sleep, Wi-Fi change) within ~45s and reconnect.
		"-o",
		"ServerAliveInterval=15",
		"-o",
		"ServerAliveCountMax=3",
		// Never stop to ask for a password or a passphrase: there's no one to answer.
		"-o",
		"BatchMode=yes",
		"-o",
		"StrictHostKeyChecking=accept-new",
		"-R",
		`127.0.0.1:${REMOTE_PORT}:127.0.0.1:${localPort}`,
		config.ssh,
	];
}

export function startRelay(config: RelayConfig, localPort: number): void {
	stopRelay();
	const connect = () => {
		status = { ...status, state: "connecting" };
		let stderr = "";
		const ssh = spawn("/usr/bin/ssh", tunnelArgs(config, localPort), {
			stdio: ["ignore", "ignore", "pipe"],
		});
		child = ssh;
		ssh.stderr?.on("data", (chunk) => {
			stderr = `${stderr}${chunk}`.slice(-500);
		});
		const settled = setTimeout(() => {
			if (child === ssh) status = { state: "connected", error: null };
		}, SETTLE_MS);
		ssh.on("exit", () => {
			clearTimeout(settled);
			if (child !== ssh) return; // stopped, or replaced by a newer start
			child = null;
			status = {
				state: "retrying",
				error: stderr.trim().split("\n").pop() || "The tunnel closed.",
			};
			retry = setTimeout(connect, RETRY_MS);
		});
	};
	connect();
}

export function stopRelay(): void {
	clearTimeout(retry);
	const ssh = child;
	child = null;
	ssh?.kill();
	status = { state: "off", error: null };
}
