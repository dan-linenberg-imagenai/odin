import { Tooltip, TooltipContent, TooltipTrigger } from "@odin/ui/tooltip";
import { cn } from "@odin/ui/utils";
import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	HiOutlineArrowsPointingOut,
	HiOutlineChatBubbleLeftRight,
} from "react-icons/hi2";
import { emojify } from "renderer/lib/emoji";
import { runWhenParserIdle } from "renderer/lib/terminal/parser-idle-gate";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { coldRestoreState } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/state";
import { Terminal } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal";
import * as terminalCache from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache";
import { useBoardGrid } from "renderer/stores/board-grid";
import { useInAppBrowser } from "renderer/stores/in-app-browser";
import { useSessionView } from "renderer/stores/session-view";
import type { Pane, PaneStatus } from "renderer/stores/tabs/types";
import { untruncatedTitle } from "../components/OdinPromptDialog";
import { usePaneMeta } from "../hooks/usePaneMeta";
import { PANE_STATUS } from "../pane-status";
import { ChatView } from "./ChatView";
import { interruptPane } from "./interrupt";
import { GRID_COLUMNS, gridLayout, gridOrder, moveCard } from "./sessions-grid";

export interface GridCard {
	pane: Pane;
	workspaceId: string;
	status: PaneStatus;
}

/** What a dragged card carries - not text, so no terminal or box takes it. */
const CARD_DRAG = "application/x-odin-grid-card";

/** A PTY nobody has attached to runs at the daemon's launch size. */
const LAUNCH_SIZE = { cols: 80, rows: 24 };

/** The gap between cards and the grid's padding below them, in px. */
const GAP = 12;
const PADDING_BOTTOM = 18;
const PADDING_TOP = 4;

/**
 * The session's terminal, fitted to its card - which resizes the PTY with it.
 * On the way out, the parked xterm and the PTY go back to the size they had
 * before the grid, so a session nobody is looking at isn't left drawing Claude
 * Code at card width for the board's screen reads. The drawer refits on open
 * either way.
 */
function CardTerminal({
	paneId,
	tabId,
	workspaceId,
	focused,
}: {
	paneId: string;
	tabId: string;
	workspaceId: string;
	focused: boolean;
}) {
	// A layout effect, so it runs before the Terminal below attaches and fits.
	useLayoutEffect(() => {
		const parked = terminalCache.get(paneId);
		const before = parked
			? { cols: parked.xterm.cols, rows: parked.xterm.rows }
			: LAUNCH_SIZE;
		// The same clean mount the board's openDrawer does: a parked xterm left
		// by a resumed or cold-restored session drops every keystroke.
		if (parked && !parked.container) {
			coldRestoreState.delete(paneId);
			terminalCache.dispose(paneId);
		}
		return () => {
			// After the Terminal's own unmount has parked its xterm. Something
			// that attached it since (the drawer) owns the size now.
			setTimeout(() => {
				const entry = terminalCache.get(paneId);
				if (!entry || entry.container) return;
				runWhenParserIdle(entry.gate, () => {
					if (terminalCache.get(paneId) !== entry || entry.container) return;
					entry.xterm.resize(before.cols, before.rows);
					electronTrpcClient.terminal.resize
						.mutate({ paneId, ...before })
						.catch(() => {});
				});
			});
		};
	}, [paneId]);
	return (
		<Terminal
			paneId={paneId}
			tabId={tabId}
			workspaceId={workspaceId}
			focused={focused}
		/>
	);
}

/** Quiet until hovered: the header is the card's frame, not a toolbar. */
const ICON_BUTTON =
	"flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60";

