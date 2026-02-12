{
  "targets": [
    {
      "target_name": "bitboard_chess_native",
      "sources": ["src/bitboard_chess.c", "src/addon.c"],
      "include_dirs": ["src"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='win'", { "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1 } } }]
      ],
      "defines": ["NAPI_VERSION=8"],
      "xcode_settings": { "GCC_ENABLE_CPP_EXCEPTIONS": "YES" }
    }
  ]
}
