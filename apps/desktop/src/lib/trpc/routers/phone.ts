import {
	phoneStatus,
	resetPhoneToken,
	setPhoneEnabled,
	setPhoneRelay,
} from "main/lib/phone/server";
import { z } from "zod";
import { publicProcedure, router } from "..";

/** Settings → Connections → Phone: Odin on your iPhone over this Wi-Fi. */
export const createPhoneRouter = () =>
	router({
		status: publicProcedure.query(() => phoneStatus()),
		setEnabled: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => setPhoneEnabled(input.enabled)),
		resetToken: publicProcedure.mutation(() => resetPhoneToken()),
		/** The server that carries the phone away from this Wi-Fi; null removes it. */
		setRelay: publicProcedure
			.input(
				z
					.object({
						ssh: z.string().regex(/^[\w.-]+@[\w.-]+$/),
						url: z.string().url().startsWith("https://"),
						key: z.string().min(1),
					})
					.nullable(),
			)
			.mutation(({ input }) => setPhoneRelay(input)),
	});
