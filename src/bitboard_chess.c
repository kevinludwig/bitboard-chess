/* Bitboard Chess Engine — C implementation with uint64_t. Same logic as index.mjs. */

#include "bitboard_chess.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>

#define BIT(sq) (UINT64_C(1) << (sq))

static u64 knight_attacks[64];
static u64 king_attacks[64];
static u64 pawn_attacks[2][64];
static u64 zobrist_pieces[64][12];
static u64 zobrist_side;
static u64 zobrist_castle[4];
static u64 zobrist_ep[8];
static u64 file_masks[8];
static u64 rank_masks[8];

static int in_board(int f, int r) {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

/* Mulberry32 — same seed as JS for identical Zobrist keys */
static uint32_t mulberry32_state;
static uint32_t mulberry32_next(void) {
  uint32_t t = (mulberry32_state += 0x6d2b79f5U);
  t = (t ^ (t >> 15)) * (t | 1);
  t ^= t >> 7;
  t ^= t >> 12;
  return t;
}

static u64 random64(void) {
  uint32_t lo = mulberry32_next();
  uint32_t hi = mulberry32_next();
  return ((u64)hi << 32) | (u64)lo;
}

static void init_tables(void) {
  static int done = 0;
  if (done) return;
  done = 1;

  for (int sq = 0; sq < 64; sq++) {
    int f = sq % 8;
    int r = sq / 8;
    u64 bb = 0;
    static const int kd[8][2] = {{1,2},{2,1},{2,-1},{1,-2},{-1,-2},{-2,-1},{-2,1},{-1,2}};
    for (int i = 0; i < 8; i++) {
      int nf = f + kd[i][0], nr = r + kd[i][1];
      if (in_board(nf, nr)) bb |= BIT(nr * 8 + nf);
    }
    knight_attacks[sq] = bb;

    bb = 0;
    for (int df = -1; df <= 1; df++)
      for (int dr = -1; dr <= 1; dr++) {
        if (df == 0 && dr == 0) continue;
        int nf = f + df, nr = r + dr;
        if (in_board(nf, nr)) bb |= BIT(nr * 8 + nf);
      }
    king_attacks[sq] = bb;

    bb = 0;
    if (in_board(f - 1, r + 1)) bb |= BIT((r + 1) * 8 + (f - 1));
    if (in_board(f + 1, r + 1)) bb |= BIT((r + 1) * 8 + (f + 1));
    pawn_attacks[WHITE][sq] = bb;
    bb = 0;
    if (in_board(f - 1, r - 1)) bb |= BIT((r - 1) * 8 + (f - 1));
    if (in_board(f + 1, r - 1)) bb |= BIT((r - 1) * 8 + (f + 1));
    pawn_attacks[BLACK][sq] = bb;
  }

  for (int f = 0; f < 8; f++) {
    u64 m = 0;
    for (int r = 0; r < 8; r++) m |= BIT(r * 8 + f);
    file_masks[f] = m;
  }
  for (int r = 0; r < 8; r++)
    rank_masks[r] = (UINT64_C(0xff) << (r * 8));

  mulberry32_state = 0x5eedU;
  for (int sq = 0; sq < 64; sq++)
    for (int pt = 0; pt < 12; pt++)
      zobrist_pieces[sq][pt] = random64();
  zobrist_side = random64();
  for (int i = 0; i < 4; i++) zobrist_castle[i] = random64();
  for (int f = 0; f < 8; f++) zobrist_ep[f] = random64();
}

static int square_to_index(const char* sq) {
  int file = (unsigned char)sq[0] - 97;
  int rank = (unsigned char)sq[1] - '1';
  return rank * 8 + file;
}

static u64 get_rook_attacks(int sq, u64 occ) {
  int f = sq % 8, r = sq / 8;
  u64 bb = 0;
  for (int nf = f + 1; nf < 8; nf++) {
    int s = r * 8 + nf;
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  for (int nf = f - 1; nf >= 0; nf--) {
    int s = r * 8 + nf;
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  for (int nr = r + 1; nr < 8; nr++) {
    int s = nr * 8 + f;
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  for (int nr = r - 1; nr >= 0; nr--) {
    int s = nr * 8 + f;
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  return bb;
}

static u64 get_bishop_attacks(int sq, u64 occ) {
  int f = sq % 8, r = sq / 8;
  u64 bb = 0;
  for (int d = 1; d < 8; d++) {
    if (f + d >= 8 || r + d >= 8) break;
    int s = (r + d) * 8 + (f + d);
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  for (int d = 1; d < 8; d++) {
    if (f - d < 0 || r + d >= 8) break;
    int s = (r + d) * 8 + (f - d);
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  for (int d = 1; d < 8; d++) {
    if (f + d >= 8 || r - d < 0) break;
    int s = (r - d) * 8 + (f + d);
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  for (int d = 1; d < 8; d++) {
    if (f - d < 0 || r - d < 0) break;
    int s = (r - d) * 8 + (f - d);
    bb |= BIT(s);
    if (occ & BIT(s)) break;
  }
  return bb;
}

static u64 pawn_capture_sources(int to_sq, int color) {
  int f = to_sq % 8, r = to_sq / 8;
  u64 bb = 0;
  if (color == WHITE) {
    if (r >= 1 && f >= 1) bb |= BIT((r - 1) * 8 + (f - 1));
    if (r >= 1 && f < 7) bb |= BIT((r - 1) * 8 + (f + 1));
  } else {
    if (r < 7 && f >= 1) bb |= BIT((r + 1) * 8 + (f - 1));
    if (r < 7 && f < 7) bb |= BIT((r + 1) * 8 + (f + 1));
  }
  return bb;
}

static int filter_disamb(u64 candidates, int disamb_file, int disamb_rank) {
  u64 bb = candidates;
  if (disamb_file >= 0) bb &= file_masks[disamb_file];
  if (disamb_rank >= 0) bb &= rank_masks[disamb_rank];
  int found = -1;
  for (int sq = 0; sq < 64; sq++) {
    if (bb & BIT(sq)) {
      if (found >= 0) return -1;
      found = sq;
    }
  }
  return found;
}

/* Parse SAN; returns true on success. */
static bool parse_san(const char* san, ParseSANResult* out) {
  while (*san == ' ') san++;
  if (strncmp(san, "O-O-O", 5) == 0) {
    out->piece = 0;
    out->targetIndex = -1;
    out->disambFile = -1;
    out->disambRank = -1;
    out->promotion = 0;
    out->castle = 'Q';
    return true;
  }
  if (strncmp(san, "O-O", 3) == 0) {
    out->piece = 0;
    out->targetIndex = -1;
    out->disambFile = -1;
    out->disambRank = -1;
    out->promotion = 0;
    out->castle = 'K';
    return true;
  }
  size_t len = strlen(san);
  if (len < 2) return false;
  const char* p;
  if (len >= 4 && san[len - 2] == '=' && (san[len - 1] == 'N' || san[len - 1] == 'B' || san[len - 1] == 'R' || san[len - 1] == 'Q')) {
    out->promotion = (int)(unsigned char)tolower((unsigned char)san[len - 1]);
    p = san + len - 4;  /* square is two chars before "=P" */
  } else {
    out->promotion = 0;
    p = san + len - 2;
  }
  if (p[0] < 'a' || p[0] > 'h' || p[1] < '1' || p[1] > '8') return false;
  out->targetIndex = square_to_index(p);
  out->castle = 0;
  out->disambFile = -1;
  out->disambRank = -1;
  out->piece = 0;
  size_t rest_len = len - 2;
  if (out->promotion) rest_len -= 2;
  while (rest_len > 0 && san[rest_len - 1] == 'x') rest_len--;
  if (rest_len > 0) {
    char c = san[0];
    if (c == 'N' || c == 'B' || c == 'R' || c == 'Q' || c == 'K') {
      out->piece = (int)(unsigned char)c;
      if (rest_len >= 2 && san[1] >= 'a' && san[1] <= 'h') out->disambFile = (unsigned char)san[1] - 97;
      if (rest_len >= 1 && san[rest_len - 1] >= '1' && san[rest_len - 1] <= '8') out->disambRank = (unsigned char)san[rest_len - 1] - '1';
    } else {
      if (rest_len >= 1 && san[0] >= 'a' && san[0] <= 'h') out->disambFile = (unsigned char)san[0] - 97;
      if (rest_len >= 1 && san[rest_len - 1] >= '1' && san[rest_len - 1] <= '8') out->disambRank = (unsigned char)san[rest_len - 1] - '1';
    }
    if (rest_len == 2 && san[0] >= 'a' && san[0] <= 'h' && san[1] >= '1' && san[1] <= '8') {
      out->disambFile = (unsigned char)san[0] - 97;
      out->disambRank = (unsigned char)san[1] - '1';
    }
  }
  return true;
}

static u64 occupancy(const Board* b, int color) {
  return b->pawns[color] | b->knights[color] | b->bishops[color] |
         b->rooks[color] | b->queens[color] | b->kings[color];
}

static u64 all_occ(const Board* b) {
  return occupancy(b, WHITE) | occupancy(b, BLACK);
}

static bool resolve_san(const Board* b, const char* san, Move* move) {
  ParseSANResult p;
  if (!parse_san(san, &p)) return false;
  int side = b->sideToMove;
  u64 occ = all_occ(b);
  int to_sq = p.targetIndex;

  if (p.castle) {
    move->from = side == WHITE ? 4 : 60;
    move->to = (p.castle == 'K') ? (side == WHITE ? 6 : 62) : (side == WHITE ? 2 : 58);
    move->castle = p.castle;
    move->promotion = 0;
    move->enpassant = false;
    return true;
  }

  u64 candidates = 0;
  if (p.piece == 'K') {
    candidates = king_attacks[to_sq] & b->kings[side];
  } else if (p.piece == 'N') {
    candidates = knight_attacks[to_sq] & b->knights[side];
  } else if (p.piece == 'R') {
    candidates = get_rook_attacks(to_sq, occ) & b->rooks[side];
  } else if (p.piece == 'B') {
    candidates = get_bishop_attacks(to_sq, occ) & b->bishops[side];
  } else if (p.piece == 'Q') {
    candidates = (get_rook_attacks(to_sq, occ) | get_bishop_attacks(to_sq, occ)) & b->queens[side];
  } else {
    if (p.disambFile >= 0) {
      candidates = pawn_capture_sources(to_sq, side) & b->pawns[side];
      candidates &= file_masks[p.disambFile];
    } else {
      int one_back = side == WHITE ? to_sq - 8 : to_sq + 8;
      int two_back = side == WHITE ? to_sq - 16 : to_sq + 16;
      int to_rank = to_sq / 8;
      if (b->pawns[side] & BIT(one_back))
        candidates = BIT(one_back);
      else if ((side == WHITE ? to_rank == 3 : to_rank == 4) && (b->pawns[side] & BIT(two_back)) && !(occ & BIT(one_back)))
        candidates = BIT(two_back);
    }
  }

  int from_sq = filter_disamb(candidates, p.disambFile, p.disambRank);
  if (from_sq < 0 && candidates) {
    int count = 0;
    for (int sq = 0; sq < 64; sq++) {
      if (candidates & BIT(sq)) { count++; from_sq = sq; if (count > 1) break; }
    }
    if (count != 1) from_sq = -1;
  }
  if (from_sq < 0) return false;

  move->from = from_sq;
  move->to = to_sq;
  move->promotion = p.promotion;
  move->castle = 0;
  move->enpassant = (p.piece == 0 && p.disambFile >= 0 && !(occ & BIT(to_sq)));
  return true;
}

static void make_move(Board* b, const Move* move) {
  int side = b->sideToMove;
  int enemy = side ^ 1;
  u64 from_bb = BIT(move->from);
  u64 to_bb = BIT(move->to);

  if (move->castle) {
    b->kings[side] ^= from_bb | to_bb;
    if (move->castle == 'K') {
      if (side == WHITE) b->rooks[WHITE] ^= BIT(7) | BIT(5);
      else b->rooks[BLACK] ^= BIT(63) | BIT(61);
    } else {
      if (side == WHITE) b->rooks[WHITE] ^= BIT(0) | BIT(3);
      else b->rooks[BLACK] ^= BIT(56) | BIT(59);
    }
    char tmp[5]; int j = 0;
    for (const char* c = b->castling; *c; c++) {
      if (side == WHITE && (*c == 'K' || *c == 'Q')) continue;
      if (side == BLACK && (*c == 'k' || *c == 'q')) continue;
      tmp[j++] = *c;
    }
    tmp[j] = '\0';
    memcpy(b->castling, tmp, (size_t)(j + 1));
    b->sideToMove = enemy;
    if (b->sideToMove == WHITE) b->fullmove++;
    return;
  }

  if (move->enpassant) {
    int cap_sq = side == WHITE ? move->to - 8 : move->to + 8;
    b->pawns[enemy] &= ~BIT(cap_sq);
  }

  b->pawns[enemy] &= ~to_bb;
  b->knights[enemy] &= ~to_bb;
  b->bishops[enemy] &= ~to_bb;
  b->rooks[enemy] &= ~to_bb;
  b->queens[enemy] &= ~to_bb;
  b->kings[enemy] &= ~to_bb;

  int moved_pawn = 0;
  int moved_rook = (b->rooks[side] & from_bb) ? 1 : 0;

  if (b->pawns[side] & from_bb) {
    b->pawns[side] ^= from_bb;
    b->pawns[side] |= to_bb;
    moved_pawn = 1;
  } else if (b->knights[side] & from_bb) {
    b->knights[side] ^= from_bb;
    b->knights[side] |= to_bb;
  } else if (b->bishops[side] & from_bb) {
    b->bishops[side] ^= from_bb;
    b->bishops[side] |= to_bb;
  } else if (b->rooks[side] & from_bb) {
    b->rooks[side] ^= from_bb;
    b->rooks[side] |= to_bb;
  } else if (b->queens[side] & from_bb) {
    b->queens[side] ^= from_bb;
    b->queens[side] |= to_bb;
  } else {
    b->kings[side] ^= from_bb;
    b->kings[side] |= to_bb;
  }

  if (move->promotion) {
    b->pawns[side] &= ~to_bb;
    if (move->promotion == 'q') b->queens[side] |= to_bb;
    else if (move->promotion == 'r') b->rooks[side] |= to_bb;
    else if (move->promotion == 'b') b->bishops[side] |= to_bb;
    else b->knights[side] |= to_bb;
  }

  if (moved_pawn && (move->to - move->from == 16 || move->from - move->to == 16))
    b->enPassant = (move->from + move->to) / 2;
  else
    b->enPassant = -1;

  if (b->kings[side] & from_bb) {
    char tmp[5]; int j = 0;
    for (const char* c = b->castling; *c; c++) {
      if (side == WHITE && (*c == 'K' || *c == 'Q')) continue;
      if (side == BLACK && (*c == 'k' || *c == 'q')) continue;
      tmp[j++] = *c;
    }
    tmp[j] = '\0';
    memcpy(b->castling, tmp, (size_t)(j + 1));
  }
  if (moved_rook) {
    char tmp[5]; int j = 0;
    for (const char* c = b->castling; *c; c++) {
      if (move->from == 0 && *c == 'Q') continue;
      if (move->from == 7 && *c == 'K') continue;
      if (move->from == 56 && *c == 'q') continue;
      if (move->from == 63 && *c == 'k') continue;
      tmp[j++] = *c;
    }
    tmp[j] = '\0';
    memcpy(b->castling, tmp, (size_t)(j + 1));
  }

  b->sideToMove = enemy;
  if (b->sideToMove == WHITE) b->fullmove++;
}

/* Zobrist key (same order as JS). */
static void get_zobrist_key(const Board* b, uint64_t* out_lo, uint64_t* out_hi) {
  u64 key = 0;
  static const int piece_pts[6][2] = {{0,6},{1,7},{2,8},{3,9},{4,10},{5,11}};
  u64* arrs[] = {(u64*)b->pawns,(u64*)b->knights,(u64*)b->bishops,(u64*)b->rooks,(u64*)b->queens,(u64*)b->kings};
  for (int sq = 0; sq < 64; sq++) {
    for (int i = 0; i < 6; i++) {
      if (arrs[i][WHITE] & BIT(sq)) { key ^= zobrist_pieces[sq][piece_pts[i][0]]; break; }
      if (arrs[i][BLACK] & BIT(sq)) { key ^= zobrist_pieces[sq][piece_pts[i][1]]; break; }
    }
  }
  if (b->sideToMove == BLACK) key ^= zobrist_side;
  const int castle_idx[] = {0,1,2,3};
  for (const char* c = b->castling; *c; c++) {
    if (*c == 'K') key ^= zobrist_castle[0];
    else if (*c == 'Q') key ^= zobrist_castle[1];
    else if (*c == 'k') key ^= zobrist_castle[2];
    else if (*c == 'q') key ^= zobrist_castle[3];
  }
  if (b->enPassant >= 0) key ^= zobrist_ep[b->enPassant % 8];
  *out_lo = (uint64_t)(key & UINT64_C(0xffffffff));
  *out_hi = (uint64_t)(key >> 32);
}

Board* board_create(void) {
  init_tables();
  Board* b = (Board*)calloc(1, sizeof(Board));
  if (!b) return NULL;
  board_reset(b);
  return b;
}

void board_destroy(Board* b) {
  free(b);
}

void board_reset(Board* b) {
  memset(b, 0, sizeof(Board));
  b->pawns[WHITE] = UINT64_C(0x000000000000FF00);
  b->pawns[BLACK] = UINT64_C(0x00FF000000000000);
  b->rooks[WHITE] = UINT64_C(0x0000000000000081);
  b->rooks[BLACK] = UINT64_C(0x8100000000000000);
  b->knights[WHITE] = UINT64_C(0x0000000000000042);
  b->knights[BLACK] = UINT64_C(0x4200000000000000);
  b->bishops[WHITE] = UINT64_C(0x0000000000000024);
  b->bishops[BLACK] = UINT64_C(0x2400000000000000);
  b->queens[WHITE] = UINT64_C(0x0000000000000008);
  b->queens[BLACK] = UINT64_C(0x0800000000000000);
  b->kings[WHITE] = UINT64_C(0x0000000000000010);
  b->kings[BLACK] = UINT64_C(0x1000000000000000);
  b->sideToMove = WHITE;
  strcpy(b->castling, "KQkq");
  b->enPassant = -1;
  b->halfmove = 0;
  b->fullmove = 1;
}

void board_load_fen(Board* b, const char* fen) {
  if (!fen) return;
  memset(b->pawns, 0, sizeof(b->pawns));
  memset(b->knights, 0, sizeof(b->knights));
  memset(b->bishops, 0, sizeof(b->bishops));
  memset(b->rooks, 0, sizeof(b->rooks));
  memset(b->queens, 0, sizeof(b->queens));
  memset(b->kings, 0, sizeof(b->kings));
  b->sideToMove = WHITE;
  b->castling[0] = '\0';
  b->enPassant = -1;
  b->halfmove = 0;
  b->fullmove = 1;
  const char* placement = fen;
  while (*placement == ' ') placement++;
  int r = 7;
  while (r >= 0 && *placement) {
    int f = 0;
    while (f < 8 && *placement && *placement != '/') {
      if (*placement >= '1' && *placement <= '8') {
        f += *placement - '0';
        placement++;
        continue;
      }
      int sq = r * 8 + f;
      u64 bit_sq = BIT(sq);
      char ch = *placement;
      if (ch == 'P') b->pawns[WHITE] |= bit_sq;
      else if (ch == 'N') b->knights[WHITE] |= bit_sq;
      else if (ch == 'B') b->bishops[WHITE] |= bit_sq;
      else if (ch == 'R') b->rooks[WHITE] |= bit_sq;
      else if (ch == 'Q') b->queens[WHITE] |= bit_sq;
      else if (ch == 'K') b->kings[WHITE] |= bit_sq;
      else if (ch == 'p') b->pawns[BLACK] |= bit_sq;
      else if (ch == 'n') b->knights[BLACK] |= bit_sq;
      else if (ch == 'b') b->bishops[BLACK] |= bit_sq;
      else if (ch == 'r') b->rooks[BLACK] |= bit_sq;
      else if (ch == 'q') b->queens[BLACK] |= bit_sq;
      else if (ch == 'k') b->kings[BLACK] |= bit_sq;
      placement++;
      f++;
    }
    if (*placement == '/') placement++;
    r--;
  }
  while (*placement == ' ') placement++;
  if (*placement == 'b') b->sideToMove = BLACK;
  placement++;
  while (*placement == ' ') placement++;
  int cidx = 0;
  while (*placement && *placement != ' ' && cidx < 4) {
    if (*placement != '-') b->castling[cidx++] = *placement;
    placement++;
  }
  b->castling[cidx] = '\0';
  while (*placement == ' ') placement++;
  if (*placement && *placement != '-') {
    int file = (unsigned char)*placement - 97;
    placement++;
    int rank = (unsigned char)*placement - '1';
    if (file >= 0 && file < 8 && rank >= 0 && rank < 8) b->enPassant = rank * 8 + file;
    placement++;
  }
  while (*placement == ' ' || (*placement >= '0' && *placement <= '9')) placement++;
  if (*placement >= '0' && *placement <= '9') b->halfmove = (int)strtol(placement, (char**)&placement, 10);
  while (*placement == ' ') placement++;
  if (*placement >= '0' && *placement <= '9') b->fullmove = (int)strtol(placement, NULL, 10);
}

bool board_make_move_san(Board* b, const char* san) {
  Move move;
  if (!resolve_san(b, san, &move)) return false;
  make_move(b, &move);
  return true;
}

bool board_resolve_san(const Board* b, const char* san, Move* out_move) {
  return resolve_san(b, san, out_move);
}

void board_make_move(Board* b, const Move* move) {
  make_move(b, move);
}

uint64_t board_get_zobrist_key_lo(const Board* b) {
  uint64_t lo, hi;
  get_zobrist_key(b, &lo, &hi);
  return lo;
}

uint64_t board_get_zobrist_key_hi(const Board* b) {
  uint64_t lo, hi;
  get_zobrist_key(b, &lo, &hi);
  return hi;
}

int board_to_fen(const Board* b, char* out, int maxlen) {
  int n = 0;
  for (int r = 7; r >= 0; r--) {
    int empty = 0;
    for (int f = 0; f < 8; f++) {
      int sq = r * 8 + f;
      u64 bb = BIT(sq);
      char piece = 0;
      if (b->pawns[WHITE] & bb) piece = 'P';
      else if (b->knights[WHITE] & bb) piece = 'N';
      else if (b->bishops[WHITE] & bb) piece = 'B';
      else if (b->rooks[WHITE] & bb) piece = 'R';
      else if (b->queens[WHITE] & bb) piece = 'Q';
      else if (b->kings[WHITE] & bb) piece = 'K';
      else if (b->pawns[BLACK] & bb) piece = 'p';
      else if (b->knights[BLACK] & bb) piece = 'n';
      else if (b->bishops[BLACK] & bb) piece = 'b';
      else if (b->rooks[BLACK] & bb) piece = 'r';
      else if (b->queens[BLACK] & bb) piece = 'q';
      else if (b->kings[BLACK] & bb) piece = 'k';
      if (!piece) empty++;
      else {
        if (empty) { n += snprintf(out + n, (size_t)(maxlen - n), "%d", empty); empty = 0; }
        if (n < maxlen) out[n] = piece;
        n++;
      }
    }
    if (empty) n += snprintf(out + n, (size_t)(maxlen - n), "%d", empty);
    if (r > 0) { if (n < maxlen) out[n] = '/'; n++; }
  }
  n += snprintf(out + n, (size_t)(maxlen - n), " %s %s ", b->sideToMove == WHITE ? "w" : "b", b->castling[0] ? b->castling : "-");
  if (b->enPassant >= 0)
    n += snprintf(out + n, (size_t)(maxlen - n), "%c%d", 'a' + (b->enPassant % 8), b->enPassant / 8 + 1);
  else
    n += snprintf(out + n, (size_t)(maxlen - n), "-");
  n += snprintf(out + n, (size_t)(maxlen - n), " %d %d", b->halfmove, b->fullmove);
  if (n < maxlen) out[n] = '\0';
  return n;
}
