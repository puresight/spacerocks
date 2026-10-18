// Generates PWA icons as PNGs with zero dependencies.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x / size, y / size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [5, 7, 12, 255];
const SHIP = [125, 249, 255, 255];
const AST = [154, 167, 184, 255];

// point-in-triangle via sign of cross products
function inTri(px, py, a, b, c) {
  const s = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const d1 = s(px, py, a[0], a[1], b[0], b[1]);
  const d2 = s(px, py, b[0], b[1], c[0], c[1]);
  const d3 = s(px, py, c[0], c[1], a[0], a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function iconPixel(scale) {
  // scale 1 = full-bleed, <1 shrinks art for maskable safe zone
  return (u, v) => {
    const cx = (u - 0.5) / scale + 0.5;
    const cy = (v - 0.5) / scale + 0.5;
    // ship: classic arrow, nose up
    const tri = [
      [0.5, 0.16],
      [0.3, 0.8],
      [0.44, 0.66],
      [0.5, 0.74],
      [0.56, 0.66],
      [0.7, 0.8],
    ];
    const notch = [[0.5, 0.74], [0.56, 0.66], [0.44, 0.66]];
    const body = inTri(cx, cy, tri[0], tri[1], tri[2]) || inTri(cx, cy, tri[0], tri[3], tri[4]);
    const inNotch = inTri(cx, cy, notch[0], notch[1], notch[2]);
    if (body && !inNotch) return SHIP;
    // asteroid ring upper-right
    const dx = cx - 0.78;
    const dy = cy - 0.2;
    const d = Math.hypot(dx, dy);
    if (d > 0.09 && d < 0.115) return AST;
    return BG;
  };
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', encodePng(192, iconPixel(0.9)));
writeFileSync('public/icons/icon-512.png', encodePng(512, iconPixel(0.9)));
writeFileSync('public/icons/maskable-512.png', encodePng(512, iconPixel(0.72)));
writeFileSync('public/icons/apple-touch-icon.png', encodePng(180, iconPixel(0.9)));
console.log('icons written');
