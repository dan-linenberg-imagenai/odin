import { describe, expect, it } from "bun:test";
import { gridLayout, gridOrder, moveCard } from "./sessions-grid";

describe("gridOrder", () => {
	it("starts in the order the sessions are listed", () => {
		expect(gridOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
	});

	it("keeps a saved order, whatever order they're listed in now", () => {
		expect(gridOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	it("puts a new session at the end", () => {
		expect(gridOrder(["b", "a"], ["a", "b", "new"])).toEqual(["b", "a", "new"]);
	});

	it("drops a session that left", () => {
		expect(gridOrder(["a", "gone", "b"], ["a", "b"])).toEqual(["a", "b"]);
	});

	// Leaving drops it from the saved order, so the comeback is a new arrival.
	it("puts a session that comes back at the end", () => {
		const afterLeaving = gridOrder(["a", "b", "c"], ["b", "c"]);
		expect(gridOrder(afterLeaving, ["a", "b", "c"])).toEqual(["b", "c", "a"]);
	});
});

describe("moveCard", () => {
	it("moves a card forward onto another's place", () => {
		expect(moveCard(["a", "b", "c", "d"], "a", "c")).toEqual([
			"b",
			"c",
			"a",
			"d",
		]);
	});

	it("moves a card back onto another's place", () => {
		expect(moveCard(["a", "b", "c", "d"], "d", "b")).toEqual([
			"a",
			"d",
			"b",
			"c",
		]);
	});

	it("leaves the order alone for itself or an unknown card", () => {
		const order = ["a", "b"];
		expect(moveCard(order, "a", "a")).toBe(order);
		expect(moveCard(order, "x", "a")).toBe(order);
		expect(moveCard(order, "a", "x")).toBe(order);
	});
});

describe("gridLayout", () => {
	it("puts up to three side by side in one full-height row", () => {
		expect(gridLayout(1)).toEqual({ rows: 1, spans: [6] });
		expect(gridLayout(2)).toEqual({ rows: 1, spans: [3, 3] });
		expect(gridLayout(3)).toEqual({ rows: 1, spans: [2, 2, 2] });
	});

	it("makes 2x2 for four and three over two for five", () => {
		expect(gridLayout(4)).toEqual({ rows: 2, spans: [3, 3, 3, 3] });
		expect(gridLayout(5)).toEqual({ rows: 2, spans: [2, 2, 2, 3, 3] });
	});

	it("keeps three a row at two rows a screen from six on, so the rest scroll", () => {
		expect(gridLayout(6)).toEqual({ rows: 2, spans: [2, 2, 2, 2, 2, 2] });
		expect(gridLayout(7)).toEqual({ rows: 2, spans: [2, 2, 2, 2, 2, 2, 2] });
	});
});
