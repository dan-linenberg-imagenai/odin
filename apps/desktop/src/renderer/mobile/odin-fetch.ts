import type { Pairing } from "./pair-link";

/**
 * Every request to Odin goes through here: the Mac on this Wi-Fi first,
 * the relay (HTTPS, from anywhere) when the Wi-Fi address doesn't answer.
 * Whichever answered is used next; after a minute on the relay the Wi-Fi
 * address gets another try, so coming home goes back to the fast path.
 */

/** How long the Wi-Fi address gets before the relay is tried. */
const PROBE_MS = 2_500;
/** On the relay this long, the Wi-Fi address is worth another look. */
const RECHECK_MS = 60_000;

let bases: string[] = [""];
let active: { base: string; since: number } | null = null;

export function setPairing(pairing: Pairing | null) {
	bases = pairing
		? [pairing.base, ...(pairing.relay ? [pairing.relay] : [])]
		: [""];
	active = null;
}

/** A fetch that gives up after `ms`; not AbortSignal - CapacitorHttp may ignore it. */
function within(ms: number, request: Promise<Response>): Promise<Response> {
	return Promise.race([
		request,
		new Promise<Response>((_, reject) =>
			setTimeout(() => reject(new Error("No answer")), ms),
		),
	]);
}

/** The order to try: what worked last, unless the Wi-Fi is due another look. */
function order(): string[] {
	const [wifi] = bases;
	if (!active) return bases;
	const recheck =
		active.base !== wifi && Date.now() - active.since > RECHECK_MS;
	return recheck
		? bases
		: [active.base, ...bases.filter((base) => base !== active?.base)];
}

/** `path` like "/trpc/board?…" or "/upload?ext=jpg". */
export async function odinFetch(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	const tries = order();
	let failure: unknown;
	for (const [index, base] of tries.entries()) {
		const last = index === tries.length - 1;
		// Only a guess gets a deadline: a known-good address may take its time
		// (a video upload), and the last address is the only one left.
		const known = active?.base === base;
		const request = fetch(`${base}${path}`, init);
		try {
			const response =
				last || known ? await request : await within(PROBE_MS, request);
			if (active?.base !== base) active = { base, since: Date.now() };
			return response;
		} catch (error) {
			failure = error;
			if (active?.base === base) active = null;
		}
	}
	throw failure;
}
