# bitboard-chess

Lightweight bitboard chess engine for position updates. **No move validation** — assumes validated input (e.g. from replaying PGN games). Supports castling, en passant, promotions, full FEN, and deterministic Zobrist hashing.

## Install

```bash
npm install bitboard-chess
```

## Usage (ESM)

```js
import BitboardChess from 'bitboard-chess';

const board = new BitboardChess();

// Apply moves by SAN (Standard Algebraic Notation)
board.makeMoveSAN('e4');
board.makeMoveSAN('e5');
board.makeMoveSAN('Nf3');

console.log(board.toFEN());
// rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKBR1 b Qkq - 1 2

// Or with raw move objects: { from, to, promotion?, castle?, enpassant? }
// Squares are 0–63 (a1=0, h8=63).
board.makeMove({ from: 12, to: 28 }); // e2-e4

// Load from FEN
board.loadFromFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');

// Deterministic Zobrist key (bigint) for the current position
const key = board.getZobristKey();
```

## API

- **`new BitboardChess()`** — Start from initial position.
- **`makeMove(move)`** — Apply a move object `{ from, to, promotion?, castle?, enpassant? }`. No validation.
- **`makeMoveSAN(san)`** — Apply a move by SAN string. Returns `true`/`false`. No legality check.
- **`resolveSAN(san)`** — Resolve SAN to a move object, or `null` if ambiguous/unresolvable.
- **`loadFromFEN(fen)`** — Set position from FEN (piece placement, side, castling, en passant, halfmove, fullmove). No validation.
- **`toFEN()`** — Return current position as FEN string.
- **`getZobristKey()`** — Return deterministic Zobrist key (bigint) for the current position.

## License

MIT
