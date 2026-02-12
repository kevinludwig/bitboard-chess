// Real workload: many makeMoveSAN + getZobristKey calls.
// Run: node benchmark-real-workload.mjs
// Optional: npm run build then run again to include C native engine.

import { createRequire } from 'module';
import BitboardChess from './index.mjs';

const require = createRequire(import.meta.url);
let BitboardChessNative = null;
try {
  BitboardChessNative = require('./index-native.cjs').BitboardChessNative;
} catch (_) {
  // Native addon not built
}

// Long sequence of SAN moves (~50 moves) — opening + midgame
const SAN_MOVES = [
  'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6',
  'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7', 'Nbd2', 'Bb7', 'Bc2', 'Re8', 'Nf1', 'Bf8', 'Ng3', 'g6',
  'a4', 'c5', 'd5', 'c4', 'Bb1', 'Nb6', 'Nf5', 'gxf5', 'exf5', 'Rf8', 'Rxe8', 'Qxe8', 'Qe2', 'Nbd7',
  'Ne3', 'Qe7', 'Nd5', 'Qd8', 'Bd2', 'a5', 'b3', 'cxb3', 'Bxb3', 'Nc5',
];

const ITERATIONS = 25_000;  // replay 25k games (each ~50 moves = 1.25M makeMoveSAN + 1.25M getZobristKey)

function run(name, Engine, options = {}) {
  const getKey = options.getKey ?? (b => b.getZobristKey());
  const start = performance.now();
  let keySum = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const board = new Engine();
    for (const san of SAN_MOVES) {
      board.makeMoveSAN(san);
      const k = getKey(board);
      if (typeof k === 'bigint') keySum += Number(k & 0xffffffffn) + Number(k >> 32n);
    }
    if (typeof board.destroy === 'function') board.destroy();
  }
  const ms = performance.now() - start;
  const moves = ITERATIONS * SAN_MOVES.length;
  const keys = moves;
  console.log(`${name}:`);
  console.log(`  ${(ms / 1000).toFixed(2)} s  |  ${(moves / (ms / 1000) / 1e6).toFixed(2)} M makeMoveSAN/s  |  ${(keys / (ms / 1000) / 1e6).toFixed(2)} M getZobristKey/s  (keySum=${keySum})`);
  return ms;
}

// Sanity: same SAN sequence → same FEN for BigInt and (if built) native
const b1 = new BitboardChess();
for (const san of SAN_MOVES) b1.makeMoveSAN(san);
const fen1 = b1.toFEN();
console.log('Sanity: BigInt FEN ok ✓\n');

console.log('Real workload: makeMoveSAN + getZobristKey per move');
console.log(`${SAN_MOVES.length} moves per game × ${ITERATIONS.toLocaleString()} games = ${(ITERATIONS * SAN_MOVES.length).toLocaleString()} move+key calls\n`);

const tBigInt = run('BigInt (index.mjs)', BitboardChess);

let tNative = null;
if (BitboardChessNative) {
  const bn = new BitboardChessNative();
  for (const san of SAN_MOVES) bn.makeMoveSAN(san);
  const fenNative = bn.toFEN();
  if (fen1 !== fenNative) throw new Error(`FEN mismatch: native\n${fenNative}`);
  bn.destroy();
  tNative = run('C native (index-native.cjs)', BitboardChessNative);
}

if (tNative != null) {
  const ratioNative = tNative / tBigInt;
  console.log(`\nRatio: C native vs BigInt = ${ratioNative < 1 ? (1/ratioNative).toFixed(2) + '× faster' : ratioNative.toFixed(2) + '× slower'}`);
} else {
  console.log('\n(Run npm run build to include C native engine in benchmark.)');
}
console.log('Done.');
