import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(size, paint) {
  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x + 0.5, y + 0.5, size);
      const index = y * rowSize + 1 + x * 4;
      raw[index] = r;
      raw[index + 1] = g;
      raw[index + 2] = b;
      raw[index + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(base, over, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return [
    Math.round(base[0] + (over[0] - base[0]) * t),
    Math.round(base[1] + (over[1] - base[1]) * t),
    Math.round(base[2] + (over[2] - base[2]) * t),
    255,
  ];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function paintIcon(x, y, size, doughScale) {
  const background = [142, 59, 27, 255];
  const dough = [246, 234, 214, 255];
  const crust = [206, 158, 104, 255];
  const light = [255, 250, 244, 255];
  const cx = size / 2;
  const cy = size * 0.52;
  const radius = size * doughScale;
  const distance = Math.hypot(x - cx, y - cy);

  let color = background;
  color = mix(color, dough, clamp01(radius - distance + 0.8));

  const ring = Math.abs(distance - radius * 0.72);
  const ringCoverage = clamp01(1 - ring / Math.max(1.2, size * 0.012));
  color = mix(color, crust, ringCoverage * clamp01(radius - distance));

  const highlight = Math.hypot(x - (cx - radius * 0.28), y - (cy - radius * 0.32));
  color = mix(color, light, clamp01(1 - highlight / (radius * 0.34)) * 0.55 * clamp01(radius - distance));

  return color;
}

fs.mkdirSync(root, { recursive: true });

const files = [
  ["icon-192.png", 192, 0.3],
  ["icon-512.png", 512, 0.3],
  ["icon-maskable-512.png", 512, 0.24],
  ["apple-touch-icon.png", 180, 0.3],
];

for (const [name, size, scale] of files) {
  fs.writeFileSync(path.join(root, name), encodePng(size, (x, y, canvas) => paintIcon(x, y, canvas, scale)));
}