/** A header icon, its words in a tooltip. */
function HeaderIcon({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}

/** The board's column dot, in the column's colour. */
function StatusDot({ column }: { column: PaneStatus }) {
	return (
		<HeaderIcon label={PANE_STATUS[column].label}>
			<span
				role="img"
				aria-label={PANE_STATUS[column].label}
				className="flex size-6 shrink-0 items-center justify-center"
				style={{ "--col": PANE_STATUS[column].dot } as CSSProperties}
			>
				<span
					className={cn(
						"size-2 rounded-full bg-(--col) shadow-[0_0_8px_var(--col)]",
						column === "working" && "animate-pulse",
					)}
				/>
			</span>
		</HeaderIcon>
	);
}

/**
 * The Dev Board's grid view - every session that's working or waiting on you,
 * side by side and live, so you can watch them all and answer one without
 * opening it. Each card shows its session the way the drawer does: as a chat,
 * or as its terminal (Settings > Appearance).
 */
export function SessionsGrid({
	cards,
	agentPaneIds,
	drawerPaneId,
	activeProfileId,
	onOpen,
}: {
	cards: GridCard[];
	agentPaneIds: Set<string>;
	drawerPaneId: string | undefined;
	activeProfileId: string;
	onOpen: (paneId: string) => void;
}) {
	const titleByPane = usePaneMeta((s) => s.titleByPane);
	const briefByPane = usePaneMeta((s) => s.briefByPane);
	const sessionIdByPane = usePaneMeta((s) => s.sessionIdByPane);
	const chatView = useSessionView((s) => s.chat);
	const setChatView = useSessionView((s) => s.setChat);
	// The cards answering a menu in their terminal, like the drawer's
	// terminalPaneId: the chat can't answer a TUI menu.
	const [terminalPaneIds, setTerminalPaneIds] = useState<string[]>([]);

	// Where each card sits: the order they arrived in, or where you dragged
	// them. Never by status, so nothing moves under you.
	const savedOrder = useBoardGrid((s) => s.byProfile[activeProfileId]);
	const setOrder = useBoardGrid((s) => s.setOrder);
	const presentKey = cards.map((card) => card.pane.id).join(",");
	const order = useMemo(
		() => gridOrder(savedOrder ?? [], presentKey ? presentKey.split(",") : []),
		[savedOrder, presentKey],
	);
	// Save what's in the grid now, so a card that left drops out and comes back
	// at the end.
	useEffect(() => {
		if (order.join(",") !== (savedOrder ?? []).join(","))
			setOrder(activeProfileId, order);
	}, [order, savedOrder, setOrder, activeProfileId]);
	const [dragId, setDragId] = useState<string | null>(null);
	const [dropId, setDropId] = useState<string | null>(null);

	const rootRef = useRef<HTMLDivElement>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	// A focused card that left the grid (finished, went idle) leaves nothing
	// focused, and doesn't take the keyboard back if it returns. The drawer
	// open over the grid has the keyboard while it's there.
	const focused =
		!drawerPaneId && cards.some((card) => card.pane.id === focusedId)
			? focusedId
			: null;
	useEffect(() => {
		if (focusedId && !focused) setFocusedId(null);
	}, [focusedId, focused]);
	const clearFocus = useCallback(() => {
		setFocusedId(null);
		const active = document.activeElement;
		if (active instanceof HTMLElement && rootRef.current?.contains(active))
			active.blur();
	}, []);

	// Esc in a terminal is Claude's; anywhere else in the grid it lets go.
	useEffect(() => {
		if (!focused) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (useInAppBrowser.getState().url) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest(".xterm, [role=dialog]")) return;
			clearFocus();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [focused, clearFocus]);

	if (cards.length === 0)
		return (
			<div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
				Nothing is running.
			</div>
		);

	const titleOf = (pane: Pane) =>
		emojify(
			untruncatedTitle(
				pane.odinTaskTitle ??
					titleByPane[pane.id] ??
					pane.userTitle ??
					pane.name,
				pane.odinBrief ?? briefByPane[pane.id] ?? null,
			),
		);
	const showsTerminal = (pane: Pane) =>
		!chatView || terminalPaneIds.includes(pane.id);

	const chatButton = (pane: Pane) =>
		showsTerminal(pane) &&
		agentPaneIds.has(pane.id) && (
			<HeaderIcon label="Show as a chat (Settings > Appearance)">
				<button
					type="button"
					aria-label="Show as a chat"
					onClick={() =>
						chatView
							? setTerminalPaneIds((ids) => ids.filter((id) => id !== pane.id))
							: setChatView(true)
					}
					className={ICON_BUTTON}
				>
					<HiOutlineChatBubbleLeftRight className="size-3.5" />
				</button>
			</HeaderIcon>
		);

	const sessionBody = (card: GridCard, isFocused: boolean) => {
		const { pane, workspaceId } = card;
		if (pane.id === drawerPaneId)
			// The drawer has this session's terminal: one xterm, one attach.
			return (
				<div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
					Open in the drawer
				</div>
			);
		if (!agentPaneIds.has(pane.id))
			// No Claude to attach to (closed for sitting idle, or only a shell
			// left): the drawer's history and Resume.
			return (
				<div className="flex flex-1 items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
					Session closed - open it to resume.
				</div>
			);
		if (showsTerminal(pane))
			return (
				<div className="min-h-0 flex-1">
					<CardTerminal
						paneId={pane.id}
						tabId={pane.tabId}
						workspaceId={workspaceId}
						focused={isFocused}
					/>
				</div>
			);
		return (
			<ChatView
				paneId={pane.id}
				sessionId={pane.claudeSessionId ?? sessionIdByPane[pane.id] ?? null}
				cwd={pane.cwd ?? pane.initialCwd ?? pane.odinCwd}
				workspaceId={workspaceId}
				working={pane.status === "working"}
				onShowTerminal={() => setTerminalPaneIds((ids) => [...ids, pane.id])}
				onStop={() => interruptPane(pane.id)}
				focusComposer={isFocused}
				density="compact"
			/>
		);
	};

	const { rows, spans } = gridLayout(cards.length);
	// Rendered in a fixed order and placed with `order`: a card that moves -
	// dragged, or another one arriving or leaving - never has its DOM node
	// moved, which would remount it or blur the terminal you're typing in.
	const stable = [...cards].sort((a, b) => a.pane.id.localeCompare(b.pane.id));

	return (
		// A size container, so a row can be a fraction of the visible height:
		// the first `rows` rows fill the screen, the rest scroll below.
		<div
			ref={rootRef}
			className="min-h-0 flex-1 overflow-y-auto"
			style={{ containerType: "size" }}
		>
			<div
				className="grid px-[18px]"
				style={{
					gap: GAP,
					paddingTop: PADDING_TOP,
					paddingBottom: PADDING_BOTTOM,
					gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
					gridAutoRows: `calc((100cqh - ${PADDING_TOP + PADDING_BOTTOM}px - ${(rows - 1) * GAP}px) / ${rows})`,
				}}
			>
				{stable.map((card) => {
					const { pane, status } = card;
					const isFocused = focused === pane.id;
					const place = order.indexOf(pane.id);
					return (
						<section
							key={pane.id}
							data-pane-id={pane.id}
							aria-label={titleOf(pane)}
							style={{
								order: place,
								gridColumn: `span ${spans[place] ?? GRID_COLUMNS / 3}`,
							}}
							onDragOver={(event) => {
								if (!dragId || !event.dataTransfer.types.includes(CARD_DRAG))
									return;
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								if (dropId !== pane.id) setDropId(pane.id);
							}}
							onDragLeave={(event) => {
								if (!event.currentTarget.contains(event.relatedTarget as Node))
									setDropId(null);
							}}
							onDrop={(event) => {
								if (!dragId || !event.dataTransfer.types.includes(CARD_DRAG))
									return;
								event.preventDefault();
								setOrder(activeProfileId, moveCard(order, dragId, pane.id));
								setDragId(null);
								setDropId(null);
							}}
							className={cn(
								"flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-opacity duration-150",
								isFocused || dropId === pane.id
									? "border-primary/50"
									: "border-border",
								dragId === pane.id
									? "opacity-40"
									: focused && !isFocused && "opacity-[0.55]",
							)}
						>
							{/* The header is the drag handle - the body is for reading and typing. */}
							{/* biome-ignore lint/a11y/noStaticElementInteractions: drag is the mouse-only shortcut for reordering; the buttons inside stay keyboard-reachable */}
							<div
								draggable
								onDragStart={(event) => {
									event.dataTransfer.setData(CARD_DRAG, pane.id);
									event.dataTransfer.effectAllowed = "move";
									setDragId(pane.id);
								}}
								onDragEnd={() => {
									setDragId(null);
									setDropId(null);
								}}
								className="flex h-8 shrink-0 cursor-grab items-center gap-0.5 border-b border-border pr-1 pl-3 active:cursor-grabbing"
							>
								<button
									type="button"
									title={isFocused ? "Unfocus" : "Focus this session"}
									onClick={() =>
										isFocused ? clearFocus() : setFocusedId(pane.id)
									}
									className="min-w-0 flex-1 truncate rounded-sm text-left text-[12.5px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
								>
									{titleOf(pane)}
								</button>
								<StatusDot column={status} />
								{chatButton(pane)}
								<HeaderIcon label="Open">
									<button
										type="button"
										aria-label="Open"
										onClick={() => {
											clearFocus();
											onOpen(pane.id);
										}}
										className={ICON_BUTTON}
									>
										<HiOutlineArrowsPointingOut className="size-3.5" />
									</button>
								</HeaderIcon>
							</div>
							{/* Clicking or tabbing into the body makes this the focused card. */}
							<div
								className="flex min-h-0 flex-1 flex-col"
								onPointerDownCapture={() => setFocusedId(pane.id)}
								onFocusCapture={() => setFocusedId(pane.id)}
							>
								{sessionBody(card, isFocused)}
							</div>
						</section>
					);
				})}
			</div>
		</div>
	);
}
