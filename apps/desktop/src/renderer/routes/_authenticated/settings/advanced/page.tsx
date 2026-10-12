import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../components/SettingsPage";
import { CleanupSection } from "./components/CleanupSection";
import { RemoteServerSection } from "./components/RemoteServerSection";
import { SessionsSection } from "./components/SessionsSection";

export const Route = createFileRoute("/_authenticated/settings/advanced/")({
	component: AdvancedSettingsPage,
});

/**
 * Advanced holds what most people never change, one component per section so
 * the page can keep growing. The jump bar names each section by its title -
 * the `data-setting` its SettingsSection renders.
 */
const SECTIONS = ["Sessions", "Cleanup", "Remote server"] as const;

function AdvancedSettingsPage() {
	return (
		<SettingsPage
			title="Advanced"
			description="Settings most people never need to change."
		>
			<nav
				aria-label="Advanced sections"
				className="-mt-2 flex flex-wrap gap-1.5"
			>
				{SECTIONS.map((title) => (
					<button
						key={title}
						type="button"
						onClick={() =>
							document
								.querySelector(`[data-setting="${title}"]`)
								?.scrollIntoView({ behavior: "smooth", block: "start" })
						}
						className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{title}
					</button>
				))}
			</nav>
			<SessionsSection />
			<CleanupSection />
			<RemoteServerSection />
		</SettingsPage>
	);
}
