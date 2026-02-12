// ============================================================
// Bitboard Chess Engine Core — no move validation.
// Assumes validated input (e.g. from replaying PGN games). Supports:
// castling, en passant, promotions, full FEN. Used to generate FEN
// for the same move sequence as chess.js; final position must match.
// ============================================================

const WHITE = 0;
const BLACK = 1;

const bit = (sq) => 1n << BigInt(sq);

// Precomputed attack tables
const knightAttacks = new Array(64).fill(0n);
const kingAttacks = new Array(64).fill(0n);
const pawnAttacks = [new Array(64).fill(0n), new Array(64).fill(0n)];

function inBoard(f, r) {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

function initAttackTables() {
  for (let sq = 0; sq < 64; sq++) {
    const f = sq % 8;
    const r = Math.floor(sq / 8);

    // Knight
    const kD = [
      [1, 2], [2, 1], [2, -1], [1, -2],
      [-1, -2], [-2, -1], [-2, 1], [-1, 2]
    ];
    let bb = 0n;
    for (const [df, dr] of kD) {
      const nf = f + df, nr = r + dr;
      if (inBoard(nf, nr)) bb |= bit(nr * 8 + nf);
    }
    knightAttacks[sq] = bb;

    // King
    const gD = [
      [1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1]
    ];
    bb = 0n;
    for (const [df, dr] of gD) {
      const nf = f + df, nr = r + dr;
      if (inBoard(nf, nr)) bb |= bit(nr * 8 + nf);
    }
    kingAttacks[sq] = bb;

    // Pawn attacks
    // White
    let w = 0n;
    if (inBoard(f - 1, r + 1)) w |= bit((r + 1) * 8 + (f - 1));
    if (inBoard(f + 1, r + 1)) w |= bit((r + 1) * 8 + (f + 1));
    pawnAttacks[WHITE][sq] = w;

    // Black
    let b = 0n;
    if (inBoard(f - 1, r - 1)) b |= bit((r - 1) * 8 + (f - 1));
    if (inBoard(f + 1, r - 1)) b |= bit((r - 1) * 8 + (f + 1));
    pawnAttacks[BLACK][sq] = b;
  }
}
initAttackTables();

// ============================================================
// Sliding piece attacks from a square (for SAN resolution)
// ============================================================
function getRookAttacks(sq, occ) {
  const f = sq % 8;
  const r = (sq / 8) | 0;
  let bb = 0n;
  for (let nf = f + 1; nf < 8; nf++) {
    const s = r * 8 + nf;
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  for (let nf = f - 1; nf >= 0; nf--) {
    const s = r * 8 + nf;
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  for (let nr = r + 1; nr < 8; nr++) {
    const s = nr * 8 + f;
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  for (let nr = r - 1; nr >= 0; nr--) {
    const s = nr * 8 + f;
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  return bb;
}

function getBishopAttacks(sq, occ) {
  const f = sq % 8;
  const r = (sq / 8) | 0;
  let bb = 0n;
  for (let d = 1; d < 8; d++) {
    if (f + d >= 8 || r + d >= 8) break;
    const s = (r + d) * 8 + (f + d);
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  for (let d = 1; d < 8; d++) {
    if (f - d < 0 || r + d >= 8) break;
    const s = (r + d) * 8 + (f - d);
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  for (let d = 1; d < 8; d++) {
    if (f + d >= 8 || r - d < 0) break;
    const s = (r - d) * 8 + (f + d);
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  for (let d = 1; d < 8; d++) {
    if (f - d < 0 || r - d < 0) break;
    const s = (r - d) * 8 + (f - d);
    bb |= bit(s);
    if (occ & bit(s)) break;
  }
  return bb;
}

/** "e4" -> 28 (a1=0, h8=63). */
function squareToIndex(sqStr) {
  const file = sqStr.charCodeAt(0) - 97;
  const rank = parseInt(sqStr[1], 10) - 1;
  return rank * 8 + file;
}

/** Squares from which a pawn of color can capture to toSq (bitboard). */
function pawnCaptureSources(toSq, color) {
  const f = toSq % 8;
  const r = (toSq / 8) | 0;
  let bb = 0n;
  if (color === WHITE) {
    if (r >= 1 && f >= 1) bb |= bit((r - 1) * 8 + (f - 1));
    if (r >= 1 && f < 7) bb |= bit((r - 1) * 8 + (f + 1));
  } else {
    if (r < 7 && f >= 1) bb |= bit((r + 1) * 8 + (f - 1));
    if (r < 7 && f < 7) bb |= bit((r + 1) * 8 + (f + 1));
  }
  return bb;
}

/** Filter candidate bitboard by optional file/rank; return single sq index or -1. */
function filterDisamb(candidates, disambFile, disambRank) {
  let bb = candidates;
  if (disambFile !== undefined) {
    const fileIdx = disambFile.charCodeAt(0) - 97;
    const fileMask = (1n << BigInt(fileIdx)) | (1n << BigInt(8 + fileIdx)) | (1n << BigInt(16 + fileIdx)) | (1n << BigInt(24 + fileIdx)) | (1n << BigInt(32 + fileIdx)) | (1n << BigInt(40 + fileIdx)) | (1n << BigInt(48 + fileIdx)) | (1n << BigInt(56 + fileIdx));
    bb = bb & fileMask;
  }
  if (disambRank !== undefined) {
    const rankIdx = parseInt(disambRank, 10) - 1;
    bb = bb & (0xffn << BigInt(rankIdx * 8));
  }
  let found = -1;
  for (let sq = 0; sq < 64; sq++) {
    if (bb & bit(sq)) {
      if (found >= 0) return -1;
      found = sq;
    }
  }
  return found;
}

/** Parse SAN to { piece, targetIndex, disambFile, disambRank, promotion, castle }. piece: 'N'|'B'|'R'|'Q'|'K'|null (pawn). */
function parseSAN(san) {
  const s = String(san).trim();
  if (s === 'O-O' || s === 'O-O-O') {
    return { piece: null, targetIndex: -1, disambFile: undefined, disambRank: undefined, promotion: undefined, castle: s === 'O-O' ? 'K' : 'Q' };
  }
  const targetPromo = s.match(/([a-h][1-8])(?:=([NBRQ]))?$/);
  if (!targetPromo) return null;
  const targetStr = targetPromo[1];
  const promotion = targetPromo[2] ? targetPromo[2].toLowerCase() : undefined;
  const targetIndex = squareToIndex(targetStr);
  let rest = s.slice(0, s.length - targetPromo[0].length).replace(/x$/, '');
  let piece = null;
  let disambFile;
  let disambRank;
  if (rest.length > 0 && 'NBRQK'.includes(rest[0])) {
    piece = rest[0];
    rest = rest.slice(1);
  }
  if (rest.length >= 1) {
    if (rest[0] >= 'a' && rest[0] <= 'h') disambFile = rest[0];
    if (rest[rest.length - 1] >= '1' && rest[rest.length - 1] <= '8') disambRank = rest[rest.length - 1];
    if (rest.length === 2 && rest[0] >= 'a' && rest[0] <= 'h' && rest[1] >= '1' && rest[1] <= '8') {
      disambFile = rest[0];
      disambRank = rest[1];
    }
  }
  return { piece, targetIndex, disambFile, disambRank, promotion, castle: undefined };
}

// ============================================================
// Zobrist hashing (deterministic, seeded)
// ============================================================
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t >>> 7;
    return (t ^ (t >>> 12)) >>> 0;
  };
}

function random64(prng) {
  const lo = prng();
  const hi = prng();
  return (BigInt(hi) << 32n) | BigInt(lo);
}

const ZOBRIST_PIECES = [];
const ZOBRIST_CASTLE = [];
const ZOBRIST_EP = [];
const ZOBRIST_SIDE = { value: 0n };

(function initZobrist() {
  const prng = mulberry32(0x5eed);
  for (let sq = 0; sq < 64; sq++) {
    ZOBRIST_PIECES[sq] = [];
    for (let pt = 0; pt < 12; pt++) ZOBRIST_PIECES[sq][pt] = random64(prng);
  }
  ZOBRIST_SIDE.value = random64(prng);
  for (let i = 0; i < 4; i++) ZOBRIST_CASTLE.push(random64(prng));
  for (let f = 0; f < 8; f++) ZOBRIST_EP.push(random64(prng));
})();

// ============================================================
// Engine Class
// ============================================================

class BitboardChess {
  constructor() {
    this.reset();
  }

  reset() {
    // Piece bitboards
    this.pawns = [0n, 0n];
    this.knights = [0n, 0n];
    this.bishops = [0n, 0n];
    this.rooks = [0n, 0n];
    this.queens = [0n, 0n];
    this.kings = [0n, 0n];

    // Game state
    this.sideToMove = WHITE;
    this.castling = "KQkq";
    this.enPassant = -1;
    this.halfmove = 0;
    this.fullmove = 1;

    this._setInitialPosition();
  }

  _setInitialPosition() {
    this.pawns[WHITE] = 0x000000000000FF00n;
    this.pawns[BLACK] = 0x00FF000000000000n;

    this.rooks[WHITE] = 0x0000000000000081n;
    this.rooks[BLACK] = 0x8100000000000000n;

    this.knights[WHITE] = 0x0000000000000042n;
    this.knights[BLACK] = 0x4200000000000000n;

    this.bishops[WHITE] = 0x0000000000000024n;
    this.bishops[BLACK] = 0x2400000000000000n;

    this.queens[WHITE] = 0x0000000000000008n;
    this.queens[BLACK] = 0x0800000000000000n;

    this.kings[WHITE] = 0x0000000000000010n;
    this.kings[BLACK] = 0x1000000000000000n;
  }

  /**
   * Set position from FEN (piece placement, side, castling, en passant).
   * Used for ECO Zobrist indexing and any FEN→key use. No validation.
   */
  loadFromFEN(fen) {
    if (!fen || typeof fen !== 'string') return;
    const tokens = fen.trim().split(/\s+/);
    const placement = tokens[0];
    if (!placement) return;
    const ranks = placement.split('/');
    if (ranks.length !== 8) return;

    this.pawns[WHITE] = 0n;
    this.pawns[BLACK] = 0n;
    this.knights[WHITE] = 0n;
    this.knights[BLACK] = 0n;
    this.bishops[WHITE] = 0n;
    this.bishops[BLACK] = 0n;
    this.rooks[WHITE] = 0n;
    this.rooks[BLACK] = 0n;
    this.queens[WHITE] = 0n;
    this.queens[BLACK] = 0n;
    this.kings[WHITE] = 0n;
    this.kings[BLACK] = 0n;

    for (let r = 0; r < 8; r++) {
      const rankStr = ranks[7 - r];
      let f = 0;
      for (const ch of rankStr) {
        if (f >= 8) break;
        if (ch >= '1' && ch <= '8') {
          f += parseInt(ch, 10);
          continue;
        }
        const sq = r * 8 + f;
        const b = bit(sq);
        if (ch === 'P') this.pawns[WHITE] |= b;
        else if (ch === 'N') this.knights[WHITE] |= b;
        else if (ch === 'B') this.bishops[WHITE] |= b;
        else if (ch === 'R') this.rooks[WHITE] |= b;
        else if (ch === 'Q') this.queens[WHITE] |= b;
        else if (ch === 'K') this.kings[WHITE] |= b;
        else if (ch === 'p') this.pawns[BLACK] |= b;
        else if (ch === 'n') this.knights[BLACK] |= b;
        else if (ch === 'b') this.bishops[BLACK] |= b;
        else if (ch === 'r') this.rooks[BLACK] |= b;
        else if (ch === 'q') this.queens[BLACK] |= b;
        else if (ch === 'k') this.kings[BLACK] |= b;
        f++;
      }
    }

    this.sideToMove = tokens[1] === 'b' ? BLACK : WHITE;
    this.castling = (tokens[2] && tokens[2] !== '-') ? tokens[2] : '';
    const ep = tokens[3];
    if (ep && ep !== '-') {
      const file = ep.charCodeAt(0) - 97;
      const rank = parseInt(ep[1], 10) - 1;
      if (file >= 0 && file < 8 && rank >= 0 && rank < 8) this.enPassant = rank * 8 + file;
      else this.enPassant = -1;
    } else {
      this.enPassant = -1;
    }
    this.halfmove = parseInt(tokens[4], 10) || 0;
    this.fullmove = parseInt(tokens[5], 10) || 1;
  }

  // ============================================================
  // Utility
  // ============================================================

  occupancy(color) {
    return (
      this.pawns[color] |
      this.knights[color] |
      this.bishops[color] |
      this.rooks[color] |
      this.queens[color] |
      this.kings[color]
    );
  }

  allOcc() {
    return this.occupancy(WHITE) | this.occupancy(BLACK);
  }

  // ============================================================
  // SAN resolution (reachability + disambiguation; no legality check)
  // ============================================================

  /**
   * Resolve SAN to move object { from, to, promotion?, castle?, enpassant? }.
   * Returns null if SAN cannot be resolved (ambiguous or no matching piece).
   */
  resolveSAN(san) {
    const p = parseSAN(san);
    if (!p) return null;
    const side = this.sideToMove;
    const occ = this.allOcc();
    const toSq = p.targetIndex;

    if (p.castle) {
      const fromSq = side === WHITE ? 4 : 60;
      const toSqKing = p.castle === 'K' ? (side === WHITE ? 6 : 62) : (side === WHITE ? 2 : 58);
      return { from: fromSq, to: toSqKing, castle: p.castle };
    }

    let candidates;
    if (p.piece === 'K') {
      candidates = kingAttacks[toSq] & this.kings[side];
    } else if (p.piece === 'N') {
      candidates = knightAttacks[toSq] & this.knights[side];
    } else if (p.piece === 'R') {
      candidates = getRookAttacks(toSq, occ) & this.rooks[side];
    } else if (p.piece === 'B') {
      candidates = getBishopAttacks(toSq, occ) & this.bishops[side];
    } else if (p.piece === 'Q') {
      candidates = (getRookAttacks(toSq, occ) | getBishopAttacks(toSq, occ)) & this.queens[side];
    } else {
      // Pawn
      if (p.disambFile !== undefined) {
        // Capture (e.g. exd5, exd6 e.p.): squares from which a pawn can capture to toSq
        candidates = pawnCaptureSources(toSq, side) & this.pawns[side];
        const fileIdx = p.disambFile.charCodeAt(0) - 97;
        const fileMask = (1n << BigInt(fileIdx)) | (1n << BigInt(8 + fileIdx)) | (1n << BigInt(16 + fileIdx)) | (1n << BigInt(24 + fileIdx)) | (1n << BigInt(32 + fileIdx)) | (1n << BigInt(40 + fileIdx)) | (1n << BigInt(48 + fileIdx)) | (1n << BigInt(56 + fileIdx));
        candidates = candidates & fileMask;
      } else {
        // Push
        const oneBack = side === WHITE ? toSq - 8 : toSq + 8;
        const twoBack = side === WHITE ? toSq - 16 : toSq + 16;
        const toRank = (toSq / 8) | 0;
        if (this.pawns[side] & bit(oneBack)) {
          candidates = bit(oneBack);
        } else if ((side === WHITE ? toRank === 3 : toRank === 4) && (this.pawns[side] & bit(twoBack)) && !(occ & bit(oneBack))) {
          candidates = bit(twoBack);
        } else {
          candidates = 0n;
        }
      }
    }

    let fromSq = filterDisamb(candidates, p.disambFile, p.disambRank);
    if (fromSq < 0 && candidates) {
      let count = 0;
      for (let sq = 0; sq < 64; sq++) {
        if (candidates & bit(sq)) { count++; fromSq = sq; if (count > 1) break; }
      }
      if (count !== 1) fromSq = -1;
    }
    if (fromSq < 0) return null;

    const move = { from: fromSq, to: toSq };
    if (p.promotion) move.promotion = p.promotion;
    if (p.piece === null && p.disambFile !== undefined && !(occ & bit(toSq))) move.enpassant = true;
    return move;
  }

  /**
   * Apply a move given in SAN. No validation; assumes valid (e.g. from PGN).
   * Use makeMove(move) for raw move objects.
   */
  makeMoveSAN(san) {
    const move = typeof san === 'string' ? this.resolveSAN(san) : san;
    if (!move) return false;
    this.makeMove(move);
    return true;
  }

  // ============================================================
  // Move Making (NO VALIDATION)
  // move = { from, to, promotion, castle, enpassant }
  // ============================================================

  makeMove(move) {
    const side = this.sideToMove;
    const enemy = side ^ 1;

    const fromBB = bit(move.from);
    const toBB = bit(move.to);

    // -------------------------
    // 1. Handle castling
    // -------------------------
    if (move.castle) {
      if (move.castle === "K") {
        // King-side
        this.kings[side] ^= fromBB | toBB;
        if (side === WHITE) {
          this.rooks[WHITE] ^= bit(7) | bit(5);
        } else {
          this.rooks[BLACK] ^= bit(63) | bit(61);
        }
      } else {
        // Queen-side
        this.kings[side] ^= fromBB | toBB;
        if (side === WHITE) {
          this.rooks[WHITE] ^= bit(0) | bit(3);
        } else {
          this.rooks[BLACK] ^= bit(56) | bit(59);
        }
      }

      // Remove castling rights
      this.castling = this.castling.replace(side === WHITE ? /K|Q/g : /k|q/g, "");
      this._finishMove();
      return;
    }

    // -------------------------
    // 2. Handle en-passant capture
    // -------------------------
    if (move.enpassant) {
      const capSq = side === WHITE ? move.to - 8 : move.to + 8;
      const capBB = bit(capSq);
      this.pawns[enemy] &= ~capBB;
    }

    // -------------------------
    // 3. Remove captured piece (normal capture)
    // -------------------------
    const removeAt = (arr) => (arr[enemy] &= ~toBB);
    [this.pawns, this.knights, this.bishops, this.rooks, this.queens, this.kings]
      .forEach(removeAt);

    // -------------------------
    // 4. Move our piece
    // -------------------------
    const movePiece = (arr) => {
      if (arr[side] & fromBB) {
        arr[side] ^= fromBB;
        arr[side] |= toBB;
        return true;
      }
      return false;
    };

    let movedPawn = false;
    const movedRook = !!(this.rooks[side] & fromBB);

    if (movePiece(this.pawns)) movedPawn = true;
    else if (movePiece(this.knights));
    else if (movePiece(this.bishops));
    else if (movePiece(this.rooks));
    else if (movePiece(this.queens));
    else movePiece(this.kings);

    // -------------------------
    // 5. Promotion
    // -------------------------
    if (move.promotion) {
      // Remove pawn
      this.pawns[side] &= ~toBB;

      const target =
        move.promotion === "q" ? this.queens :
        move.promotion === "r" ? this.rooks :
        move.promotion === "b" ? this.bishops :
        this.knights;

      target[side] |= toBB;
    }

    // -------------------------
    // 6. Update en-passant square
    // -------------------------
    if (movedPawn && Math.abs(move.to - move.from) === 16) {
      this.enPassant = (move.from + move.to) >> 1;
    } else {
      this.enPassant = -1;
    }

    // -------------------------
    // 7. Remove castling rights if king or rook moved
    // -------------------------
    if (fromBB & this.kings[side]) {
      this.castling = this.castling.replace(side === WHITE ? /K|Q/g : /k|q/g, "");
    }
    if (movedRook) {
      if (move.from === 0) this.castling = this.castling.replace("Q", "");
      if (move.from === 7) this.castling = this.castling.replace("K", "");
      if (move.from === 56) this.castling = this.castling.replace("q", "");
      if (move.from === 63) this.castling = this.castling.replace("k", "");
    }

    // -------------------------
    // 8. Finish move
    // -------------------------
    this._finishMove();
  }

  _finishMove() {
    this.sideToMove ^= 1;
    if (this.sideToMove === WHITE) this.fullmove++;
  }

  // ============================================================
  // Zobrist key (from current position; deterministic)
  // ============================================================

  getZobristKey() {
    let key = 0n;
    const pieceSets = [
      [this.pawns, 0, 6],
      [this.knights, 1, 7],
      [this.bishops, 2, 8],
      [this.rooks, 3, 9],
      [this.queens, 4, 10],
      [this.kings, 5, 11],
    ];
    for (let sq = 0; sq < 64; sq++) {
      const b = bit(sq);
      for (const [arr, wPt, bPt] of pieceSets) {
        if (arr[WHITE] & b) {
          key ^= ZOBRIST_PIECES[sq][wPt];
          break;
        }
        if (arr[BLACK] & b) {
          key ^= ZOBRIST_PIECES[sq][bPt];
          break;
        }
      }
    }
    if (this.sideToMove === BLACK) key ^= ZOBRIST_SIDE.value;
    const castlingIndex = { K: 0, Q: 1, k: 2, q: 3 };
    for (const c of this.castling) key ^= ZOBRIST_CASTLE[castlingIndex[c]];
    if (this.enPassant >= 0) key ^= ZOBRIST_EP[this.enPassant % 8];
    return key;
  }

  // ============================================================
  // FEN
  // ============================================================

  toFEN() {
    let fen = "";

    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const sq = r * 8 + f;
        const bb = bit(sq);

        let piece = null;

        const check = (arr, w, b) =>
          arr[WHITE] & bb ? w :
          arr[BLACK] & bb ? b : null;

        piece =
          check(this.pawns, "P", "p") ||
          check(this.knights, "N", "n") ||
          check(this.bishops, "B", "b") ||
          check(this.rooks, "R", "r") ||
          check(this.queens, "Q", "q") ||
          check(this.kings, "K", "k");

        if (!piece) {
          empty++;
        } else {
          if (empty) {
            fen += empty;
            empty = 0;
          }
          fen += piece;
        }
      }
      if (empty) fen += empty;
      if (r > 0) fen += "/";
    }

    fen += " ";
    fen += this.sideToMove === WHITE ? "w" : "b";
    fen += " ";
    fen += this.castling || "-";
    fen += " ";
    fen += this.enPassant === -1
      ? "-"
      : String.fromCharCode("a".charCodeAt(0) + (this.enPassant % 8)) +
        (Math.floor(this.enPassant / 8) + 1);
    fen += " ";
    fen += this.halfmove;
    fen += " ";
    fen += this.fullmove;

    return fen;
  }
}

export default BitboardChess;
