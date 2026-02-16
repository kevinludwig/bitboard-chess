/**
 * BitboardChessNative (C addon) vs chess.js: same SAN sequences, compare final FEN.
 * Equivalent to BitboardChess.test.cjs but for the native implementation.
 * Skipped entirely if the native addon is not built (npm run build).
 */
const { expect } = require('chai');
const Chess = require('chess.js').Chess;

let BitboardChessNative, SQUARES, squareNameToIndex, squareToBitboard, squareNameToBitboard, getFileMask, getRankMask;
try {
  const nativeModule = require('../index-native.cjs');
  BitboardChessNative = nativeModule.BitboardChessNative;
  SQUARES = nativeModule.SQUARES;
  squareNameToIndex = nativeModule.squareNameToIndex;
  squareToBitboard = nativeModule.squareToBitboard;
  squareNameToBitboard = nativeModule.squareNameToBitboard;
  getFileMask = nativeModule.getFileMask;
  getRankMask = nativeModule.getRankMask;
} catch (_) {
  BitboardChessNative = null;
}

/** First 4 FEN fields (position, side, castling, ep) for comparison. */
function fenPosition(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Apply SAN moves to native engine; assert final position FEN (first 4 fields) matches chess.js.
 */
function assertSamePosition(sanMoves, description) {
  const chess = new Chess();
  const board = new BitboardChessNative();
  try {
    for (const san of sanMoves) {
      const move = chess.move(san);
      if (!move) throw new Error(`chess.js: invalid move "${san}"`);
      const ok = board.makeMoveSAN(san);
      if (!ok) throw new Error(`makeMoveSAN failed for "${san}"`);
    }
    const chessFen = fenPosition(chess.fen());
    const boardFen = fenPosition(board.toFEN());
    expect(boardFen, description).to.equal(chessFen);
  } finally {
    board.destroy();
  }
}

function runNativeTests() {
  describe('BitboardChessNative vs chess.js', function () {
    afterEach(function () {
      // No shared board; each test creates its own and destroys in assertSamePosition
    });

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
      assertSamePosition(
        ['e4', 'c5', 'Nc3', 'd6', 'd4', 'cxd4', 'Qxd4', 'Nc6', 'Qd2', 'Nf6', 'b3', 'e6', 'Bb2', 'Be7', 'O-O-O'],
        'White castles long'
      );
    });

    it('en passant', function () {
      assertSamePosition(
        ['d4', 'f5', 'e4', 'fxe4', 'd5', 'e5', 'dxe6'],
        'En passant: dxe6'
      );
    });

    it('promotion (queen)', function () {
      assertSamePosition(
        ['e4', 'e5', 'd4', 'exd4', 'c3', 'dxc3', 'Bc4', 'cxb2', 'Nc3', 'b1=Q'],
        'Promotion to queen b1=Q'
      );
    });

    it('ambiguous move: Nbd7 (knight from b-file to d7)', function () {
      assertSamePosition(
        ['d4', 'd5', 'Nf3', 'Nf6', 'c4', 'e6', 'Nc3', 'c6', 'e3', 'Nbd7', 'Bd3', 'Bd6', 'O-O', 'O-O'],
        'Nbd7 (knight b8 to d7)'
      );
    });

    it('check: 1. e4 c5 2. Nf3 d6 3. Bb5+ Nc6', function () {
      assertSamePosition(
        ['e4', 'c5', 'Nf3', 'd6', 'Bb5+', 'Nc6'],
        'SAN with check (Bb5+)'
      );
    });

    it('checkmate: 1. e4 e5 2. Bc4 Bc5 3. Qh5 Nf6 4. Qxf7#', function () {
      assertSamePosition(
        ['e4', 'e5', 'Bc4', 'Bc5', 'Qh5', 'Nf6', 'Qxf7#'],
        'SAN with checkmate (Qxf7#)'
      );
    });

    describe('makeMoveSAN', function () {
      it('returns true for valid SAN', function () {
        const b = new BitboardChessNative();
        try {
          expect(b.makeMoveSAN('e4')).to.equal(true);
        } finally {
          b.destroy();
        }
      });
      it('returns false for invalid SAN', function () {
        const b = new BitboardChessNative();
        try {
          expect(b.makeMoveSAN('invalid')).to.equal(false);
          expect(b.makeMoveSAN('e5')).to.equal(false);
        } finally {
          b.destroy();
        }
      });
    });

    describe('getZobristKey', function () {
      it('returns a bigint', function () {
        const b = new BitboardChessNative();
        try {
          expect(b.getZobristKey()).to.be.a('bigint');
        } finally {
          b.destroy();
        }
      });

      it('is deterministic for the same position', function () {
        const b = new BitboardChessNative();
        try {
          expect(b.getZobristKey()).to.equal(b.getZobristKey());
          b.makeMoveSAN('e4');
          const k = b.getZobristKey();
          expect(b.getZobristKey()).to.equal(k);
        } finally {
          b.destroy();
        }
      });

      it('differs when position differs', function () {
        const start = new BitboardChessNative();
        const afterE4 = new BitboardChessNative();
        try {
          afterE4.makeMoveSAN('e4');
          expect(afterE4.getZobristKey()).to.not.equal(start.getZobristKey());
        } finally {
          start.destroy();
          afterE4.destroy();
        }
      });

      it('loadFromFEN matches replay (same position → same key)', function () {
        const chess = new Chess();
        const board = new BitboardChessNative();
        try {
          const moves = ['e4', 'e5', 'Nf3', 'Nc6'];
          for (const san of moves) {
            const move = chess.move(san);
            if (!move) throw new Error(`invalid: ${san}`);
            board.makeMoveSAN(san);
          }
          const keyFromReplay = board.getZobristKey();
          const fen = board.toFEN();
          const fromFen = new BitboardChessNative();
          try {
            fromFen.loadFromFEN(fen);
            expect(fromFen.getZobristKey(), 'same position from FEN').to.equal(keyFromReplay);
          } finally {
            fromFen.destroy();
          }
        } finally {
          board.destroy();
        }
      });
    });

    describe('resolveSAN', function () {
      it('returns move object for e4 (pawn push)', function () {
        const b = new BitboardChessNative();
        try {
          const move = b.resolveSAN('e4');
          expect(move).to.be.an('object');
          expect(move.from).to.equal(12);
          expect(move.to).to.equal(28);
          expect(move).to.not.have.property('castle');
        } finally {
          b.destroy();
        }
      });
      it('returns move object with castle for O-O', function () {
        const b = new BitboardChessNative();
        try {
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
        } finally {
          b.destroy();
        }
      });
      it('returns null for invalid SAN', function () {
        const b = new BitboardChessNative();
        try {
          expect(b.resolveSAN('invalid')).to.be.null;
        } finally {
          b.destroy();
        }
      });
    });

    describe('makeMove', function () {
      it('applies raw move and toFEN reflects it', function () {
        const b = new BitboardChessNative();
        try {
          const move = b.resolveSAN('e4');
          expect(move).to.not.be.null;
          b.makeMove(move);
          const fen = b.toFEN();
          expect(fen).to.include('4P3');
          expect(fen).to.include(' b ');
        } finally {
          b.destroy();
        }
      });
      it('applies castle move via makeMove', function () {
        const chess = new Chess();
        const b = new BitboardChessNative();
        try {
          ['e4', 'e5', 'Nf3', 'Nc6', 'Be2', 'Nf6'].forEach(san => {
            chess.move(san);
            b.makeMoveSAN(san);
          });
          b.makeMove({ from: 4, to: 6, castle: 'K' });
          chess.move('O-O');
          expect(fenPosition(b.toFEN())).to.equal(fenPosition(chess.fen()));
        } finally {
          b.destroy();
        }
      });
    });

    describe('loadFromFEN', function () {
      it('sets position and toFEN matches', function () {
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
        const b = new BitboardChessNative();
        try {
          b.loadFromFEN(fen);
          expect(fenPosition(b.toFEN())).to.equal(fenPosition(fen));
        } finally {
          b.destroy();
        }
      });
    });

    describe('toFEN', function () {
      it('initial position has correct first four fields', function () {
        const b = new BitboardChessNative();
        try {
          const fen = b.toFEN();
          expect(fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).to.be.true;
          expect(fen).to.include(' w ');
          expect(fen).to.match(/ KQkq /);
        } finally {
          b.destroy();
        }
      });
    });

    describe('reset', function () {
      it('restores initial position', function () {
        const b = new BitboardChessNative();
        try {
          const initialKey = b.getZobristKey();
          b.makeMoveSAN('e4');
          b.makeMoveSAN('e5');
          expect(b.getZobristKey()).to.not.equal(initialKey);
          b.reset();
          expect(b.getZobristKey()).to.equal(initialKey);
          const initial = new BitboardChessNative();
          try {
            expect(fenPosition(b.toFEN())).to.equal(fenPosition(initial.toFEN()));
          } finally {
            initial.destroy();
          }
        } finally {
          b.destroy();
        }
      });
    });

    describe('destroy', function () {
      it('does not throw', function () {
        const b = new BitboardChessNative();
        expect(() => b.destroy()).to.not.throw();
      });
    });

    describe('getPosition', function () {
      it('returns shape with sideToMove, zobrist, piece bitboards, occupancies', function () {
        const b = new BitboardChessNative();
        try {
          const pos = b.getPosition();
          expect(pos.sideToMove).to.equal('w');
          expect(pos.zobrist).to.equal(b.getZobristKey());
          expect(pos.whiteKing).to.equal(squareToBitboard(4));
          expect(pos.whiteOccupancy).to.equal(pos.whitePawns | pos.whiteKnights | pos.whiteBishops | pos.whiteRooks | pos.whiteQueens | pos.whiteKing);
          expect(pos.fullOccupancy).to.equal(pos.whiteOccupancy | pos.blackOccupancy);
        } finally {
          b.destroy();
        }
      });
      it('after e4, whitePawns has e4 set', function () {
        const b = new BitboardChessNative();
        try {
          b.makeMoveSAN('e4');
          const pos = b.getPosition();
          const e4 = squareToBitboard(28);
          const e2 = squareToBitboard(12);
          expect(pos.whitePawns & e4).to.equal(e4);
          expect(pos.whitePawns & e2).to.equal(0n);
        } finally {
          b.destroy();
        }
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
      });
      it('getFileMask accepts "a"-"h" or 0-7', function () {
        expect(getFileMask('a')).to.equal(getFileMask(0));
        expect(getFileMask('e')).to.equal(0x1010101010101010n);
      });
      it('getRankMask is 1-based', function () {
        expect(getRankMask(1)).to.equal(0xffn);
        expect(getRankMask(4)).to.equal(0xffn << 24n);
      });
      it('SQUARES has a1=0 through h8=63', function () {
        expect(SQUARES.a1).to.equal(0);
        expect(SQUARES.h8).to.equal(63);
      });
    });
  });
}

if (BitboardChessNative) {
  runNativeTests();
} else {
  describe('BitboardChessNative vs chess.js', function () {
    it('skipped (native addon not built; run npm run build)', function () {
      this.skip();
    });
  });
}
