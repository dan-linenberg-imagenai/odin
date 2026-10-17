import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { tunnelArgs } from "./relay";

test("the tunnel forwards the relay's 4747 to Odin's real port, with no prompts", () => {
	const args = tunnelArgs(
		{
			ssh: "ubuntu@3.76.62.130",
			url: "https://3-76-62-130.sslip.io",
			key: "~/.ssh/odin-relay",
		},
		55_123,
	);
	expect(args).toContain(`${homedir()}/.ssh/odin-relay`);
	expect(args).toContain("127.0.0.1:4747:127.0.0.1:55123");
	expect(args).toContain("BatchMode=yes");
	expect(args).toContain("ExitOnForwardFailure=yes");
	expect(args.at(-1)).toBe("ubuntu@3.76.62.130");
});
