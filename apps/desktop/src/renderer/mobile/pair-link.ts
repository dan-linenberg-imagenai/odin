export type Pairing = {
	/** The Mac on this Wi-Fi. */
	base: string;
	token: string;
	/** The same Odin away from the Wi-Fi, over HTTPS (main/lib/phone/relay.ts). */
	relay?: string;
};

/** `odin://pair?u=http://mac.local:4747/?t=…&r=https://relay`, or the http URL itself. */
export function parsePairLink(link: string): Pairing | null {
	try {
		const url = new URL(link.trim());
		const odin = url.protocol === "odin:";
		const web = odin ? url.searchParams.get("u") : link;
		const relay = odin ? url.searchParams.get("r") : null;
		if (!web) return null;
		const page = new URL(web.trim());
		const token = page.searchParams.get("t");
		if (page.protocol !== "http:" || !token) return null;
		// Only an https relay: the phone's traffic leaves the Wi-Fi through it.
		const away = relay && new URL(relay);
		return away && away.protocol === "https:"
			? { base: page.origin, token, relay: away.origin }
			: { base: page.origin, token };
	} catch {
		return null;
	}
}
