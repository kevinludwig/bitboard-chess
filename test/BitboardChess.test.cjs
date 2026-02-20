/**
 * BitboardChess vs chess.js: apply the same move sequence to both, compare final FEN.
 * Goal: for validated move input, the ending position must match chess.js.
 * BitboardChess does not validate moves; we only verify correct state updates.
 * Covers: base, castling short/long, en passant, promotion, ambiguous (e.g. Nbd7).
 */
const { describe, it, before } = require('node:test');
const { expect } = require('chai');
const Chess = require('chess.js').Chess;

let BitboardChess;

let SQUARES, squareNameToIndex, squareToBitboard, squareNameToBitboard, getFileMask, getRankMask;

before(async function () {
  const mod = await import('../index.mjs');
  BitboardChess = mod.default;
  SQUARES = mod.SQUARES;
  squareNameToIndex = mod.squareNameToIndex;
  squareToBitboard = mod.squareToBitboard;
  squareNameToBitboard = mod.squareNameToBitboard;
  getFileMask = mod.getFileMask;
  getRankMask = mod.getRankMask;
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
    it('check: 1. e4 c5 2. Nf3 d6 3. Bb5+ Nc6', function () {
      assertSamePositionSAN(['e4', 'c5', 'Nf3', 'd6', 'Bb5+', 'Nc6'], 'SAN with check (Bb5+)');
    });
    it('checkmate: 1. e4 e5 2. Bc4 Bc5 3. Qh5 Nf6 4. Qxf7#', function () {
      assertSamePositionSAN(['e4', 'e5', 'Bc4', 'Bc5', 'Qh5', 'Nf6', 'Qxf7#'], 'SAN with checkmate (Qxf7#)');
    });
    it('makeMoveSAN returns true for valid SAN', function () {
      const b = new BitboardChess();
      expect(b.makeMoveSAN('e4')).to.equal(true);
    });
    it('makeMoveSAN returns false for invalid SAN', function () {
      const b = new BitboardChess();
      expect(b.makeMoveSAN('invalid')).to.equal(false);
      expect(b.makeMoveSAN('e5')).to.equal(false); // black move when white to play
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

  describe('resolveSAN', function () {
    it('returns move object for e4 (pawn push)', function () {
      const b = new BitboardChess();
      const move = b.resolveSAN('e4');
      expect(move).to.be.an('object');
      expect(move.from).to.equal(12); // e2
      expect(move.to).to.equal(28);   // e4
      expect(move).to.not.have.property('castle');
      expect(move).to.not.have.property('enpassant');
    });
    it('returns move object with castle for O-O', function () {
      const b = new BitboardChess();
      b.makeMoveSAN('e4');
      b.makeMoveSAN('e5');
      b.makeMoveSAN('Nf3');
      b.makeMoveSAN('Nc6');
      b.makeMoveSAN('Be2');
      b.makeMoveSAN('Nf6');
      const move = b.resolveSAN('O-O');
      expect(move).to.be.an('object');
      expect(move.castle).to.equal('K');
      expect(move.from).to.equal(4);
      expect(move.to).to.equal(6);
    });
    it('returns null for invalid SAN', function () {
      const b = new BitboardChess();
      expect(b.resolveSAN('invalid')).to.be.null;
      expect(b.resolveSAN('e5')).to.be.null; // not legal from start (black e7-e5 would need different board)
    });
  });

  describe('makeMove', function () {
    it('applies raw move and toFEN reflects it', function () {
      const b = new BitboardChess();
      b.makeMove({ from: 12, to: 28 }); // e2-e4
      const fen = b.toFEN();
      expect(fen).to.include('4P3'); // e4 pawn
      expect(fen).to.include(' b '); // black to move
    });
    it('applies castle move via makeMove', function () {
      const chess = new Chess();
      const b = new BitboardChess();
      ['e4', 'e5', 'Nf3', 'Nc6', 'Be2', 'Nf6'].forEach(san => {
        chess.move(san);
        b.makeMoveSAN(san);
      });
      b.makeMove({ from: 4, to: 6, castle: 'K' });
      chess.move('O-O');
      expect(fenPosition(b.toFEN())).to.equal(fenPosition(chess.fen()));
    });
  });

  describe('loadFromFEN', function () {
    it('sets position and toFEN matches', function () {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const b = new BitboardChess();
      b.loadFromFEN(fen);
      expect(fenPosition(b.toFEN())).to.equal(fenPosition(fen));
    });
  });

  describe('toFEN', function () {
    it('initial position has correct first four fields', function () {
      const b = new BitboardChess();
      const fen = b.toFEN();
      expect(fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).to.be.true;
      expect(fen).to.include(' w ');
      expect(fen).to.match(/ KQkq /);
    });
  });

  describe('reset', function () {
    it('restores initial position', function () {
      const b = new BitboardChess();
      const initialKey = b.getZobristKey();
      b.makeMoveSAN('e4');
      b.makeMoveSAN('e5');
      expect(b.getZobristKey()).to.not.equal(initialKey);
      b.reset();
      expect(b.getZobristKey()).to.equal(initialKey);
      const initialFen = fenPosition(new BitboardChess().toFEN());
      expect(fenPosition(b.toFEN())).to.equal(initialFen);
    });
  });

  describe('destroy', function () {
    it('does not throw', function () {
      const b = new BitboardChess();
      expect(() => b.destroy()).to.not.throw();
    });
  });

  describe('getPosition', function () {
    it('returns shape with sideToMove, zobrist, piece bitboards, occupancies', function () {
      const b = new BitboardChess();
      const pos = b.getPosition();
      expect(pos.sideToMove).to.equal('w');
      expect(pos.zobrist).to.equal(b.getZobristKey());
      expect(pos.whitePawns).to.be.a('bigint');
      expect(pos.whiteKing).to.equal(squareToBitboard(4)); // e1
      expect(pos.whiteOccupancy).to.equal(pos.whitePawns | pos.whiteKnights | pos.whiteBishops | pos.whiteRooks | pos.whiteQueens | pos.whiteKing);
      expect(pos.fullOccupancy).to.equal(pos.whiteOccupancy | pos.blackOccupancy);
    });
    it('after e4, whitePawns has e4 set and e2 clear', function () {
      const b = new BitboardChess();
      b.makeMoveSAN('e4');
      const pos = b.getPosition();
      const e4 = squareToBitboard(28);
      const e2 = squareToBitboard(12);
      expect(pos.whitePawns & e4).to.equal(e4);
      expect(pos.whitePawns & e2).to.equal(0n);
    });
  });

  describe('square helpers', function () {
    it('squareNameToIndex returns 0-63', function () {
      expect(squareNameToIndex('a1')).to.equal(0);
      expect(squareNameToIndex('e4')).to.equal(28);
      expect(squareNameToIndex('h8')).to.equal(63);
    });
    it('squareToBitboard returns single-bit bigint', function () {
      expect(squareToBitboard(0)).to.equal(1n);
      expect(squareToBitboard(28)).to.equal(1n << 28n);
    });
    it('squareNameToBitboard equals squareToBitboard(squareNameToIndex(...))', function () {
      expect(squareNameToBitboard('a5')).to.equal(squareToBitboard(squareNameToIndex('a5')));
      expect(squareNameToBitboard('e4')).to.equal(squareToBitboard(28));
    });
    it('getFileMask accepts "a"-"h" or 0-7', function () {
      expect(getFileMask('a')).to.equal(getFileMask(0));
      expect(getFileMask('h')).to.equal(getFileMask(7));
      expect(getFileMask('e')).to.equal(0x1010101010101010n);
    });
    it('getRankMask is 1-based (1=first rank)', function () {
      expect(getRankMask(1)).to.equal(0xffn);
      expect(getRankMask(4)).to.equal(0xffn << 24n);
      expect(getRankMask(8)).to.equal(0xffn << 56n);
    });
    it('SQUARES has a1=0 through h8=63', function () {
      expect(SQUARES.a1).to.equal(0);
      expect(SQUARES.e4).to.equal(28);
      expect(SQUARES.h8).to.equal(63);
    });
  });
});
