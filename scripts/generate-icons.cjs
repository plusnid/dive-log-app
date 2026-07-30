const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
      }
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// Simple placeholder icon: teal background + white bubble, safe within a maskable circle.
function makePng(size) {
  const bg = [0x0b, 0x5b, 0x7a]
  const fg = [0xff, 0xff, 0xff]
  const cx = size / 2
  const cy = size / 2
  const bubbleR = size * 0.28

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const rowSize = size * 3 + 1
  const raw = Buffer.alloc(rowSize * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize
    raw[rowStart] = 0
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const color = dist < bubbleR ? fg : bg
      const px = rowStart + 1 + x * 3
      raw[px] = color[0]
      raw[px + 1] = color[1]
      raw[px + 2] = color[2]
    }
  }
  const idatData = zlib.deflateSync(raw)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))])
}

const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makePng(192))
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makePng(512))
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), makePng(512))
console.log('Icons written to', outDir)
