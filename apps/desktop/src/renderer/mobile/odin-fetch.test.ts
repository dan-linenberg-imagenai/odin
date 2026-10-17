import { afterEach, expect, mock, test } from "bun:test";
import { odinFetch, setPairing } from "./odin-fetch";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** A fetch where the Wi-Fi address is `wifi` and the relay always answers. */
function network(wifi: "up" | "down" | "silent") {
	const seen: string[] = [];
	globalThis.fetch = mock(async (url: string | URL | Request) => {
		const href = String(url);
		seen.push(href);
		if (href.startsWith("http://mac.local")) {
			if (wifi === "down") throw new Error("offline");
			if (wifi === "silent") return new Promise<Response>(() => {});
		}
		return new Response(href);
	}) as unknown as typeof fetch;
	return seen;
}

const pairing = {
	base: "http://mac.local:4747",
	token: "t",
	relay: "https://relay.example",
};

test("on the Wi-Fi, the Mac answers directly", async () => {
	setPairing(pairing);
	network("up");
	expect(await (await odinFetch("/trpc/board")).text()).toBe(
		"http://mac.local:4747/trpc/board",
	);
});

test("away, the relay answers - and is tried first next time", async () => {
	setPairing(pairing);
	const seen = network("down");
	await odinFetch("/trpc/board");
	await odinFetch("/trpc/session");
	expect(seen).toEqual([
		"http://mac.local:4747/trpc/board",
		"https://relay.example/trpc/board",
		"https://relay.example/trpc/session",
	]);
});

test("a Wi-Fi address that never answers gives way to the relay", async () => {
	setPairing(pairing);
	network("silent");
	const answer = await odinFetch("/trpc/board");
	expect(await answer.text()).toBe("https://relay.example/trpc/board");
}, 10_000);

test("without a relay, there is only the Wi-Fi address", async () => {
	setPairing({ base: pairing.base, token: "t" });
	network("down");
	expect(odinFetch("/trpc/board")).rejects.toThrow("offline");
});
