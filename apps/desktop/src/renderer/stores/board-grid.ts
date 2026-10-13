import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The Dev Board's grid view: whether it's on (columns by default), and where
 * each card sits, per profile, as pane ids in order. The grid rewrites the
 * order to the sessions it shows, so it never holds more than those.
 */
export const useBoardGrid = create<{
	isOn: boolean;
	setOn: (isOn: boolean) => void;
	byProfile: Record<string, string[]>;
	setOrder: (profile: string, order: string[]) => void;
}>()(
	persist(
		(set) => ({
			isOn: false,
			setOn: (isOn) => set({ isOn }),
			byProfile: {},
			setOrder: (profile, order) =>
				set((state) => ({
					byProfile: { ...state.byProfile, [profile]: order },
				})),
		}),
		{ name: "odin-board-grid" },
	),
);
