/**
 * BitboardChess vs chess.js: apply the same move sequence to both, compare final FEN.
 * Goal: for validated move input, the ending position must match chess.js.
 * BitboardChess does not validate moves; we only verify correct state updates.
 * Covers: base, castling short/long, en passant, promotion, ambiguous (e.g. Nbd7).
 */
const { expect } = require('chai');
const Chess = require('chess.js').Chess;

let BitboardChess;

before(async function () {
  const mod = await import('../index.mjs');
  BitboardChess = mod.default;
});

/** Convert square name (e.g. 'e4') to 0-63 index (a1=0, h8=63). */
function squareToIndex(sq) {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  return rank * 8 + file;
}

/** Convert chess.js move object to BitboardChess makeMove format. */
function toBitboardMove(move) {
  const m = {
    from: squareToIndex(move.from),
    to: squareToIndex(move.to),
  };
  if (move.flags === 'k') m.castle = 'K';
  else if (move.flags === 'q') m.castle = 'Q';
  if (move.flags === 'e') m.enpassant = true;
  if (move.promotion) m.promotion = move.promotion;
  return m;
}

/** First 4 FEN fields (position, side, castling, ep) for comparison. */
function fenPosition(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Apply SAN moves to both engines and assert final position FEN (first 4 fields) match.
 */
function assertSamePosition(sanMoves, description) {
  const chess = new Chess();
  const bitboard = new BitboardChess();

  for (const san of sanMoves) {
    const move = chess.move(san);
    if (!move) throw new Error(`chess.js: invalid move "${san}"`);
    bitboard.makeMove(toBitboardMove(move));
  }

  const chessFen = fenPosition(chess.fen());
  const bitboardFen = fenPosition(bitboard.toFEN());
  expect(bitboardFen, description).to.equal(chessFen);
}

describe('BitboardChess vs chess.js', function () {
  it('base case: a few simple moves (e4 e5 Nf3 Nc6)', function () {
    assertSamePosition(
      ['e4', 'e5', 'Nf3', 'Nc6'],
      'Final position after e4 e5 Nf3 Nc6'
    );
  });

  it('castling short (kingside)', function () {
    assertSamePosition(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Be2', 'Nf6', 'O-O'],
      'White castles short'
    );
  });

  it('castling long (queenside)', function () {
    // 1. e4 c5 2. Nc3 d6 3. d4 cxd4 4. Qxd4 Nc6 5. Qd2 Nf6 6. b3 e6 7. Bb2 Be7 8. O-O-O
    assertSamePosition(
      ['e4', 'c5', 'Nc3', 'd6', 'd4', 'cxd4', 'Qxd4', 'Nc6', 'Qd2', 'Nf6', 'b3', 'e6', 'Bb2', 'Be7', 'O-O-O'],
      'White castles long'
    );
  });

  it('en passant', function () {
    // d4 f5 e4 fxe4 d5 e5 then dxe6 (en passant: d5 pawn captures e5 and lands on e6)
    assertSamePosition(
      ['d4', 'f5', 'e4', 'fxe4', 'd5', 'e5', 'dxe6'],
      'En passant: dxe6'
    );
  });

  it('promotion (queen)', function () {
    // Black pawn promotes b2->b1=Q; Nc3 clears b1 so the pawn can land there.
    assertSamePosition(
      ['e4', 'e5', 'd4', 'exd4', 'c3', 'dxc3', 'Bc4', 'cxb2', 'Nc3', 'b1=Q'],
      'Promotion to queen b1=Q'
    );
  });

  it('ambiguous move: Nbd7 (knight from b-file to d7)', function () {
    // Nbd7: of two knights that can go to d7, the one on the b-file moves.
    assertSamePosition(
      ['d4', 'd5', 'Nf3', 'Nf6', 'c4', 'e6', 'Nc3', 'c6', 'e3', 'Nbd7', 'Bd3', 'Bd6', 'O-O', 'O-O'],
      'Nbd7 (knight b8 to d7)'
    );
  });

  describe('makeMoveSAN (SAN-only, no chess.js)', function () {
    /** Apply SAN moves to BitboardChess only; assert final FEN matches chess.js. */
    function assertSamePositionSAN(sanMoves, description) {
      const chess = new Chess();
      const bitboard = new BitboardChess();
      for (const san of sanMoves) {
        const move = chess.move(san);
        if (!move) throw new Error(`chess.js: invalid move "${san}"`);
        const ok = bitboard.makeMoveSAN(san);
        if (!ok) throw new Error(`makeMoveSAN failed for "${san}"`);
      }
      const chessFen = fenPosition(chess.fen());
      const bitboardFen = fenPosition(bitboard.toFEN());
      expect(bitboardFen, description).to.equal(chessFen);
    }
    it('base case (e4 e5 Nf3 Nc6)', function () {
      assertSamePositionSAN(['e4', 'e5', 'Nf3', 'Nc6'], 'SAN-only base');
    });
    it('castling short', function () {
      assertSamePositionSAN(['e4', 'e5', 'Nf3', 'Nc6', 'Be2', 'Nf6', 'O-O'], 'SAN-only O-O');
    });
    it('castling long', function () {
      assertSamePositionSAN(['e4', 'c5', 'Nc3', 'd6', 'd4', 'cxd4', 'Qxd4', 'Nc6', 'Qd2', 'Nf6', 'b3', 'e6', 'Bb2', 'Be7', 'O-O-O'], 'SAN-only O-O-O');
    });
    it('en passant', function () {
      assertSamePositionSAN(['d4', 'f5', 'e4', 'fxe4', 'd5', 'e5', 'dxe6'], 'SAN-only dxe6');
    });
    it('promotion', function () {
      assertSamePositionSAN(['e4', 'e5', 'd4', 'exd4', 'c3', 'dxc3', 'Bc4', 'cxb2', 'Nc3', 'b1=Q'], 'SAN-only b1=Q');
    });
    it('ambiguous Nbd7', function () {
      assertSamePositionSAN(['d4', 'd5', 'Nf3', 'Nf6', 'c4', 'e6', 'Nc3', 'c6', 'e3', 'Nbd7', 'Bd3', 'Bd6', 'O-O', 'O-O'], 'SAN-only Nbd7');
    });
  });

  describe('getZobristKey', function () {
    it('returns a bigint', function () {
      const b = new BitboardChess();
      expect(b.getZobristKey()).to.be.a('bigint');
    });
    it('is deterministic for the same position', function () {
      const b = new BitboardChess();
      expect(b.getZobristKey()).to.equal(b.getZobristKey());
      b.makeMove(toBitboardMove(new Chess().move('e4')));
      const k = b.getZobristKey();
      expect(b.getZobristKey()).to.equal(k);
    });
    it('differs when position differs', function () {
      const start = new BitboardChess();
      const afterE4 = new BitboardChess();
      afterE4.makeMove({ from: 12, to: 28 }); // e2-e4
      expect(afterE4.getZobristKey()).to.not.equal(start.getZobristKey());
    });
    it('loadFromFEN matches replay (same position → same key)', function () {
      const chess = new Chess();
      const board = new BitboardChess();
      const moves = ['e4', 'e5', 'Nf3', 'Nc6'];
      for (const san of moves) {
        const move = chess.move(san);
        if (!move) throw new Error(`invalid: ${san}`);
        board.makeMove(toBitboardMove(move));
      }
      const keyFromReplay = board.getZobristKey();
      const fen = board.toFEN();
      const fromFen = new BitboardChess();
      fromFen.loadFromFEN(fen);
      expect(fromFen.getZobristKey(), 'same position from FEN').to.equal(keyFromReplay);
    });
  });
});
