import { expect, test } from "bun:test";
import { parsePairLink } from "./pair-link";

const web = "http://dans-mac.local:4747/?t=abc_123";

test("the web link and the app's odin:// link pair the same way", () => {
	const pairing = { base: "http://dans-mac.local:4747", token: "abc_123" };
	expect(parsePairLink(web)).toEqual(pairing);
	expect(parsePairLink(`odin://pair?u=${encodeURIComponent(web)}`)).toEqual(
		pairing,
	);
	expect(parsePairLink(`  ${web}\n`)).toEqual(pairing);
});

test("anything else is not a pairing link", () => {
	for (const link of [
		"",
		"hello",
		"http://dans-mac.local:4747/",
		"https://dans-mac.local:4747/?t=abc",
		"odin://pair",
		"odin://pair?u=nope",
	])
		expect(parsePairLink(link)).toBeNull();
});

test("the app's link can carry an https relay for away from the Wi-Fi", () => {
	const link = (relay: string) =>
		`odin://pair?u=${encodeURIComponent(web)}&r=${encodeURIComponent(relay)}`;
	expect(parsePairLink(link("https://3-76-62-130.sslip.io/"))).toEqual({
		base: "http://dans-mac.local:4747",
		token: "abc_123",
		relay: "https://3-76-62-130.sslip.io",
	});
	// Never plain http off the Wi-Fi.
	expect(parsePairLink(link("http://3.76.62.130"))?.relay).toBeUndefined();
});
