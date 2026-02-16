# bitboard-chess

Lightweight [bitboard](https://en.wikipedia.org/wiki/Bitboard) chess library for position updates, producing [FEN](https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation), and producing [Zobrist keys](https://en.wikipedia.org/wiki/Zobrist_hashing). **No move validation is done.** This library assumes validated input (e.g. from games coming from reliable sources such as [chess.com](www.chess.com) APIs). Supports castling, en passant, promotions, ambiguous moves (Nbd7, R1a8, etc), full FEN, and deterministic Zobrist hashing. Generally you should prefer a library like [chess.js](https://github.com/jhlywa/chess.js/). However you might find this library useful if you are going to be replaying many games or comparing many positions via an automated script or API endpoint, and raw speed is needed.

## Two implementations

| | **JS (default)** | **C native (optional)** |
|---|------------------|-------------------------|
| **Entry** | `index.mjs` | `index-native.cjs` |
| **Requires** | Nothing extra | `npm run build` (node-gyp, Python, C++ toolchain) |
| **Use when** | You want zero setup or can’t build native code | You want maximum throughput (makeMoveSAN / getZobristKey) |
| **API** | Same interface | Same; call `destroy()` when done to free the native handle. |

The JS engine uses BigInt for 64-bit bitboards; the native addon uses C `uint64_t`. Both produce identical FEN and Zobrist keys for the same moves. Use the native addon when you need the highest performance (e.g. many makeMoveSAN + getZobristKey calls).

## Install

```bash
npm install bitboard-chess
```

To use the **native addon**, install and then build (requires [node-gyp](https://github.com/nodejs/node-gyp) prerequisites: Python, and on Windows, Visual Studio Build Tools with “Desktop development with C++”):

```bash
npm run build
```

## Usage

### JS engine (ESM)

```js
import BitboardChess from 'bitboard-chess';

const board = new BitboardChess();
board.makeMoveSAN('e4');
board.makeMoveSAN('e5');
board.makeMoveSAN('Nf3');
console.log(board.toFEN());
// rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKBR1 b Qkq - 1 2

board.makeMove({ from: 12, to: 28 }); // raw move: { from, to, promotion?, castle?, enpassant? } (squares 0–63)
board.loadFromFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
const key = board.getZobristKey(); // bigint
```

### Native addon (CommonJS)

Build once (requires node-gyp prerequisites), then require and instantiate:

```bash
npm run build
```

```js
const { BitboardChessNative } = require('bitboard-chess/native');
const board = new BitboardChessNative();

// ...same API as non-native
// cleanup when done 
board.destroy();
```

## API

The class name is **`BitboardChess`** (JS) or **`BitboardChessNative`** (native); the API is the same.

### Instance methods

- **`new BitboardChess()`** / **`new BitboardChessNative()`** — Start from initial position.
- **`makeMove(move)`** — Apply a move object `{ from, to, promotion?, castle?, enpassant? }`. No validation.
- **`makeMoveSAN(san)`** — Apply a move by SAN string. Returns `true`/`false`. No legality check.
- **`resolveSAN(san)`** — Resolve SAN to a move object, or `null` if ambiguous/unresolvable.
- **`loadFromFEN(fen)`** — Set position from FEN. No validation.
- **`toFEN()`** — Return current position as FEN string.
- **`getZobristKey()`** — Deterministic Zobrist key (bigint) for the current position.
- **`getPosition()`** — Current position as bitboards for use with other bitboard-compatible libraries. Returns `{ sideToMove, zobrist, whitePawns, blackPawns, whiteKnights, ..., blackKing, whiteOccupancy, blackOccupancy, fullOccupancy }` (all piece/occupancy values are bigint).
- **`reset()`** — Reset to initial position.
- **`destroy()`** — No-op in JS. On the native addon, call when done with the instance to free the native handle.

### Square / file / rank helpers (exported from main and native entry)

Squares use the mapping **a1=0, h8=63** (rank-major: rank 1 = 0–7, rank 2 = 8–15, …).

- **`squareNameToIndex(name)`** — Square name `"a1"`–`"h8"` → index 0–63 (number).
- **`squareToBitboard(index)`** — Index 0–63 → single-square bitboard (bigint).
- **`squareNameToBitboard(name)`** — Same as `squareToBitboard(squareNameToIndex(name))`.
- **`getFileMask(file)`** — Bitboard mask for a file. `file`: `"a"`–`"h"` or 0–7 (0=a, 7=h).
- **`getRankMask(rank)`** — Bitboard mask for a rank. `rank`: **1–8** (chess rank; 1=first rank, 8=eighth rank).
- **`SQUARES`** — Constant object `{ a1: 0, ..., h8: 63 }`.

**Usage (ESM):** `import BitboardChess, { SQUARES, squareNameToIndex, squareToBitboard, squareNameToBitboard, getFileMask, getRankMask } from 'bitboard-chess'`  
**Usage (native):** `const { BitboardChessNative, SQUARES, squareNameToIndex, ... } = require('bitboard-chess/native')`

## License

MIT
