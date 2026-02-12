#ifndef BITBOARD_CHESS_H
#define BITBOARD_CHESS_H

#include <stdint.h>
#include <stdbool.h>

#define WHITE 0
#define BLACK 1

typedef uint64_t u64;

typedef struct {
  u64 pawns[2];
  u64 knights[2];
  u64 bishops[2];
  u64 rooks[2];
  u64 queens[2];
  u64 kings[2];
  int sideToMove;
  char castling[5];
  int enPassant;
  int halfmove;
  int fullmove;
} Board;

typedef struct {
  int piece;       /* 'N'=78, 'B'=66, 'R'=82, 'Q'=81, 'K'=75, 0=pawn */
  int targetIndex;
  int disambFile;  /* 0-7 or -1 */
  int disambRank;  /* 0-7 or -1 */
  int promotion;   /* 'n','b','r','q' or 0 */
  int castle;      /* 'K' or 'Q' or 0 */
} ParseSANResult;

typedef struct {
  int from;
  int to;
  int promotion; /* 'n','b','r','q' or 0 */
  int castle;    /* 'K' or 'Q' or 0 */
  bool enpassant;
} Move;

Board* board_create(void);
void board_destroy(Board* b);
void board_reset(Board* b);
void board_load_fen(Board* b, const char* fen);

bool board_make_move_san(Board* b, const char* san);
bool board_resolve_san(const Board* b, const char* san, Move* out_move);
void board_make_move(Board* b, const Move* move);
uint64_t board_get_zobrist_key_lo(const Board* b);
uint64_t board_get_zobrist_key_hi(const Board* b);

/* toFEN writes into out, max len 128. Returns length written (excluding null). */
int board_to_fen(const Board* b, char* out, int maxlen);

#endif
