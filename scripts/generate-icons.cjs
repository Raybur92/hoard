'use strict';
// Generates apps/web/public/icons/icon-192.png and icon-512.png
// Uses only Node.js built-ins (zlib, fs, path) — no extra dependencies.
// Run: node scripts/generate-icons.cjs

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// ── Design tokens ──────────────────────────────────────────────────────
const VOID  = [0x07, 0x09, 0x0a]; // --void  #07090a
const PAPER = [0xec, 0xe8, 0xde]; // --paper #ece8de

// ── "H" pixel test for a given size ───────────────────────────────────
function isH(x, y, size) {
  const pad  = Math.round(size * 0.198);
  const barW = Math.round(size * 0.125);
  const midY = Math.round(size * 0.453);
  const midH = Math.round(size * 0.094);

  const inVert  = y >= pad && y < size - pad;
  const inHoriz = x >= pad && x < size - pad;
  const inLeft  = x >= pad && x < pad + barW && inVert;
  const inRight = x >= size - pad - barW && x < size - pad && inVert;
  const inCross = y >= midY && y < midY + midH && inHoriz;
  return inLeft || inRight || inCross;
}

// ── Build a valid RGB PNG ───────────────────────────────────────────────
function makeIcon(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0x00]; // filter byte: None
    for (let x = 0; x < size; x++) {
      row.push(...(isH(x, y, size) ? PAPER : VOID));
    }
    rows.push(Buffer.from(row));
  }

  const raw        = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'apps', 'web', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), makeIcon(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), makeIcon(512));
console.log('✓ icons generated at apps/web/public/icons/');
