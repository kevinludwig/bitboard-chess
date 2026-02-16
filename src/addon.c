/* Node.js N-API bindings for bitboard_chess */

#include <node_api.h>
#include <stdlib.h>
#include <string.h>
#include "bitboard_chess.h"

#define FEN_MAX 128

static napi_value Create(napi_env env, napi_callback_info info) {
  Board* b = board_create();
  if (!b) {
    napi_throw_error(env, NULL, "board_create failed");
    return NULL;
  }
  napi_value external;
  napi_status status = napi_create_external(env, b, NULL, NULL, &external);
  if (status != napi_ok) {
    board_destroy(b);
    return NULL;
  }
  return external;
}

static napi_value Destroy(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 1) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  board_destroy(b);
  return NULL;
}

static napi_value MakeMoveSAN(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 2) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  size_t len;
  napi_get_value_string_utf8(env, argv[1], NULL, 0, &len);
  char* san = (char*)malloc(len + 1);
  if (!san) return NULL;
  napi_get_value_string_utf8(env, argv[1], san, len + 1, &len);
  bool ok = board_make_move_san(b, san);
  free(san);
  napi_value result;
  napi_get_boolean(env, ok, &result);
  return result;
}

static napi_value GetZobristKey(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 1) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  uint64_t lo = board_get_zobrist_key_lo(b);
  uint64_t hi = board_get_zobrist_key_hi(b);
  uint64_t key = (hi << 32) | lo;
  uint64_t words[1] = { key };
  napi_value result;
  napi_create_bigint_words(env, 0, 1, words, &result);
  return result;
}

static napi_value ToFEN(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 1) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  char buf[FEN_MAX];
  int n = board_to_fen(b, buf, FEN_MAX);
  napi_value result;
  napi_create_string_utf8(env, buf, (size_t)n, &result);
  return result;
}

static napi_value LoadFromFEN(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 2) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  size_t len;
  napi_get_value_string_utf8(env, argv[1], NULL, 0, &len);
  char* fen = (char*)malloc(len + 1);
  if (!fen) return NULL;
  napi_get_value_string_utf8(env, argv[1], fen, len + 1, &len);
  board_load_fen(b, fen);
  free(fen);
  return NULL;
}

static napi_value Reset(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 1) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  board_reset(b);
  return NULL;
}

static napi_value ResolveSAN(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 2) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  size_t len;
  napi_get_value_string_utf8(env, argv[1], NULL, 0, &len);
  char* san = (char*)malloc(len + 1);
  if (!san) return NULL;
  napi_get_value_string_utf8(env, argv[1], san, len + 1, &len);
  Move move;
  bool ok = board_resolve_san(b, san, &move);
  free(san);
  if (!ok) {
    napi_value null_val;
    napi_get_null(env, &null_val);
    return null_val;
  }
  napi_value obj;
  napi_create_object(env, &obj);
  napi_value v_from, v_to;
  napi_create_int32(env, move.from, &v_from);
  napi_create_int32(env, move.to, &v_to);
  napi_set_named_property(env, obj, "from", v_from);
  napi_set_named_property(env, obj, "to", v_to);
  if (move.promotion) {
    napi_value v_promo;
    char s[2] = { (char)move.promotion, '\0' };
    napi_create_string_utf8(env, s, 1, &v_promo);
    napi_set_named_property(env, obj, "promotion", v_promo);
  }
  if (move.castle) {
    napi_value v_castle;
    char s[2] = { (char)move.castle, '\0' };
    napi_create_string_utf8(env, s, 1, &v_castle);
    napi_set_named_property(env, obj, "castle", v_castle);
  }
  if (move.enpassant) {
    napi_value v_true;
    napi_get_boolean(env, true, &v_true);
    napi_set_named_property(env, obj, "enpassant", v_true);
  }
  return obj;
}

