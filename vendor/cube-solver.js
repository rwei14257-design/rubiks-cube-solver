//#region ../internal/src/move.ts
/**
* Every {@link Move}, keyed by itself, for callers who prefer `Moves.R_PRIME` to the literal
* `'R_PRIME'`. Both spellings are the same value and the same type.
*/
var Moves = {
	U: "U",
	U2: "U2",
	U_PRIME: "U_PRIME",
	R: "R",
	R2: "R2",
	R_PRIME: "R_PRIME",
	F: "F",
	F2: "F2",
	F_PRIME: "F_PRIME",
	D: "D",
	D2: "D2",
	D_PRIME: "D_PRIME",
	L: "L",
	L2: "L2",
	L_PRIME: "L_PRIME",
	B: "B",
	B2: "B2",
	B_PRIME: "B_PRIME"
};
var MOVE_INFO = {
	U: {
		face: "U",
		turns: 1,
		inverse: "U_PRIME",
		notation: "U"
	},
	U2: {
		face: "U",
		turns: 2,
		inverse: "U2",
		notation: "U2"
	},
	U_PRIME: {
		face: "U",
		turns: 3,
		inverse: "U",
		notation: "U'"
	},
	R: {
		face: "R",
		turns: 1,
		inverse: "R_PRIME",
		notation: "R"
	},
	R2: {
		face: "R",
		turns: 2,
		inverse: "R2",
		notation: "R2"
	},
	R_PRIME: {
		face: "R",
		turns: 3,
		inverse: "R",
		notation: "R'"
	},
	F: {
		face: "F",
		turns: 1,
		inverse: "F_PRIME",
		notation: "F"
	},
	F2: {
		face: "F",
		turns: 2,
		inverse: "F2",
		notation: "F2"
	},
	F_PRIME: {
		face: "F",
		turns: 3,
		inverse: "F",
		notation: "F'"
	},
	D: {
		face: "D",
		turns: 1,
		inverse: "D_PRIME",
		notation: "D"
	},
	D2: {
		face: "D",
		turns: 2,
		inverse: "D2",
		notation: "D2"
	},
	D_PRIME: {
		face: "D",
		turns: 3,
		inverse: "D",
		notation: "D'"
	},
	L: {
		face: "L",
		turns: 1,
		inverse: "L_PRIME",
		notation: "L"
	},
	L2: {
		face: "L",
		turns: 2,
		inverse: "L2",
		notation: "L2"
	},
	L_PRIME: {
		face: "L",
		turns: 3,
		inverse: "L",
		notation: "L'"
	},
	B: {
		face: "B",
		turns: 1,
		inverse: "B_PRIME",
		notation: "B"
	},
	B2: {
		face: "B",
		turns: 2,
		inverse: "B2",
		notation: "B2"
	},
	B_PRIME: {
		face: "B",
		turns: 3,
		inverse: "B",
		notation: "B'"
	}
};
function infoOf(move) {
	if (!Object.hasOwn(MOVE_INFO, move)) throw new TypeError(`Unknown move ${JSON.stringify(move)}. A move is one of the 18 values in Moves, such as "R", "R2" or "R_PRIME".`);
	return MOVE_INFO[move];
}
/** The face a move turns. */
function faceOf(move) {
	return infoOf(move).face;
}
/**
* How far a move turns its face, in clockwise quarter turns: 1 for a quarter turn, 2 for a half
* turn, 3 for a counter-clockwise quarter turn.
*/
function turnsOf(move) {
	return infoOf(move).turns;
}
function inverse(input) {
	if (typeof input === "string") return infoOf(input).inverse;
	return input.map((move) => infoOf(move).inverse).reverse();
}
/**
* Moves in traditional cube notation, separated by spaces: `R U' F2`. For display only. The
* package never reads this notation back.
*/
function formatAlgorithm(moves) {
	return moves.map((move) => infoOf(move).notation).join(" ");
}
//#endregion
//#region ../internal/src/util.ts
/**
* Reads `values[index]`, throwing instead of returning `undefined`. Every table it reads is sized so
* the throw never happens; it exists because the compiler cannot know that.
*/
function at(values, index) {
	const value = values[index];
	if (value === void 0) throw new RangeError(`Internal error: index ${String(index)} is out of range.`);
	return value;
}
//#endregion
//#region ../internal/src/cubie.ts
var CORNER_POSITIONS = [
	"URF",
	"UFL",
	"ULB",
	"UBR",
	"DFR",
	"DLF",
	"DBL",
	"DRB"
];
var EDGE_POSITIONS = [
	"UR",
	"UF",
	"UL",
	"UB",
	"DR",
	"DF",
	"DL",
	"DB",
	"FR",
	"FL",
	"BL",
	"BR"
];
var SOLVED = {
	cp: [
		0,
		1,
		2,
		3,
		4,
		5,
		6,
		7
	],
	co: [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	],
	ep: [
		0,
		1,
		2,
		3,
		4,
		5,
		6,
		7,
		8,
		9,
		10,
		11
	],
	eo: [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	]
};
var QUARTER_TURN = {
	U: {
		cp: [
			3,
			0,
			1,
			2,
			4,
			5,
			6,
			7
		],
		co: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		],
		ep: [
			3,
			0,
			1,
			2,
			4,
			5,
			6,
			7,
			8,
			9,
			10,
			11
		],
		eo: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	},
	R: {
		cp: [
			4,
			1,
			2,
			0,
			7,
			5,
			6,
			3
		],
		co: [
			2,
			0,
			0,
			1,
			1,
			0,
			0,
			2
		],
		ep: [
			8,
			1,
			2,
			3,
			11,
			5,
			6,
			7,
			4,
			9,
			10,
			0
		],
		eo: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	},
	F: {
		cp: [
			1,
			5,
			2,
			3,
			0,
			4,
			6,
			7
		],
		co: [
			1,
			2,
			0,
			0,
			2,
			1,
			0,
			0
		],
		ep: [
			0,
			9,
			2,
			3,
			4,
			8,
			6,
			7,
			1,
			5,
			10,
			11
		],
		eo: [
			0,
			1,
			0,
			0,
			0,
			1,
			0,
			0,
			1,
			1,
			0,
			0
		]
	},
	D: {
		cp: [
			0,
			1,
			2,
			3,
			5,
			6,
			7,
			4
		],
		co: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		],
		ep: [
			0,
			1,
			2,
			3,
			5,
			6,
			7,
			4,
			8,
			9,
			10,
			11
		],
		eo: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	},
	L: {
		cp: [
			0,
			2,
			6,
			3,
			4,
			1,
			5,
			7
		],
		co: [
			0,
			1,
			2,
			0,
			0,
			2,
			1,
			0
		],
		ep: [
			0,
			1,
			10,
			3,
			4,
			5,
			9,
			7,
			8,
			2,
			6,
			11
		],
		eo: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		]
	},
	B: {
		cp: [
			0,
			1,
			3,
			7,
			4,
			5,
			2,
			6
		],
		co: [
			0,
			0,
			1,
			2,
			0,
			0,
			2,
			1
		],
		ep: [
			0,
			1,
			2,
			11,
			4,
			5,
			6,
			10,
			8,
			9,
			3,
			7
		],
		eo: [
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			1,
			0,
			0,
			1,
			1
		]
	}
};
/** `state` with `effect` applied on top of it. */
function compose(state, effect) {
	const cp = [];
	const co = [];
	for (let i = 0; i < 8; i++) {
		const from = at(effect.cp, i);
		cp.push(at(state.cp, from));
		co.push((at(state.co, from) + at(effect.co, i)) % 3);
	}
	const ep = [];
	const eo = [];
	for (let i = 0; i < 12; i++) {
		const from = at(effect.ep, i);
		ep.push(at(state.ep, from));
		eo.push((at(state.eo, from) + at(effect.eo, i)) % 2);
	}
	return {
		cp,
		co,
		ep,
		eo
	};
}
var effects = /* @__PURE__ */ new Map();
/** What `move` does to a solved cube. Built on first use, then cached. */
function effectOf(move) {
	let effect = effects.get(move);
	if (effect === void 0) {
		const quarterTurn = QUARTER_TURN[faceOf(move)];
		effect = SOLVED;
		for (let turn = 0; turn < turnsOf(move); turn++) effect = compose(effect, quarterTurn);
		effects.set(move, effect);
	}
	return effect;
}
function isSolvedState(state) {
	return state.cp.every((piece, position) => piece === position) && state.co.every((twist) => twist === 0) && state.ep.every((piece, position) => piece === position) && state.eo.every((flip) => flip === 0);
}
/** Whether `permutation` is odd: built from the identity by an odd number of swaps. */
function isOddPermutation(permutation) {
	const seen = permutation.map(() => false);
	let odd = false;
	for (let start = 0; start < permutation.length; start++) {
		let length = 0;
		for (let index = start; seen[index] === false; index = at(permutation, index)) {
			seen[index] = true;
			length += 1;
		}
		if (length > 0 && length % 2 === 0) odd = !odd;
	}
	return odd;
}
//#endregion
//#region ../internal/src/face.ts
/**
* Every {@link Face}, keyed by itself, for callers who prefer `Faces.U` to the literal `'U'`.
* Both spellings are the same value and the same type.
*/
var Faces = {
	U: "U",
	R: "R",
	F: "F",
	D: "D",
	L: "L",
	B: "B"
};
//#endregion
//#region ../internal/src/facelets.ts
var CORNER_STICKERS = [
	[
		{
			face: "U",
			index: 8
		},
		{
			face: "R",
			index: 0
		},
		{
			face: "F",
			index: 2
		}
	],
	[
		{
			face: "U",
			index: 6
		},
		{
			face: "F",
			index: 0
		},
		{
			face: "L",
			index: 2
		}
	],
	[
		{
			face: "U",
			index: 0
		},
		{
			face: "L",
			index: 0
		},
		{
			face: "B",
			index: 2
		}
	],
	[
		{
			face: "U",
			index: 2
		},
		{
			face: "B",
			index: 0
		},
		{
			face: "R",
			index: 2
		}
	],
	[
		{
			face: "D",
			index: 2
		},
		{
			face: "F",
			index: 8
		},
		{
			face: "R",
			index: 6
		}
	],
	[
		{
			face: "D",
			index: 0
		},
		{
			face: "L",
			index: 8
		},
		{
			face: "F",
			index: 6
		}
	],
	[
		{
			face: "D",
			index: 6
		},
		{
			face: "B",
			index: 8
		},
		{
			face: "L",
			index: 6
		}
	],
	[
		{
			face: "D",
			index: 8
		},
		{
			face: "R",
			index: 8
		},
		{
			face: "B",
			index: 6
		}
	]
];
var EDGE_STICKERS = [
	[{
		face: "U",
		index: 5
	}, {
		face: "R",
		index: 1
	}],
	[{
		face: "U",
		index: 7
	}, {
		face: "F",
		index: 1
	}],
	[{
		face: "U",
		index: 3
	}, {
		face: "L",
		index: 1
	}],
	[{
		face: "U",
		index: 1
	}, {
		face: "B",
		index: 1
	}],
	[{
		face: "D",
		index: 5
	}, {
		face: "R",
		index: 7
	}],
	[{
		face: "D",
		index: 1
	}, {
		face: "F",
		index: 7
	}],
	[{
		face: "D",
		index: 3
	}, {
		face: "L",
		index: 7
	}],
	[{
		face: "D",
		index: 7
	}, {
		face: "B",
		index: 7
	}],
	[{
		face: "F",
		index: 5
	}, {
		face: "R",
		index: 3
	}],
	[{
		face: "F",
		index: 3
	}, {
		face: "L",
		index: 5
	}],
	[{
		face: "B",
		index: 5
	}, {
		face: "L",
		index: 3
	}],
	[{
		face: "B",
		index: 3
	}, {
		face: "R",
		index: 5
	}]
];
//#endregion
//#region ../internal/src/grid.ts
function faceStickers(centre, cells) {
	return [
		at(cells, 0),
		at(cells, 1),
		at(cells, 2),
		at(cells, 3),
		centre,
		at(cells, 5),
		at(cells, 6),
		at(cells, 7),
		at(cells, 8)
	];
}
/**
* The stickers of the cube whose pieces sit as `state` describes. It reads nothing but `state`, so
* code that holds a piece state without a `Cube` can draw it too.
*/
function gridOf(state) {
	const cells = {
		U: [],
		R: [],
		F: [],
		D: [],
		L: [],
		B: []
	};
	for (let position = 0; position < 8; position++) {
		const here = at(CORNER_STICKERS, position);
		const home = at(CORNER_STICKERS, at(state.cp, position));
		const twist = at(state.co, position);
		here.forEach((location, slot) => {
			cells[location.face][location.index] = at(home, (slot - twist + 3) % 3).face;
		});
	}
	for (let position = 0; position < 12; position++) {
		const here = at(EDGE_STICKERS, position);
		const home = at(EDGE_STICKERS, at(state.ep, position));
		const flip = at(state.eo, position);
		here.forEach((location, slot) => {
			cells[location.face][location.index] = at(home, (slot + flip) % 2).face;
		});
	}
	return {
		U: faceStickers("U", cells.U),
		R: faceStickers("R", cells.R),
		F: faceStickers("F", cells.F),
		D: faceStickers("D", cells.D),
		L: faceStickers("L", cells.L),
		B: faceStickers("B", cells.B)
	};
}
//#endregion
//#region src/cube.ts
var states = /* @__PURE__ */ new WeakMap();
function makeCube(state) {
	const cube = Object.freeze({});
	states.set(cube, state);
	return cube;
}
function stateOf(cube) {
	const state = states.get(cube);
	if (state === void 0) throw new TypeError("Expected a Cube created by this package. A Cube cannot be written by hand, and does not survive JSON or postMessage.");
	return state;
}
function turn(state, moves) {
	return moves.reduce((current, move) => compose(current, effectOf(move)), state);
}
/**
* The cube reached by applying `moves`, in order, to a solved cube. An empty list gives the solved
* cube. Every list of moves is a legal cube, so this never rejects its input.
*/
function cubeFromMoves(moves) {
	return makeCube(turn(SOLVED, moves));
}
/** The cube reached by applying `moves`, in order, to `cube`. `cube` itself is left unchanged. */
function applyMoves(cube, moves) {
	return makeCube(turn(stateOf(cube), moves));
}
/** Whether every sticker of `cube` is on its own face. */
function isSolved(cube) {
	return isSolvedState(stateOf(cube));
}
//#endregion
//#region src/errors.ts
function list(items) {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}
function times(count) {
	return count === 1 ? "once" : `${String(count)} times`;
}
function describeStickers(piece) {
	const where = piece.locations.map((location) => `${location.face}[${String(location.index)}]`);
	return `${piece.stickers.join(", ")} (at ${where.join(", ")})`;
}
function andOthers(total) {
	const others = total - 1;
	if (others === 0) return "";
	return ` ${others === 1 ? "1 more position has" : `${String(others)} more positions have`} the same problem; the "pieces" property lists them all.`;
}
/**
* The stickers do not describe a cube that can exist or be solved. Every specific reason is a
* subclass, so catch this one to handle them all alike, or a subclass to handle one reason.
*/
var InvalidCubeError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "InvalidCubeError";
	}
};
/** A face letter does not appear on exactly nine stickers. */
var StickerCountError = class extends InvalidCubeError {
	/** How many stickers carry each face letter. A legal cube has nine of each. */
	counts;
	constructor(counts) {
		const wrong = [
			"U",
			"R",
			"F",
			"D",
			"L",
			"B"
		].filter((face) => counts[face] !== 9);
		const over = wrong.filter((face) => counts[face] === 10);
		const under = wrong.filter((face) => counts[face] === 8);
		const hint = wrong.length === 2 && over.length === 1 && under.length === 1 ? ` One sticker entered as ${over.join("")} is probably ${under.join("")}.` : "";
		super(`Every face letter must appear on exactly 9 stickers, but ${list(wrong.map((face) => `${face} appears ${times(counts[face])}`))}.${hint}`);
		this.name = "StickerCountError";
		this.counts = counts;
	}
};
/** A corner or edge position shows a combination of stickers that no real piece has. */
var UnknownPieceError = class extends InvalidCubeError {
	/** Every position whose stickers match no piece. */
	pieces;
	constructor(pieces, mirrorOf) {
		const first = pieces[0];
		const kind = first?.stickers.length === 3 ? "corner" : "edge";
		const described = first === void 0 ? "" : describeStickers(first);
		const position = first?.position ?? "";
		const reason = mirrorOf === void 0 ? `and no ${kind} piece has that combination.` : `which are the letters of the piece ${mirrorOf} in an order no turn can produce. Two of these stickers are probably swapped.`;
		super(`The ${kind} at ${position} shows the stickers ${described}, ${reason}${andOthers(pieces.length)}`);
		this.name = "UnknownPieceError";
		this.pieces = pieces;
	}
};
/** The same piece appears at more than one position. */
var DuplicatePieceError = class extends InvalidCubeError {
	/** Every position that holds a piece also found somewhere else. */
	pieces;
	constructor(piece, pieces, positions) {
		const kind = piece.length === 3 ? "corner" : "edge";
		super(`The ${kind} piece ${piece} appears ${times(positions.length)}, at ${list(positions)}. A cube has exactly one of each piece, so at least one of these positions was entered wrong.`);
		this.name = "DuplicatePieceError";
		this.pieces = pieces;
	}
};
/** Every piece is present, but one corner is twisted in place. */
var CornerTwistError = class extends InvalidCubeError {
	constructor() {
		super("Every piece is present, but one corner is twisted in place, which no sequence of turns can undo. On a real cube, a corner has been rotated by hand. In typed input, the three stickers of one corner are entered in rotated order.");
		this.name = "CornerTwistError";
	}
};
/** Every piece is present, but one edge is flipped in place. */
var EdgeFlipError = class extends InvalidCubeError {
	constructor() {
		super("Every piece is present, but one edge is flipped in place, which no sequence of turns can undo. On a real cube, an edge has been put back the wrong way round. In typed input, the two stickers of one edge are entered swapped.");
		this.name = "EdgeFlipError";
	}
};
/** Every piece is present and correctly oriented, but two pieces have traded places. */
var ParityError = class extends InvalidCubeError {
	constructor() {
		super("Every piece is present and correctly oriented, but two pieces have traded places, which no sequence of turns can undo. On a real cube, two pieces have been put back in each other's place. In typed input, the stickers of two pieces are entered at each other's positions.");
		this.name = "ParityError";
	}
};
/** A facelet string is not 54 face letters in U, R, F, D, L, B order. */
var FaceletStringError = class extends Error {
	/** The index of the offending character, when the problem is a single character. */
	index;
	constructor(message, index) {
		super(message);
		this.name = "FaceletStringError";
		this.index = index;
	}
};
//#endregion
//#region src/faceletString.ts
var FACE_ORDER$1 = [
	"U",
	"R",
	"F",
	"D",
	"L",
	"B"
];
function toFace(character) {
	return FACE_ORDER$1.find((face) => face === character);
}
function readFace(centre, order, input) {
	const start = order * 9;
	const cells = [];
	for (let index = start; index < start + 9; index++) {
		const character = input.charAt(index);
		const face = toFace(character);
		if (face === void 0) throw new FaceletStringError(`The character at index ${String(index)} of the facelet string is ${JSON.stringify(character)}. Only the face letters U, R, F, D, L and B are allowed. That character is sticker ${String(index - start)} of face ${centre}.`, index);
		cells.push(face);
	}
	if (at(cells, 4) !== centre) throw new FaceletStringError(`The centre of face ${centre}, at index ${String(start + 4)} of the facelet string, is "${at(cells, 4)}". A centre always carries its own face's letter, so this string either lists its faces in another order than U, R, F, D, L, B, or describes a cube held in another orientation.`, start + 4);
	return [
		at(cells, 0),
		at(cells, 1),
		at(cells, 2),
		at(cells, 3),
		centre,
		at(cells, 5),
		at(cells, 6),
		at(cells, 7),
		at(cells, 8)
	];
}
/**
* Reads the 54-character facelet string that other cube programs exchange: nine stickers per
* face, faces in the order U, R, F, D, L, B, each sticker named by the face it belongs to.
*
* Only the format is checked here. Pass the result to `cubeFromFaces` to check the cube itself.
*
* @throws {@link FaceletStringError} when the string is not 54 face letters with every centre on
* its own face.
*/
function parseFaceletString(input) {
	const received = input;
	if (typeof received !== "string") throw new TypeError(`Expected a facelet string, but received ${typeof received}.`);
	if (input.length !== 54) throw new FaceletStringError(`A facelet string has exactly 54 characters, one per sticker. This one has ${String(input.length)}.`);
	return {
		U: readFace("U", 0, input),
		R: readFace("R", 1, input),
		F: readFace("F", 2, input),
		D: readFace("D", 3, input),
		L: readFace("L", 4, input),
		B: readFace("B", 5, input)
	};
}
//#endregion
//#region src/fromFaces.ts
var FACE_ORDER = [
	"U",
	"R",
	"F",
	"D",
	"L",
	"B"
];
function shapeError(detail) {
	return /* @__PURE__ */ new TypeError(`Expected a FaceGrid: an object with the keys U, R, F, D, L and B, each holding an array of 9 face letters. ${detail}`);
}
function assertShape(faces) {
	const grid = faces;
	for (const face of FACE_ORDER) {
		const stickers = grid[face];
		if (!Array.isArray(stickers)) throw shapeError(`Face ${face} is missing.`);
		if (stickers.length !== 9) throw shapeError(`Face ${face} has ${String(stickers.length)} stickers.`);
		stickers.forEach((sticker, index) => {
			if (!FACE_ORDER.some((letter) => letter === sticker)) throw shapeError(`Sticker ${face}[${String(index)}] is ${JSON.stringify(sticker)}.`);
		});
		if (stickers[4] !== face) throw shapeError(`The centre of face ${face} is ${JSON.stringify(stickers[4])}; it must be "${face}".`);
	}
}
function countStickers(faces) {
	const counts = {
		U: 0,
		R: 0,
		F: 0,
		D: 0,
		L: 0,
		B: 0
	};
	for (const face of FACE_ORDER) for (const sticker of faces[face]) counts[sticker] += 1;
	return counts;
}
/**
* Which piece shows `stickers`, and turned how far. A piece turned by `orientation` shows its home
* sticker `(slot - orientation)` at `slot`, which is exactly how a real piece can sit in a
* position; a mirror image of a piece matches nothing.
*/
function identify(stickers, homes) {
	const size = stickers.length;
	for (let piece = 0; piece < homes.length; piece++) {
		const home = at(homes, piece);
		for (let orientation = 0; orientation < size; orientation++) if (stickers.every((sticker, slot) => sticker === at(home, (slot - orientation + size) % size).face)) return {
			piece,
			orientation
		};
	}
}
function sameLetters(stickers, home) {
	return [...stickers].sort().join("") === home.map((location) => location.face).sort().join("");
}
function resolve(faces, layer) {
	const observed = layer.names.map((position, index) => {
		const locations = at(layer.homes, index);
		return {
			position,
			locations,
			stickers: locations.map((location) => at(faces[location.face], location.index))
		};
	});
	const matches = observed.map((piece) => identify(piece.stickers, layer.homes));
	const unknown = observed.filter((_, index) => matches[index] === void 0);
	const firstUnknown = unknown[0];
	if (firstUnknown !== void 0) {
		const mirrored = layer.homes.findIndex((home) => sameLetters(firstUnknown.stickers, home));
		throw new UnknownPieceError(unknown, mirrored === -1 ? void 0 : at(layer.names, mirrored));
	}
	const pieces = matches.map((match) => match?.piece ?? -1);
	const isRepeated = (piece) => pieces.indexOf(piece) !== pieces.lastIndexOf(piece);
	const repeated = pieces.find(isRepeated);
	if (repeated !== void 0) throw new DuplicatePieceError(at(layer.names, repeated), observed.filter((_, index) => isRepeated(at(pieces, index))), layer.names.filter((_, index) => pieces[index] === repeated));
	return {
		pieces,
		orientations: matches.map((match) => match?.orientation ?? 0)
	};
}
function sum(values) {
	return values.reduce((total, value) => total + value, 0);
}
/**
* The cube that shows the stickers in `faces`.
*
* The compiler checks the shape of `faces`: six faces, nine stickers each, only face letters, and
* every centre on its own face. Whether those stickers form a cube that can exist and be solved is
* checked here, and each way it can fail has its own error, thrown in this order:
* {@link StickerCountError}, {@link UnknownPieceError}, {@link DuplicatePieceError},
* {@link CornerTwistError}, {@link EdgeFlipError}, {@link ParityError}. All of them extend
* {@link InvalidCubeError}.
*/
function cubeFromFaces(faces) {
	assertShape(faces);
	const counts = countStickers(faces);
	if (FACE_ORDER.some((face) => counts[face] !== 9)) throw new StickerCountError(counts);
	const corners = resolve(faces, {
		names: CORNER_POSITIONS,
		homes: CORNER_STICKERS
	});
	const edges = resolve(faces, {
		names: EDGE_POSITIONS,
		homes: EDGE_STICKERS
	});
	if (sum(corners.orientations) % 3 !== 0) throw new CornerTwistError();
	if (sum(edges.orientations) % 2 !== 0) throw new EdgeFlipError();
	if (isOddPermutation(corners.pieces) !== isOddPermutation(edges.pieces)) throw new ParityError();
	return makeCube({
		cp: corners.pieces,
		co: corners.orientations,
		ep: edges.pieces,
		eo: edges.orientations
	});
}
//#endregion
//#region src/grid.ts
/** The stickers of `cube`, for drawing it or for sending it somewhere a `Cube` cannot go. */
function facesFromCube(cube) {
	return gridOf(stateOf(cube));
}
//#endregion
//#region src/util.ts
function outOfRange(index) {
	throw new RangeError(`Internal error: index ${String(index)} is out of range.`);
}
function read8(table, index) {
	return table[index] ?? outOfRange(index);
}
function read16(table, index) {
	return table[index] ?? outOfRange(index);
}
function read32(table, index) {
	return table[index] ?? outOfRange(index);
}
//#endregion
//#region src/solver/coordinates.ts
/**
* The six numbers the two-phase search works with instead of whole cubes.
*
* Phase 1 steers the cube into the subgroup reachable with U, D, R2, L2, F2, B2 alone. A cube is
* in that subgroup exactly when these three are zero:
* - `twist`: the orientation of the first seven corners, base 3 (the eighth follows from them);
* - `flip`: the orientation of the first eleven edges, base 2 (the twelfth follows);
* - `slice`: which four positions hold the four middle-layer edges FR, FL, BL, BR.
*
* Phase 2 finishes inside the subgroup, where these three describe everything that is left:
* - `corners`: the permutation of the eight corners;
* - `udEdges`: the permutation of the eight U- and D-layer edges among positions 0..7;
* - `sliceEdges`: the permutation of the four middle-layer edges among positions 8..11.
*/
var TWIST_COUNT = 2187;
var FLIP_COUNT = 2048;
var CORNERS_COUNT = 40320;
var UD_EDGES_COUNT = 40320;
var FIRST_SLICE_EDGE = 8;
var CHOOSE = [
	1,
	0,
	0,
	0,
	0,
	1,
	1,
	0,
	0,
	0,
	1,
	2,
	1,
	0,
	0,
	1,
	3,
	3,
	1,
	0,
	1,
	4,
	6,
	4,
	1,
	1,
	5,
	10,
	10,
	5,
	1,
	6,
	15,
	20,
	15,
	1,
	7,
	21,
	35,
	35,
	1,
	8,
	28,
	56,
	70,
	1,
	9,
	36,
	84,
	126,
	1,
	10,
	45,
	120,
	210,
	1,
	11,
	55,
	165,
	330
];
function choose(n, k) {
	return k > 4 ? 0 : at(CHOOSE, n * 5 + k);
}
function twistOf(co) {
	let twist = 0;
	for (let i = 0; i < 7; i++) twist = twist * 3 + read8(co, i);
	return twist;
}
function setTwist(co, twist) {
	let rest = twist;
	let total = 0;
	for (let i = 6; i >= 0; i--) {
		const digit = rest % 3;
		co[i] = digit;
		total += digit;
		rest = (rest - digit) / 3;
	}
	co[7] = (3 - total % 3) % 3;
}
function flipOf(eo) {
	let flip = 0;
	for (let i = 0; i < 11; i++) flip = flip * 2 + read8(eo, i);
	return flip;
}
function setFlip(eo, flip) {
	let rest = flip;
	let total = 0;
	for (let i = 10; i >= 0; i--) {
		const digit = rest % 2;
		eo[i] = digit;
		total += digit;
		rest = (rest - digit) / 2;
	}
	eo[11] = total % 2;
}
function sliceOf(ep) {
	let slice = 0;
	let found = 0;
	for (let position = 11; position >= 0; position--) if (read8(ep, position) >= FIRST_SLICE_EDGE) {
		found += 1;
		slice += choose(11 - position, found);
	}
	return slice;
}
/** Fills `ep` with some arrangement whose `sliceOf` is `slice`; which edge goes where is arbitrary. */
function setSlice(ep, slice) {
	let rest = slice;
	let missing = 4;
	let other = 0;
	for (let position = 0; position < 12; position++) {
		const ways = choose(11 - position, missing);
		if (missing > 0 && rest >= ways) {
			rest -= ways;
			ep[position] = FIRST_SLICE_EDGE + (4 - missing);
			missing -= 1;
		} else {
			ep[position] = other;
			other += 1;
		}
	}
}
/** The rank of the permutation in `values[start..start + length)`, from 0 to `length! - 1`. */
function rankOf(values, start, length) {
	let rank = 0;
	for (let i = 0; i < length; i++) {
		const value = read8(values, start + i);
		let smaller = 0;
		for (let j = i + 1; j < length; j++) if (read8(values, start + j) < value) smaller += 1;
		rank = rank * (length - i) + smaller;
	}
	return rank;
}
/** Writes the permutation of `lowest..lowest + length - 1` with the given rank into `values`. */
function setRank(values, start, length, lowest, rank) {
	let rest = rank;
	for (let i = length - 1; i >= 0; i--) {
		const base = length - i;
		const digit = rest % base;
		rest = (rest - digit) / base;
		values[start + i] = digit;
		for (let j = i + 1; j < length; j++) {
			const later = read8(values, start + j);
			if (later >= digit) values[start + j] = later + 1;
		}
	}
	for (let i = 0; i < length; i++) values[start + i] = read8(values, start + i) + lowest;
}
//#endregion
//#region src/solver/tables.ts
/** Every move, in the order all tables index them by: face U, R, F, D, L, B, then turns 1, 2, 3. */
var ALL_MOVES = [
	"U",
	"U2",
	"U_PRIME",
	"R",
	"R2",
	"R_PRIME",
	"F",
	"F2",
	"F_PRIME",
	"D",
	"D2",
	"D_PRIME",
	"L",
	"L2",
	"L_PRIME",
	"B",
	"B2",
	"B_PRIME"
];
/** The moves phase 2 may use, as indices into `ALL_MOVES`: U, U2, U', R2, F2, D, D2, D', L2, B2. */
var PHASE_2_MOVES = [
	0,
	1,
	2,
	4,
	7,
	9,
	10,
	11,
	13,
	16
];
var UNREACHED = 255;
/**
* One move table. `write` puts coordinate `c` into the scratch array, `read` takes the coordinate
* back out after the scratch array has been permuted (and, with `modulus`, re-oriented) by a move.
*/
function moveTable(count, moves, size, write, read, permutationOf, orientationOf, modulus) {
	const table = new Uint16Array(count * moves.length);
	const before = new Uint8Array(size);
	const after = new Uint8Array(size);
	const effects = moves.map((move) => effectOf(at(ALL_MOVES, move)));
	const permutations = effects.map((effect) => Uint8Array.from(permutationOf(effect)));
	const orientations = effects.map((effect) => Uint8Array.from(orientationOf?.(effect) ?? []));
	for (let coordinate = 0; coordinate < count; coordinate++) {
		write(before, coordinate);
		for (let m = 0; m < effects.length; m++) {
			const permutation = at(permutations, m);
			const orientation = at(orientations, m);
			for (let i = 0; i < size; i++) {
				const moved = read8(before, read8(permutation, i));
				after[i] = orientation.length === 0 ? moved : (moved + read8(orientation, i)) % modulus;
			}
			table[coordinate * effects.length + m] = read(after);
		}
	}
	return table;
}
/**
* The exact distance to (0, 0) for every pair of two coordinates, by breadth-first search outward
* from (0, 0). Every move has its inverse in the same move set, so distance from equals distance
* to. Indexed `first * secondCount + second`.
*/
function distanceTable(firstMove, firstCount, secondMove, secondCount, moveCount) {
	const distance = new Uint8Array(firstCount * secondCount).fill(UNREACHED);
	const queue = new Uint32Array(firstCount * secondCount);
	let head = 0;
	let tail = 1;
	distance[0] = 0;
	while (head < tail) {
		const pair = read32(queue, head);
		head += 1;
		const next = read8(distance, pair) + 1;
		const second = pair % secondCount;
		const firstRow = (pair - second) / secondCount * moveCount;
		const secondRow = second * moveCount;
		for (let m = 0; m < moveCount; m++) {
			const neighbour = read16(firstMove, firstRow + m) * secondCount + read16(secondMove, secondRow + m);
			if (distance[neighbour] === UNREACHED) {
				distance[neighbour] = next;
				queue[tail] = neighbour;
				tail += 1;
			}
		}
	}
	return distance;
}
function build() {
	const allMoves = ALL_MOVES.map((_, index) => index);
	const corners = (effect) => effect.cp;
	const edges = (effect) => effect.ep;
	const twistMove = moveTable(TWIST_COUNT, allMoves, 8, setTwist, twistOf, corners, (e) => e.co, 3);
	const flipMove = moveTable(FLIP_COUNT, allMoves, 12, setFlip, flipOf, edges, (e) => e.eo, 2);
	const sliceMove = moveTable(495, allMoves, 12, setSlice, sliceOf, edges, void 0, 1);
	const cornersMove = moveTable(CORNERS_COUNT, PHASE_2_MOVES, 8, (scratch, rank) => {
		setRank(scratch, 0, 8, 0, rank);
	}, (scratch) => rankOf(scratch, 0, 8), corners, void 0, 1);
	const udEdgesMove = moveTable(UD_EDGES_COUNT, PHASE_2_MOVES, 12, (scratch, rank) => {
		setRank(scratch, 0, 8, 0, rank);
		setRank(scratch, 8, 4, 8, 0);
	}, (scratch) => rankOf(scratch, 0, 8), edges, void 0, 1);
	const sliceEdgesMove = moveTable(24, PHASE_2_MOVES, 12, (scratch, rank) => {
		setRank(scratch, 0, 8, 0, 0);
		setRank(scratch, 8, 4, 8, rank);
	}, (scratch) => rankOf(scratch, 8, 4), edges, void 0, 1);
	return {
		twistMove,
		flipMove,
		sliceMove,
		cornersMove,
		udEdgesMove,
		sliceEdgesMove,
		sliceTwistDistance: distanceTable(sliceMove, 495, twistMove, TWIST_COUNT, 18),
		sliceFlipDistance: distanceTable(sliceMove, 495, flipMove, FLIP_COUNT, 18),
		cornersSliceDistance: distanceTable(cornersMove, CORNERS_COUNT, sliceEdgesMove, 24, 10),
		udEdgesSliceDistance: distanceTable(udEdgesMove, UD_EDGES_COUNT, sliceEdgesMove, 24, 10)
	};
}
var tables;
/** The lookup tables, built on first call (the expensive part of this package) and then kept. */
function getTables() {
	tables ??= build();
	return tables;
}
//#endregion
//#region src/solver/search.ts
var NO_FACE = -1;
var LONGEST_PHASE_1 = 12;
var LONGEST_PHASE_2 = 18;
var LENGTH_BOUNDS = [24, 30];
function isRedundant(face, lastFace) {
	return face === lastFace || face + 3 === lastFace;
}
function simplify(path) {
	const merged = [];
	for (const move of path) {
		const previous = merged[merged.length - 1];
		if (previous === void 0 || Math.floor(previous / 3) !== Math.floor(move / 3)) {
			merged.push(move);
			continue;
		}
		merged.pop();
		const turns = (previous % 3 + move % 3 + 2) % 4;
		if (turns !== 0) merged.push(Math.floor(move / 3) * 3 + turns - 1);
	}
	return merged;
}
var Search = class {
	#tables;
	#start;
	#nodeBudget;
	#path = [];
	#best;
	#bound;
	#nodes = 0;
	constructor(tables, start, nodeBudget, bound) {
		this.#tables = tables;
		this.#start = start;
		this.#nodeBudget = nodeBudget;
		this.#bound = bound;
	}
	run() {
		const twist = twistOf(Uint8Array.from(this.#start.co));
		const flip = flipOf(Uint8Array.from(this.#start.eo));
		const slice = sliceOf(Uint8Array.from(this.#start.ep));
		for (let depth = 0; depth <= LONGEST_PHASE_1 && depth <= this.#bound; depth++) if (this.#phase1(twist, flip, slice, depth, NO_FACE)) break;
		return this.#best;
	}
	#isDone() {
		if (this.#best === void 0) return false;
		return this.#nodes >= this.#nodeBudget;
	}
	/** Returns true when the whole search should stop. */
	#phase1(twist, flip, slice, remaining, lastFace) {
		this.#nodes += 1;
		const tables = this.#tables;
		if (Math.max(read8(tables.sliceTwistDistance, slice * 2187 + twist), read8(tables.sliceFlipDistance, slice * 2048 + flip)) > remaining) return false;
		if (remaining === 0) return this.#enterPhase2();
		for (let move = 0; move < 18; move++) {
			const face = Math.floor(move / 3);
			if (isRedundant(face, lastFace)) continue;
			this.#path.push(move);
			const stop = this.#phase1(read16(tables.twistMove, twist * 18 + move), read16(tables.flipMove, flip * 18 + move), read16(tables.sliceMove, slice * 18 + move), remaining - 1, face);
			this.#path.pop();
			if (stop) return true;
		}
		return false;
	}
	#enterPhase2() {
		const lastMove = this.#path[this.#path.length - 1];
		if (lastMove !== void 0 && PHASE_2_MOVES.includes(lastMove)) return false;
		let state = this.#start;
		for (const move of this.#path) state = compose(state, effectOf(at(ALL_MOVES, move)));
		const edges = Uint8Array.from(state.ep);
		const corners = rankOf(Uint8Array.from(state.cp), 0, 8);
		const udEdges = rankOf(edges, 0, 8);
		const sliceEdges = rankOf(edges, 8, 4);
		const phase1Length = this.#path.length;
		const longest = Math.min(LONGEST_PHASE_2, this.#bound - phase1Length);
		for (let depth = 0; depth <= longest; depth++) if (this.#phase2(corners, udEdges, sliceEdges, depth, NO_FACE)) {
			this.#best = simplify(this.#path);
			this.#bound = this.#best.length - 1;
			this.#path.length = phase1Length;
			return this.#isDone();
		}
		return this.#isDone();
	}
	/** Returns true when the path now ends in a solved cube. */
	#phase2(corners, udEdges, sliceEdges, remaining, lastFace) {
		this.#nodes += 1;
		const tables = this.#tables;
		if (Math.max(read8(tables.cornersSliceDistance, corners * 24 + sliceEdges), read8(tables.udEdgesSliceDistance, udEdges * 24 + sliceEdges)) > remaining) return false;
		if (remaining === 0) return true;
		for (let m = 0; m < 10; m++) {
			const move = at(PHASE_2_MOVES, m);
			const face = Math.floor(move / 3);
			if (isRedundant(face, lastFace)) continue;
			this.#path.push(move);
			if (this.#phase2(read16(tables.cornersMove, corners * 10 + m), read16(tables.udEdgesMove, udEdges * 10 + m), read16(tables.sliceEdgesMove, sliceEdges * 10 + m), remaining - 1, face)) return true;
			this.#path.pop();
		}
		return false;
	}
};
/**
* A short sequence of moves that solves `start`.
*
* Always finds one: the search first looks for solutions of at most 24 moves, and falls back to the
* proven worst case of the method if there is none. After the first solution it keeps looking for
* shorter ones until it has examined `nodeBudget` positions, so a budget of 0 returns the first
* solution found. The budget counts positions, not time, which makes the result repeatable.
*/
function search(start, nodeBudget) {
	if (isSolvedState(start)) return [];
	const tables = getTables();
	for (const bound of LENGTH_BOUNDS) {
		const best = new Search(tables, start, nodeBudget, bound).run();
		if (best !== void 0) return best.map((move) => at(ALL_MOVES, move));
	}
	throw new Error("Internal error: the two-phase search found no solution for a legal cube.");
}
//#endregion
//#region src/solve.ts
/**
* Every {@link Effort}, keyed by itself, for callers who prefer `Efforts.fast` to the literal
* `'fast'`. Both spellings are the same value and the same type.
*/
var Efforts = {
	fast: "fast",
	full: "full"
};
var NODE_BUDGET = {
	fast: 1e5,
	full: 5e6
};
/**
* Builds the lookup tables the solver needs, if they are not built yet.
*
* Importing this package costs nothing; the first {@link solve} pays for the tables instead, about
* a third of a second and 6 MB of memory. Call `prepare` to pay at a moment of your choosing, such as the start of a
* worker. Calling it again does nothing.
*/
function prepare() {
	getTables();
}
/**
* A short sequence of moves that solves `cube`, by Kociemba's two-phase algorithm. A solved cube
* gives an empty list.
*
* Every `Cube` is legal, so this never rejects its input. It runs synchronously and keeps the
* thread busy while it works; in a browser, call it from a worker.
*/
function solve(cube, options = {}) {
	const effort = options.effort ?? "full";
	if (!Object.hasOwn(NODE_BUDGET, effort)) throw new TypeError(`Unknown effort ${JSON.stringify(effort)}. Use "fast" or "full".`);
	return search(stateOf(cube), NODE_BUDGET[effort]);
}
//#endregion
export { CornerTwistError, DuplicatePieceError, EdgeFlipError, Efforts, FaceletStringError, Faces, InvalidCubeError, Moves, ParityError, StickerCountError, UnknownPieceError, applyMoves, cubeFromFaces, cubeFromMoves, faceOf, facesFromCube, formatAlgorithm, inverse, isSolved, parseFaceletString, prepare, solve, turnsOf };

//# sourceMappingURL=index.js.map