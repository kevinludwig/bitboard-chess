# C native addon (uint64_t)

The **C implementation** lives in `src/` and is exposed to Node.js via an N-API addon. It uses native `uint64_t` bitboards for maximum performance.

## Build

**Prerequisites:**

- **Node.js** ≥ 14
- **node-gyp** (installed with `npm install`)
- **Python** 3.6+ (required by node-gyp)
- **C++ build tools:**
  - **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with “Desktop development with C++”
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `build-essential` (or equivalent)

The build uses only relative paths and standard node-gyp behavior, so it works on any machine with the above tools. On Windows, **VS 2022** is best supported by node-gyp; newer versions (e.g. VS 18) may require a matching platform toolset.

Then:

```bash
npm run build
```

This produces `build/Release/bitboard_chess_native.node` (or `build/Debug/` for debug builds).

If you don’t run `npm run build`, the rest of the project (BigInt JS engine) still works; the benchmark will simply skip the C engine.

## Usage

```js
const { BitboardChessNative } = require('./index-native.cjs');
const board = new BitboardChessNative();
board.makeMoveSAN('e4');
console.log(board.getZobristKey());  // BigInt
console.log(board.toFEN());
board.destroy();  // free native handle when done
```

## Benchmark

With the addon built:

```bash
node benchmark-real-workload.mjs
```

This compares BigInt (JS) and C native. Without the addon, only the JS engine is benchmarked.
