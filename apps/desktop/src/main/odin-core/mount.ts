import { timingSafeEqual } from "node:crypto";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { REMOTE_CORE_PATH } from "shared/remote-core";
import { createOdinCoreRouter } from "./router";
import { startSessionTools } from "./session-tools";

/** The slice of host-service's Hono app this needs (desktop has no hono dep). */
interface RouteHost {
	all(
		path: string,
		handler: (c: { req: { raw: Request } }) => Response | Promise<Response>,
	): unknown;
}

function bearerMatches(header: string | null, secret: string): boolean {
	const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
	const a = Buffer.from(token);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Serve Odin's connections on a remote host-service, behind the same secret
 * as its own API (it only listens on loopback, reached through the laptop's
 * SSH tunnel).
 */
export async function mountOdinCore(
	app: RouteHost,
	secret: string,
): Promise<void> {
	const router = createOdinCoreRouter();
	// Up before any session starts: their PTYs get its port as ODIN_PORT.
	await startSessionTools(router);
	app.all(`${REMOTE_CORE_PATH}/*`, (c) => {
		const req = c.req.raw;
		if (!bearerMatches(req.headers.get("authorization"), secret)) {
			return Response.json({ error: "unauthorized" }, { status: 401 });
		}
		return fetchRequestHandler({
			endpoint: REMOTE_CORE_PATH,
			req,
			router,
			createContext: () => ({}),
			onError({ path, error }) {
				if (error.code === "INTERNAL_SERVER_ERROR") {
					console.error(`[odin-core] ${path}:`, error);
				}
			},
		});
	});
	console.log(`[odin-core] connections served at ${REMOTE_CORE_PATH}`);
}
