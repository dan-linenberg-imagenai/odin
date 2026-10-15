import { publicProcedure, router } from "lib/trpc";
import { createBacklogReviewRouter } from "lib/trpc/routers/backlog-review";
import { createConnectionsRouter } from "lib/trpc/routers/connections";
import { createNotionRouter } from "lib/trpc/routers/notion";
import { createSlackRouter } from "lib/trpc/routers/slack";
import { createWorkRouter } from "lib/trpc/routers/work";
import { createWorkLogRouter } from "lib/trpc/routers/work-log";
import { completeJiraOAuth, isJiraOAuthCallback } from "main/lib/jira-oauth";
import {
	completeNotionOAuth,
	isNotionOAuthCallback,
} from "main/lib/notion-oauth";
import { completeSlackOAuth, isSlackOAuthCallback } from "main/lib/slack-oauth";
import type { REMOTE_CORE_NAMESPACES } from "shared/remote-core";
import { z } from "zod";

/**
 * Odin's connections, served by the remote host-service while the laptop is
 * a front end: the same desktop routers, running on the server against the
 * server's odin.json (its own credentials and token refresh) and local DB.
 * The renderer sends these namespaces here in remote mode
 * (renderer/lib/remote-core-link.ts).
 */
export function createOdinCoreRouter() {
	const routers = {
		connections: createConnectionsRouter(),
		work: createWorkRouter(),
		slack: createSlackRouter(),
		notion: createNotionRouter(),
		backlogReview: createBacklogReviewRouter(),
		workLog: createWorkLogRouter(),
	} satisfies Record<(typeof REMOTE_CORE_NAMESPACES)[number], unknown>;
	return router({
		...routers,
		/**
		 * A sign-in started here comes back to the laptop as an odin:// deep
		 * link; the laptop forwards it, and the code is exchanged here, where
		 * the sign-in's state and the client secret are.
		 */
		oauth: router({
			complete: publicProcedure
				.input(z.object({ url: z.string().min(1) }))
				.mutation(async ({ input }) => {
					if (isSlackOAuthCallback(input.url)) {
						await completeSlackOAuth(input.url);
					} else if (isNotionOAuthCallback(input.url)) {
						await completeNotionOAuth(input.url);
					} else if (isJiraOAuthCallback(input.url)) {
						await completeJiraOAuth(input.url);
					} else {
						return { handled: false };
					}
					return { handled: true };
				}),
		}),
	});
}

export type OdinCoreRouter = ReturnType<typeof createOdinCoreRouter>;
