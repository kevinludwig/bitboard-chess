/**
 * Node.js native addon wrapper for BitboardChess (C engine with uint64_t).
 * Use: const { BitboardChessNative } = require('./index-native.cjs');
 * Requires: npm run build (node-gyp)
 */

let native;
try {
  native = require('./build/Release/bitboard_chess_native.node');
} catch (e) {
  try {
    native = require('./build/Debug/bitboard_chess_native.node');
  } catch (e2) {
    throw new Error('bitboard_chess_native addon not built. Run: npm run build');
  }
}

// Square/file/rank helpers (same mapping as index.mjs for bitboard compatibility)
function squareNameToIndex(name) {
  const file = name.charCodeAt(0) - 97;
  const rank = parseInt(name[1], 10) - 1;
  return rank * 8 + file;
}

function squareToBitboard(index) {
  return 1n << BigInt(index);
}

function squareNameToBitboard(name) {
  return squareToBitboard(squareNameToIndex(name));
}

/** file: "a"-"h" or 0-7 (0=a, 7=h). */
function getFileMask(file) {
  const f = typeof file === 'string' ? file.charCodeAt(0) - 97 : file;
  return (0x0101010101010101n << BigInt(f)) & 0xffffffffffffffffn;
}

/** rank: 1-8 (chess rank, 1=first rank, 8=eighth rank). */
function getRankMask(rank) {
  return 0xffn << BigInt((rank - 1) * 8);
}

const SQUARES = Object.freeze(
  (() => {
    const out = {};
    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const name = String.fromCharCode(97 + f) + r;
        out[name] = (r - 1) * 8 + f;
      }
    }
    return out;
  })()
);

class BitboardChessNative {
  constructor() {
    this._handle = native.create();
    if (!this._handle) throw new Error('native.create failed');
  }

  makeMoveSAN(san) {
    if (typeof san !== 'string') return false;
    return native.makeMoveSAN(this._handle, san);
  }

  makeMove(move) {
    if (!move || typeof move.from !== 'number' || typeof move.to !== 'number') return;
    native.makeMove(this._handle, move);
  }

  resolveSAN(san) {
    if (typeof san !== 'string') return null;
    return native.resolveSAN(this._handle, san);
  }

  getZobristKey() {
    return native.getZobristKey(this._handle);
  }

  getPosition() {
    return native.getPosition(this._handle);
  }

  toFEN() {
    return native.toFEN(this._handle);
  }

  loadFromFEN(fen) {
    if (fen == null) return;
    native.loadFromFEN(this._handle, String(fen));
  }

  reset() {
    native.reset(this._handle);
  }

  destroy() {
    if (this._handle) {
      native.destroy(this._handle);
      this._handle = null;
    }
  }
}

module.exports = {
  BitboardChessNative,
  native,
  SQUARES,
  squareNameToIndex,
  squareToBitboard,
  squareNameToBitboard,
  getFileMask,
  getRankMask,
};