static napi_value MakeMove(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 2) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);
  napi_value move_obj = argv[1];
  napi_value v_from, v_to;
  napi_get_named_property(env, move_obj, "from", &v_from);
  napi_get_named_property(env, move_obj, "to", &v_to);
  int32_t from, to;
  napi_get_value_int32(env, v_from, &from);
  napi_get_value_int32(env, v_to, &to);
  Move move;
  move.from = from;
  move.to = to;
  move.promotion = 0;
  move.castle = 0;
  move.enpassant = false;
  napi_value v_promo;
  napi_valuetype promo_type;
  if (napi_get_named_property(env, move_obj, "promotion", &v_promo) == napi_ok &&
      napi_typeof(env, v_promo, &promo_type) == napi_ok && promo_type == napi_string) {
    size_t len;
    napi_get_value_string_utf8(env, v_promo, NULL, 0, &len);
    if (len >= 1) {
      char s[4];
      napi_get_value_string_utf8(env, v_promo, s, sizeof(s), &len);
      move.promotion = (int)(unsigned char)s[0];
    }
  }
  napi_value v_castle;
  napi_valuetype castle_type;
  if (napi_get_named_property(env, move_obj, "castle", &v_castle) == napi_ok &&
      napi_typeof(env, v_castle, &castle_type) == napi_ok && castle_type == napi_string) {
    size_t len;
    napi_get_value_string_utf8(env, v_castle, NULL, 0, &len);
    if (len >= 1) {
      char s[4];
      napi_get_value_string_utf8(env, v_castle, s, sizeof(s), &len);
      move.castle = (int)(unsigned char)s[0];
    }
  }
  napi_value v_ep;
  if (napi_get_named_property(env, move_obj, "enpassant", &v_ep) == napi_ok) {
    bool ep;
    napi_get_value_bool(env, v_ep, &ep);
    move.enpassant = ep;
  }
  board_make_move(b, &move);
  return NULL;
}

static napi_value u64_to_bigint(napi_env env, uint64_t val) {
  uint64_t words[1] = { val };
  napi_value result;
  if (napi_create_bigint_words(env, 0, 1, words, &result) != napi_ok) return NULL;
  return result;
}

static napi_value GetPosition(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 1) return NULL;
  Board* b;
  napi_get_value_external(env, argv[0], (void**)&b);

  uint64_t lo = board_get_zobrist_key_lo(b);
  uint64_t hi = board_get_zobrist_key_hi(b);
  uint64_t zobrist = (hi << 32) | lo;

  u64 wOcc = b->pawns[0] | b->knights[0] | b->bishops[0] | b->rooks[0] | b->queens[0] | b->kings[0];
  u64 bOcc = b->pawns[1] | b->knights[1] | b->bishops[1] | b->rooks[1] | b->queens[1] | b->kings[1];

  napi_value obj;
  napi_create_object(env, &obj);

  napi_value v_side;
  napi_create_string_utf8(env, b->sideToMove == WHITE ? "w" : "b", 1, &v_side);
  napi_set_named_property(env, obj, "sideToMove", v_side);

  napi_set_named_property(env, obj, "zobrist", u64_to_bigint(env, zobrist));
  napi_set_named_property(env, obj, "whitePawns", u64_to_bigint(env, b->pawns[0]));
  napi_set_named_property(env, obj, "blackPawns", u64_to_bigint(env, b->pawns[1]));
  napi_set_named_property(env, obj, "whiteKnights", u64_to_bigint(env, b->knights[0]));
  napi_set_named_property(env, obj, "whiteBishops", u64_to_bigint(env, b->bishops[0]));
  napi_set_named_property(env, obj, "whiteRooks", u64_to_bigint(env, b->rooks[0]));
  napi_set_named_property(env, obj, "whiteQueens", u64_to_bigint(env, b->queens[0]));
  napi_set_named_property(env, obj, "whiteKing", u64_to_bigint(env, b->kings[0]));
  napi_set_named_property(env, obj, "blackKnights", u64_to_bigint(env, b->knights[1]));
  napi_set_named_property(env, obj, "blackBishops", u64_to_bigint(env, b->bishops[1]));
  napi_set_named_property(env, obj, "blackRooks", u64_to_bigint(env, b->rooks[1]));
  napi_set_named_property(env, obj, "blackQueens", u64_to_bigint(env, b->queens[1]));
  napi_set_named_property(env, obj, "blackKing", u64_to_bigint(env, b->kings[1]));
  napi_set_named_property(env, obj, "whiteOccupancy", u64_to_bigint(env, wOcc));
  napi_set_named_property(env, obj, "blackOccupancy", u64_to_bigint(env, bOcc));
  napi_set_named_property(env, obj, "fullOccupancy", u64_to_bigint(env, wOcc | bOcc));

  return obj;
}

#define DECLARE_NAPI_METHOD(name, func) { name, 0, func, 0, 0, 0, napi_default, 0 }

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
    DECLARE_NAPI_METHOD("create", Create),
    DECLARE_NAPI_METHOD("destroy", Destroy),
    DECLARE_NAPI_METHOD("makeMoveSAN", MakeMoveSAN),
    DECLARE_NAPI_METHOD("makeMove", MakeMove),
    DECLARE_NAPI_METHOD("resolveSAN", ResolveSAN),
    DECLARE_NAPI_METHOD("getZobristKey", GetZobristKey),
    DECLARE_NAPI_METHOD("getPosition", GetPosition),
    DECLARE_NAPI_METHOD("toFEN", ToFEN),
    DECLARE_NAPI_METHOD("loadFromFEN", LoadFromFEN),
    DECLARE_NAPI_METHOD("reset", Reset),
  };
  napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
