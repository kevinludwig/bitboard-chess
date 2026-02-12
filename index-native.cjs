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

module.exports = { BitboardChessNative, native };
