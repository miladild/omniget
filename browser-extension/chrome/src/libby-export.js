// Libby book saver. This file is only injected on libbyapp.com.
// The O'Reilly saver is a separate file and is not used here.
// Kept in a function so a second save does not collide with the page.

(() => {
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 54

const WINANSI = {
  "\u00a0": 160, "\u00a1": 161, "\u00a2": 162, "\u00a3": 163, "\u00a4": 164, "\u00a5": 165, "\u00a6": 166, "\u00a7": 167,
  "\u00a8": 168, "\u00a9": 169, "\u00aa": 170, "\u00ab": 171, "\u00ac": 172, "\u00ae": 174, "\u00af": 175, "\u00b0": 176,
  "\u00b1": 177, "\u00b4": 180, "\u00b5": 181, "\u00b6": 182, "\u00b7": 183, "\u00bb": 187, "\u00bf": 191, "\u00c0": 192,
  "\u00c1": 193, "\u00c2": 194, "\u00c3": 195, "\u00c4": 196, "\u00c5": 197, "\u00c6": 198, "\u00c7": 199, "\u00c8": 200,
  "\u00c9": 201, "\u00ca": 202, "\u00cb": 203, "\u00cc": 204, "\u00cd": 205, "\u00ce": 206, "\u00cf": 207, "\u00d1": 209,
  "\u00d2": 210, "\u00d3": 211, "\u00d4": 212, "\u00d5": 213, "\u00d6": 214, "\u00d8": 216, "\u00d9": 217, "\u00da": 218,
  "\u00db": 219, "\u00dc": 220, "\u00dd": 221, "\u00df": 223, "\u00e0": 224, "\u00e1": 225, "\u00e2": 226, "\u00e3": 227,
  "\u00e4": 228, "\u00e5": 229, "\u00e6": 230, "\u00e7": 231, "\u00e8": 232, "\u00e9": 233, "\u00ea": 234, "\u00eb": 235,
  "\u00ec": 236, "\u00ed": 237, "\u00ee": 238, "\u00ef": 239, "\u00f1": 241, "\u00f2": 242, "\u00f3": 243, "\u00f4": 244,
  "\u00f5": 245, "\u00f6": 246, "\u00f8": 248, "\u00f9": 249, "\u00fa": 250, "\u00fb": 251, "\u00fc": 252, "\u00fd": 253,
  "\u00ff": 255, "\u2013": 150, "\u2014": 151, "\u2018": 145, "\u2019": 146, "\u201c": 147, "\u201d": 148, "\u2022": 149,
  "\u2026": 133, "\u20ac": 128,
}

function isLibbyHost(hostname) {
  return /(^|\.)libbyapp\.com$/i.test(hostname || "")
}

function isLibbyReaderHost(hostname) {
  return /^dewey-[^.]+\.read\.libbyapp\.com$/i.test(hostname || "")
}

function isLibbyAudioHost(hostname) {
  return /^dewey-[^.]+\.listen\.libbyapp\.com$/i.test(hostname || "")
}

function readerBuid(hostname) {
  return String(hostname || "").split(".")[0].replace(/^[^-]+-/, "")
}

function pdfEscape(text) {
  let out = ""
  for (const ch of String(text || "")) {
    if (ch === "\\" || ch === "(" || ch === ")") out += "\\" + ch
    else if (ch === "\r") continue
    else if (ch === "\n") out += "\\n"
    else {
      const code = ch.charCodeAt(0)
      if (code >= 32 && code <= 126) out += ch
      else if (WINANSI[ch]) out += "\\" + WINANSI[ch].toString(8).padStart(3, "0")
    }
  }
  return out
}

const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

function textWidth(text, size) {
  let width = 0
  for (const char of String(text || "")) {
    const code = char.codePointAt(0)
    const unit = code >= 32 && code < 32 + HELVETICA_WIDTHS.length ? HELVETICA_WIDTHS[code - 32] : 556
    width += (unit / 1000) * size
  }
  return width
}

function wrapText(text, size, width) {
  const pieces = (word) => {
    if (textWidth(word, size) <= width) return [word]
    const parts = []
    let chunk = ""
    for (const char of word) {
      const next = chunk + char
      if (chunk && textWidth(next, size) > width) {
        parts.push(chunk)
        chunk = char
      } else chunk = next
    }
    if (chunk) parts.push(chunk)
    return parts.length ? parts : [word]
  }
  const lines = []
  for (const paragraph of String(text || "").split(/\n+/)) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      for (const piece of pieces(word)) {
        const next = line ? `${line} ${piece}` : piece
        if (line && textWidth(next, size) > width) {
          lines.push(line)
          line = piece
        } else line = next
      }
    }
    if (line) lines.push(line)
  }
  return lines.length ? lines : [""]
}

function swapQuads(value) {
  const chars = String(value || "").split("")
  let index = 0
  while (index + 4 <= chars.length) {
    const slice = chars.slice(index, index + 4)
    const bad = slice.findIndex((ch) => ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029")
    if (bad !== -1) {
      index += bad + 1
      continue
    }
    const first = chars[index]
    chars[index] = chars[index + 3]
    chars[index + 3] = first
    index += 4
  }
  return chars.join("")
}

function decodeBase64Utf8(value) {
  const clean = String(value || "").replace(/\s+/g, "")
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytes)
}

function cfc1(blob) {
  return decodeBase64Utf8(swapQuads(blob))
}

function descramble(key, data) {
  const shifts = [...String(key || "")].map((ch) => Number.parseFloat(ch) || 0)
  if (!shifts.length) return String(data || "")
  let out = ""
  for (let index = 0; index < data.length; index += 1) {
    let code = data.charCodeAt(index)
    const shift = shifts[index % shifts.length]
    if (shift) {
      code += (index + shift) % 94
      if (code > 126) code = (code % 126) + 32
    }
    out += String.fromCharCode(code)
  }
  return out
}

function extractJsonObject(html, marker) {
  const at = String(html || "").search(marker)
  if (at < 0) return null
  const start = html.indexOf("{", at)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const ch = html[index]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === "\"") inString = false
      continue
    }
    if (ch === "\"") inString = true
    else if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, index + 1)) } catch { return null }
      }
    }
  }
  return null
}

function openbookFromDecoded(data) {
  if (!data || typeof data !== "object") return null
  if (Array.isArray(data.spine)) return data
  if (data.b && Array.isArray(data.b.spine)) return data.b
  return null
}

function extractBracketed(html, marker, open, close) {
  const at = String(html || "").search(marker)
  if (at < 0) return ""
  const start = html.indexOf(open, at)
  if (start < 0) return ""
  let depth = 0
  let quote = ""
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const ch = html[index]
    if (quote) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === quote) quote = ""
      continue
    }
    if (ch === "\"" || ch === "'") quote = ch
    else if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return html.slice(start, index + 1)
    }
  }
  return ""
}

function pageBook(win) {
  if (!win) return null
  for (const name of ["bData", "bdata", "eData", "edata", "BIF"]) {
    const found = openbookFromDecoded(win[name]?.b || win[name])
    if (found) return found
  }
  return null
}

function decodeOpenbook(html, buid) {
  const embedded = openbookFromDecoded(extractJsonObject(html, /window\.bdata\s*=/i))
  if (embedded) return embedded
  const literal = extractBracketed(html, /window\.edata\s*=/i, "[", "]")
  if (!literal) return null
  let parts
  try { parts = JSON.parse(literal) } catch { return null }
  if (!Array.isArray(parts) || parts.some((part) => typeof part !== "string")) return null
  let doc
  try { doc = JSON.parse(decodeBase64Utf8(descramble([...String(buid || "")].reverse().join(""), parts.join("\"")))) } catch { return null }
  return openbookFromDecoded(doc)
}

function bookTitle(openbook) {
  const title = openbook?.title
  if (typeof title === "string" && title.trim()) return title.trim()
  const main = title?.main || title?.title || openbook?.name
  return String(main || "Libby book").trim() || "Libby book"
}

function tocTitles(openbook) {
  const titles = new Map()
  const walk = (nodes) => {
    for (const node of nodes || []) {
      const path = node.path || node["-odread-original-path"] || ""
      const title = node.title || node.label || ""
      if (path && title) titles.set(String(path), String(title))
      walk(node.contents || node.children)
    }
  }
  walk(openbook?.nav?.toc)
  return titles
}

function spineParts(openbook, origin) {
  const spine = openbook?.spine || []
  const tokens = openbook?.["-odread-cmpt-params"] || []
  const titles = tocTitles(openbook)
  const base = String(origin || "").replace(/\/$/, "")
  const parts = []
  spine.forEach((part, index) => {
    const path = String(part?.path || "").replace(/^\//, "")
    if (!path) return
    const original = String(part["-odread-original-path"] || path)
    const position = Number.isInteger(part["-odread-spine-position"]) ? part["-odread-spine-position"] : index
    const token = tokens[position] || ""
    const name = titles.get(original) || titles.get(path) || part.title || original.split("/").pop() || `Chapter ${index + 1}`
    parts.push({
      title: String(name),
      path: original,
      url: `${base}/${path}${token ? `?${token}` : ""}`,
    })
  })
  return parts
}

function readJsString(source, start) {
  const quote = source[start]
  if (quote !== "\"" && quote !== "'") return ""
  let out = ""
  for (let index = start + 1; index < source.length; index += 1) {
    const ch = source[index]
    if (ch === "\\") {
      const next = source[index + 1]
      const mapped = { n: "\n", r: "\r", t: "\t", "\\": "\\", "'": "'", "\"": "\"" }[next]
      out += mapped === undefined ? (next || "") : mapped
      index += 1
      continue
    }
    if (ch === quote) return out
    out += ch
  }
  return ""
}

function cipherCall(html) {
  const source = String(html || "")
  const match = /__bif_cfc[0-9]\(\s*self\s*,\s*(['"])/.exec(source)
  if (!match) return null
  const name = match[0].match(/__bif_cfc[0-9]/)[0]
  const blob = readJsString(source, match.index + match[0].length - 1)
  return blob ? { name, blob } : null
}

function decodeChapter(html) {
  const source = String(html || "")
  const call = cipherCall(source)
  if (!call) {
    if (/__bif_cfc[0-9]/.test(source)) throw new Error("A chapter was not in a form this saver can read.")
    if (/<(html|body|p|div|img|svg)\b/i.test(source)) return source
    throw new Error("A chapter was not in a form this saver can read.")
  }
  if (call.name !== "__bif_cfc1") return source
  const body = cfc1(call.blob)
  if (!/^\s*</.test(body)) throw new Error("A chapter could not be read.")
  return body
}

function looksLikeChapter(html) {
  const call = cipherCall(html)
  return call?.name === "__bif_cfc1" || /<(p|h1|h2)\b/i.test(html || "")
}

function readerCipher(doc, call) {
  const fn = doc?.defaultView?.[call.name]
  if (typeof fn !== "function" || typeof doc?.createElement !== "function") return ""
  const frame = doc.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;left:-10000px;width:1px;height:1px;border:0"
  ;(doc.body || doc.documentElement).appendChild(frame)
  try {
    const written = fn(frame.contentWindow, call.blob)
    const fromFrame = frame.contentDocument?.documentElement?.outerHTML || ""
    if (/<(p|h1|h2|img|svg)\b/i.test(fromFrame) && !/__bif_cfc/.test(fromFrame)) return fromFrame
    if (typeof written === "string" && /<(p|h1|h2|img|svg)\b/i.test(written)) return written
    return ""
  } catch {
    return ""
  } finally {
    frame.remove()
  }
}

function chapterClue(part, html) {
  const raw = String(html || "")
  const at = raw.indexOf("__bif_cfc1")
  const sample = (at >= 0 ? raw.slice(at, at + 50) : raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 70)
  const file = String(part?.path || "").split("/").pop() || "chapter"
  return `${file} query=${String(part?.url || "").includes("?")} cfc1=${at >= 0} ${sample}`.slice(0, 180)
}

function blocksFromHtml(html, pageUrl) {
  if (typeof DOMParser === "undefined") return [{ kind: "p", text: String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }]
  const parsed = new DOMParser().parseFromString(String(html || ""), "text/html")
  const blocks = []
  const nodes = parsed.body?.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,img") || []
  for (const node of nodes) {
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") || ""
      let url = ""
      try { url = new URL(src, pageUrl).href } catch { url = "" }
      if (url) blocks.push({ kind: "image", src: url, alt: node.getAttribute("alt") || "" })
      continue
    }
    if (node.tagName !== "LI" && node.closest?.("li")) continue
    if (node.tagName !== "BLOCKQUOTE" && node.closest?.("blockquote")) continue
    if (node.tagName === "LI" && node.parentElement?.closest?.("li")) continue
    if (node.querySelector?.("h1,h2,h3,h4,h5,h6,p,li,blockquote") && node.tagName !== "LI" && node.tagName !== "BLOCKQUOTE") continue
    const text = (node.textContent || "").replace(/\s+/g, " ").trim()
    if (!text) continue
    if (/^H[1-6]$/.test(node.tagName)) blocks.push({ kind: "h", text, level: Math.min(4, Number(node.tagName[1])) })
    else if (node.tagName === "LI") blocks.push({ kind: "li", text })
    else if (node.tagName === "BLOCKQUOTE") blocks.push({ kind: "quote", text })
    else blocks.push({ kind: "p", text })
  }
  if (blocks.length) return blocks
  const lines = (parsed.body?.textContent || "").split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean)
  return lines.map((text) => ({ kind: "p", text }))
}

function jpegSize(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array()
  let index = 2
  while (index + 9 < data.length) {
    if (data[index] !== 0xff) {
      index += 1
      continue
    }
    const marker = data[index + 1]
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: (data[index + 5] << 8) + data[index + 6], width: (data[index + 7] << 8) + data[index + 8] }
    }
    const length = (data[index + 2] << 8) + data[index + 3]
    if (length < 2) break
    index += 2 + length
  }
  return { width: 600, height: 800 }
}

function isPageStamp(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return /^pages?\s+\d+/i.test(text) || /^pp?\.\s*\d+/i.test(text) || /^\d+(\s*[–-]\s*\d+)?$/.test(text)
}

function paintableBlocks(blocks) {
  return (blocks || []).filter((block) => {
    if (block?.kind === "image") return !!block.jpeg?.length
    const text = String(block?.text || "").replace(/\s+/g, " ").trim()
    return !!text && !isPageStamp(text)
  })
}

function blockKey(block) {
  if (block?.kind === "image") {
    const id = block.src || `${block.pixelWidth}x${block.pixelHeight}:${block.jpeg?.length || 0}`
    return `img:${id}`
  }
  const text = String(block?.text || "").replace(/\s+/g, " ").trim()
  return `${block?.kind || "p"}:${block?.level || 0}:${text}`
}

function collapseCopies(blocks) {
  const keys = blocks.map(blockKey)
  const count = keys.length
  if (count < 2) return blocks
  for (let copies = 2; copies <= 4; copies += 1) {
    if (count % copies) continue
    const size = count / copies
    if (size < 2 && !keys[0].startsWith("img:")) continue
    let same = true
    for (let index = size; index < count; index += 1) {
      if (keys[index] !== keys[index % size]) same = false
    }
    if (same) return blocks.slice(0, size)
  }
  for (let size = Math.floor(count / 2); size > 1; size -= 1) {
    let same = true
    for (let index = 0; index < size; index += 1) {
      if (keys[index] !== keys[size + index]) same = false
    }
    if (same) return collapseCopies(blocks.slice(size))
  }
  return blocks
}

function runSeen(hay, run) {
  if (!run.length || run.length > hay.length) return false
  const mark = "\u0001"
  return hay.join(mark).includes(run.join(mark))
}

function unseenBlocks(blocks, seen) {
  const collapsed = collapseCopies(blocks)
  const keys = collapsed.map(blockKey)
  const hay = seen.slice()
  const fresh = []
  let index = 0
  while (index < keys.length) {
    let skip = 0
    const max = Math.min(keys.length - index, hay.length)
    for (let size = max; size >= 1; size -= 1) {
      const run = keys.slice(index, index + size)
      const adjacent = hay.slice(-size).every((key, at) => key === run[at])
      const sameImage = size === 1 && run[0].startsWith("img:") && hay.includes(run[0])
      const repeated = size >= 2 && run.join("").length >= 40 && runSeen(hay, run)
      if (adjacent || sameImage || repeated) {
        skip = size
        break
      }
    }
    if (skip) {
      index += skip
      continue
    }
    fresh.push(collapsed[index])
    hay.push(keys[index])
    index += 1
  }
  return fresh
}

function prepareChapters(chapters) {
  const prepared = []
  const seen = []
  for (const chapter of chapters || []) {
    const blocks = unseenBlocks(paintableBlocks(chapter?.blocks), seen)
    if (!blocks.length) continue
    seen.push(...blocks.map(blockKey))
    const title = isPageStamp(chapter?.title) ? "" : String(chapter?.title || "").trim()
    if (!title) {
      if (prepared.length) prepared[prepared.length - 1].blocks.push(...blocks)
      else prepared.push({ title: "Cover", blocks })
      continue
    }
    const current = prepared[prepared.length - 1]
    if (current && current.title === title) current.blocks.push(...blocks)
    else prepared.push({ title, blocks: [...blocks] })
  }
  return prepared
}

function isCoverChapter(chapter) {
  return /^cover$/i.test(String(chapter?.title || "").trim())
}

const BLOCK_STYLES = {
  h1: { font: "F2", size: 16, leading: 21, color: "0.18 0.22 0.28", before: 2, after: 10, highlight: true },
  h2: { font: "F2", size: 13, leading: 17, color: "0.12 0.12 0.12", before: 16, after: 7, mark: true },
  h3: { font: "F2", size: 12, leading: 16, color: "0.22 0.22 0.22", before: 13, after: 5, mark: true },
  h4: { font: "F2", size: 11, leading: 15, color: "0.28 0.28 0.28", before: 11, after: 4 },
  p: { font: "F1", size: 11, leading: 15, color: "0.1 0.1 0.1", before: 0, after: 9 },
  li: { font: "F1", size: 11, leading: 15, color: "0.1 0.1 0.1", before: 0, after: 3, indent: 16, bullet: true },
  quote: { font: "F1", size: 11, leading: 15, color: "0.28 0.28 0.28", before: 8, after: 10, indent: 16, bar: true },
}

function blockStyle(block) {
  if (block?.kind === "h") {
    const level = Math.min(4, Math.max(1, Number(block.level) || 2))
    return BLOCK_STYLES[`h${level}`]
  }
  return BLOCK_STYLES[block?.kind] || BLOCK_STYLES.p
}

function sameText(left, right) {
  return String(left || "").replace(/\s+/g, " ").trim().toLowerCase() === String(right || "").replace(/\s+/g, " ").trim().toLowerCase()
}

function runningLabel(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  const limit = PAGE_WIDTH - MARGIN * 2 - 48
  if (!text || textWidth(text, 9) <= limit) return text
  let out = text
  while (out.length > 8 && textWidth(`${out}…`, 9) > limit) out = out.slice(0, -1)
  return `${out.trim()}…`
}

function pageChrome(sheet, pageNumber) {
  if (sheet.bare) return sheet.ops.join("\n")
  const commands = [
    "0.85 0.85 0.85 RG",
    "0.6 w",
    `${MARGIN} ${PAGE_HEIGHT - 36} m ${PAGE_WIDTH - MARGIN} ${PAGE_HEIGHT - 36} l S`,
    ...sheet.ops,
  ]
  const label = runningLabel(sheet.running)
  if (label) commands.push(`BT /F1 9 Tf 0.4 0.4 0.4 rg 1 0 0 1 ${MARGIN} 32 Tm (${pdfEscape(label)}) Tj ET`)
  const pageText = String(pageNumber)
  const pageX = (PAGE_WIDTH - MARGIN - textWidth(pageText, 9)).toFixed(2)
  commands.push(`BT /F1 9 Tf 0.4 0.4 0.4 rg 1 0 0 1 ${pageX} 32 Tm (${pdfEscape(pageText)}) Tj ET`)
  return commands.join("\n")
}

function layoutChapters(chapters, options = {}) {
  const sheets = []
  const starts = []
  const contentWidth = PAGE_WIDTH - MARGIN * 2
  const bottom = MARGIN
  const pageRoom = PAGE_HEIGHT - MARGIN * 2
  const running = options.running || ""
  const bare = options.bare === true
  let sheet = null
  const fresh = () => {
    sheet = { ops: [], y: PAGE_HEIGHT - MARGIN, images: [], links: [], running, bare, prose: false }
    sheets.push(sheet)
  }
  const breakPage = () => {
    if (sheet && (sheet.ops.length || sheet.images.length)) fresh()
  }
  const paintChapterTitle = (title) => {
    const size = 18
    const baseline = sheet.y - size
    sheet.ops.push(`0.93 0.94 0.95 rg ${(MARGIN - 8).toFixed(2)} ${(baseline - 5).toFixed(2)} ${(contentWidth + 16).toFixed(2)} ${size + 10} re f`)
    sheet.ops.push(`BT /F2 ${size} Tf 0.18 0.22 0.28 rg ${MARGIN} ${baseline.toFixed(2)} Td (${pdfEscape(title)}) Tj ET`)
    sheet.y = baseline - 18
  }
  const placeImage = (block) => {
    const caption = String(block.alt || "").replace(/\s+/g, " ").trim()
    const captionLines = caption && !isPageStamp(caption) && caption.length <= 120
      ? wrapText(caption, 9, contentWidth).slice(0, 2)
      : []
    const captionHeight = captionLines.length ? captionLines.length * 12 + 8 : 0
    const fit = (maxWidth, maxHeight) => {
      const scale = Math.min(maxWidth / block.pixelWidth, maxHeight / block.pixelHeight, 1)
      return {
        width: Math.max(1, block.pixelWidth * scale),
        height: Math.max(1, block.pixelHeight * scale),
      }
    }
    const fitted = fit(contentWidth, Math.max(72, pageRoom - captionHeight))
    if (fitted.height + captionHeight > sheet.y - bottom && sheet.prose && fitted.height + captionHeight <= pageRoom) breakPage()
    if (sheet.prose && sheet.y - fitted.height - captionHeight > bottom) sheet.y -= 8
    const sized = fit(contentWidth, Math.max(72, sheet.y - bottom - captionHeight))
    const name = `Im${sheet.images.length + 1}`
    const y = sheet.y - sized.height
    const x = MARGIN + Math.max(0, (contentWidth - sized.width) / 2)
    sheet.ops.push(`q ${sized.width.toFixed(2)} 0 0 ${sized.height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`)
    sheet.images.push({ name, jpeg: block.jpeg, pixelWidth: block.pixelWidth, pixelHeight: block.pixelHeight })
    sheet.y = y - 8
    for (const line of captionLines) {
      sheet.ops.push(`BT /F1 9 Tf 0.35 0.35 0.35 rg ${MARGIN} ${(sheet.y - 9).toFixed(2)} Td (${pdfEscape(line)}) Tj ET`)
      sheet.y -= 12
    }
    if (captionLines.length) sheet.y -= 6
    sheet.prose = true
  }
  const placeLines = (block, next) => {
    const style = blockStyle(block)
    const bulletWidth = style.bullet ? textWidth("•  ", style.size) : 0
    const width = Math.max(24, contentWidth - (style.indent || 0) - bulletWidth)
    const lines = wrapText(block.text, style.size, width).filter((line) => line.trim())
    if (!lines.length) return
    const level = block.kind === "h" ? Number(block.level) || 2 : 0
    if (level === 1 && sheet.prose) breakPage()
    const nextStyle = next && next.kind !== "image" ? blockStyle(next) : null
    const keep = level > 0 ? style.leading + (style.after || 0) + (nextStyle ? nextStyle.leading * 2 : 72) : 0
    if (keep && sheet.ops.length && keep < pageRoom && sheet.y - keep < bottom) breakPage()
    if ((block.kind === "quote") && lines.length > 1 && lines.length <= 12) {
      const blockHeight = lines.length * style.leading + (style.before || 0)
      if (blockHeight < pageRoom && sheet.ops.length && sheet.y - blockHeight < bottom) breakPage()
    }
    const gapBefore = style.mark && sheet.prose ? 10 : (style.before && sheet.prose ? style.before : 0)
    if (gapBefore && sheet.y - gapBefore - style.leading < bottom) breakPage()
    const openPage = sheet.ops.length === 0 && !sheet.prose
    if (style.mark && sheet.prose) {
      const ruleY = sheet.y - 2
      sheet.ops.push(`0.82 0.82 0.82 RG 0.8 w ${MARGIN} ${ruleY.toFixed(2)} m ${MARGIN + 72} ${ruleY.toFixed(2)} l S`)
    }
    if (gapBefore) sheet.y -= gapBefore
    let index = 0
    let barTop = null
    const closeBar = () => {
      if (!style.bar || barTop == null) return
      const barX = MARGIN + 4
      sheet.ops.push(`0.75 0.78 0.82 RG 1.5 w ${barX} ${(sheet.y + 2).toFixed(2)} m ${barX} ${(barTop - 2).toFixed(2)} l S`)
      barTop = null
    }
    while (index < lines.length) {
      let room = Math.floor((sheet.y - bottom) / style.leading)
      if (room < 1) {
        closeBar()
        breakPage()
        continue
      }
      const left = lines.length - index
      let take = Math.min(room, left)
      if (sheet.ops.length && left > take && take < 2 && left >= 2) {
        closeBar()
        breakPage()
        continue
      }
      if (left > take && left - take === 1 && take > 2) take -= 1
      if (style.bar && barTop == null) barTop = sheet.y
      for (let step = 0; step < take; step += 1) {
        const at = index + step
        const baseline = sheet.y - style.size
        const textX = MARGIN + (style.indent || 0) + (style.bullet ? bulletWidth : 0)
        if (style.highlight && openPage && at === 0) {
          sheet.ops.push(`0.93 0.94 0.95 rg ${(MARGIN - 8).toFixed(2)} ${(baseline - 4).toFixed(2)} ${(contentWidth + 16).toFixed(2)} ${(style.size + 8).toFixed(2)} re f`)
        }
        if (style.bullet && at === 0) {
          sheet.ops.push(`BT /${style.font} ${style.size} Tf ${style.color} rg ${(MARGIN + (style.indent || 0)).toFixed(2)} ${baseline.toFixed(2)} Td (${pdfEscape("•")}) Tj ET`)
        }
        sheet.ops.push(`BT /${style.font} ${style.size} Tf ${style.color} rg ${textX.toFixed(2)} ${baseline.toFixed(2)} Td (${pdfEscape(lines[at])}) Tj ET`)
        sheet.y -= style.leading
      }
      index += take
      if (index < lines.length) {
        closeBar()
        breakPage()
      }
    }
    closeBar()
    let after = style.after || 0
    if (block.kind === "li" && next?.kind !== "li") after += 7
    sheet.y -= after
    if (level === 0) sheet.prose = true
  }
  for (const chapter of chapters || []) {
    const blocks = paintableBlocks(chapter.blocks)
    if (!blocks.length) continue
    fresh()
    starts.push(sheets.length - 1)
    const title = isPageStamp(chapter.title) ? "" : String(chapter.title || "").trim()
    const hasText = blocks.some((block) => block.kind !== "image")
    if (hasText && title && !isCoverChapter(chapter)) paintChapterTitle(title)
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]
      if (block.kind === "image" && block.jpeg) placeImage(block)
      else placeLines(block, blocks[index + 1])
    }
  }
  return { sheets, starts }
}

function layoutContents(chapters, starts, offset, bookName) {
  const sheets = []
  const contentWidth = PAGE_WIDTH - MARGIN * 2
  const bottom = MARGIN
  const size = 11
  const leading = 16
  const running = bookName || "Contents"
  let sheet = null
  const fresh = () => {
    sheet = { ops: [], y: PAGE_HEIGHT - MARGIN, images: [], links: [], running, bare: false, prose: false }
    sheets.push(sheet)
  }
  fresh()
  const headingY = sheet.y - 20
  sheet.ops.push(`0.93 0.94 0.95 rg ${(MARGIN - 8).toFixed(2)} ${(headingY - 5).toFixed(2)} ${(contentWidth + 16).toFixed(2)} 30 re f`)
  sheet.ops.push(`BT /F2 20 Tf 0.18 0.22 0.28 rg ${MARGIN} ${headingY.toFixed(2)} Td (Contents) Tj ET`)
  sheet.y = headingY - 16
  if (bookName) {
    sheet.ops.push(`BT /F1 10 Tf 0.4 0.4 0.4 rg ${MARGIN} ${(sheet.y - 10).toFixed(2)} Td (${pdfEscape(bookName)}) Tj ET`)
    sheet.y -= 24
  }
  chapters.forEach((chapter, index) => {
    const pageNumber = String((starts[index] ?? 0) + offset + 1)
    const pageWidth = textWidth(pageNumber, size)
    const pageX = PAGE_WIDTH - MARGIN - pageWidth
    const titleX = MARGIN + 26
    const wrapped = wrapText(chapter.title, size, Math.max(40, pageX - titleX - 18))
    const rowHeight = wrapped.length * leading + 6
    if (sheet.y - rowHeight < bottom) fresh()
    wrapped.forEach((line, lineIndex) => {
      const baseline = sheet.y - size
      const last = lineIndex === wrapped.length - 1
      if (lineIndex === 0) {
        sheet.ops.push(`BT /F2 ${size} Tf 0.35 0.42 0.50 rg ${MARGIN} ${baseline.toFixed(2)} Td (${pdfEscape(String(index + 1))}) Tj ET`)
      }
      const titleWidth = textWidth(line, size)
      sheet.ops.push(`BT /F1 ${size} Tf 0.12 0.35 0.62 rg ${titleX.toFixed(2)} ${baseline.toFixed(2)} Td (${pdfEscape(line)}) Tj ET`)
      sheet.ops.push(`0.12 0.35 0.62 RG 0.6 w ${titleX.toFixed(2)} ${(baseline - 1.5).toFixed(2)} m ${(titleX + titleWidth).toFixed(2)} ${(baseline - 1.5).toFixed(2)} l S`)
      if (last) {
        const from = titleX + titleWidth + 8
        const to = pageX - 8
        if (to - from > 8) {
          sheet.ops.push(`0.65 0.65 0.65 RG 1 J 0.8 w [0.4 3] 0 d ${from.toFixed(2)} ${(baseline + 2).toFixed(2)} m ${to.toFixed(2)} ${(baseline + 2).toFixed(2)} l S [] 0 d 0 J`)
        }
        sheet.ops.push(`BT /F1 ${size} Tf 0.12 0.12 0.12 rg ${pageX.toFixed(2)} ${baseline.toFixed(2)} Td (${pdfEscape(pageNumber)}) Tj ET`)
      }
      sheet.links.push({ y: baseline - 3, h: leading, dest: (starts[index] ?? 0) + offset })
      sheet.y -= leading
    })
    sheet.y -= 6
  })
  return sheets
}

function buildLibbyPdf(chapters, sourceTitle) {
  const prepared = prepareChapters(chapters)
    .map((chapter) => ({
      title: chapter.title,
      blocks: (chapter.blocks || []).filter((block) => block?.kind !== "h" || !sameText(block.text, chapter.title)),
    }))
    .filter((chapter) => chapter.blocks.length)
  const book = prepared.length ? prepared : [{ title: sourceTitle || "Libby book", blocks: [{ kind: "p", text: "This book had no readable chapters." }] }]
  const cover = []
  const body = []
  for (const chapter of book) {
    if (!body.length && isCoverChapter(chapter)) cover.push(chapter)
    else body.push(chapter)
  }
  const coverLaid = layoutChapters(cover, { bare: true })
  const bodyLaid = layoutChapters(body, { running: sourceTitle || "" })
  let contentsCount = body.length ? 1 : 0
  let contents = []
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = coverLaid.sheets.length + contentsCount
    contents = body.length ? layoutContents(body, bodyLaid.starts, offset, sourceTitle || "") : []
    if (contents.length === contentsCount) break
    contentsCount = contents.length
  }
  const sheets = coverLaid.sheets.concat(contents, bodyLaid.sheets)
  const bodies = new Map()
  let nextId = 5
  const rendered = sheets.map((sheet, index) => {
    const pageId = nextId
    nextId += 1
    const streamId = nextId
    nextId += 1
    const images = sheet.images.map((image) => ({ ...image, objectId: nextId++ }))
    return { ...sheet, pageId, streamId, images, pageNumber: index + 1 }
  })
  const pageIds = rendered.map((sheet) => sheet.pageId)
  bodies.set(1, `<< /Type /Catalog /Pages 2 0 R >>`)
  bodies.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`)
  bodies.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
  bodies.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
  for (const sheet of rendered) {
    const xobjects = sheet.images.map((image) => `/${image.name} ${image.objectId} 0 R`).join(" ")
    const resources = xobjects
      ? `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects} >> >>`
      : "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>"
    const annots = sheet.links.map((link) => {
      const top = link.y + link.h
      return `<< /Type /Annot /Subtype /Link /Rect [${MARGIN} ${link.y.toFixed(2)} ${PAGE_WIDTH - MARGIN} ${top.toFixed(2)}] /Border [0 0 0] /Dest [${rendered[link.dest]?.pageId || rendered[0].pageId} 0 R /Fit] >>`
    }).join("")
    const annotPart = annots ? ` /Annots [${annots}]` : ""
    bodies.set(sheet.pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${sheet.streamId} 0 R ${resources}${annotPart} >>`)
    const stream = pageChrome(sheet, sheet.pageNumber)
    bodies.set(sheet.streamId, { stream })
    for (const image of sheet.images) {
      bodies.set(image.objectId, { jpeg: image.jpeg, pixelWidth: image.pixelWidth, pixelHeight: image.pixelHeight })
    }
  }

  const encoder = new TextEncoder()
  const chunks = [encoder.encode("%PDF-1.4\n")]
  let written = chunks[0].length
  const offsets = [0]
  const ids = [...bodies.keys()].sort((left, right) => left - right)
  for (const id of ids) {
    offsets[id] = written
    const body = bodies.get(id)
    const parts = body?.jpeg
      ? [
          encoder.encode(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${body.pixelWidth} /Height ${body.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${body.jpeg.length} >>\nstream\n`),
          body.jpeg,
          encoder.encode("\nendstream\nendobj\n"),
        ]
      : body?.stream !== undefined
        ? [encoder.encode(`${id} 0 obj\n<< /Length ${encoder.encode(body.stream).length} >>\nstream\n${body.stream}\nendstream\nendobj\n`)]
        : [encoder.encode(`${id} 0 obj\n${body}\nendobj\n`)]
    for (const part of parts) {
      chunks.push(part)
      written += part.length
    }
  }
  const xrefAt = written
  let xref = `xref\n0 ${ids.length + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= ids.length; id += 1) xref += `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`
  chunks.push(encoder.encode(`${xref}trailer\n<< /Size ${ids.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`))
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const pdf = new Uint8Array(total)
  let cursor = 0
  for (const chunk of chunks) {
    pdf.set(chunk, cursor)
    cursor += chunk.length
  }
  return pdf
}

function reportLibby(line) {
  console.info("[omniget]", line)
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "omniget-libby-progress", line })
    } else {
      window.postMessage({ type: "omniget-libby-progress", line }, "*")
    }
  } catch { /* the popup may already be closed */ }
}

if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage && typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "omniget-libby-progress") return
    try { chrome.runtime.sendMessage({ type: "omniget-libby-progress", line: event.data.line }) } catch { /* popup closed */ }
  })
}

function fileNameFor(title) {
  const clean = String(title || "libby-book").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
  return `${clean || "libby-book"}.pdf`
}

async function jpegBlock(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if ((blob.type || "").includes("jpeg") || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
    const size = jpegSize(bytes)
    return { jpeg: bytes, pixelWidth: size.width, pixelHeight: size.height }
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d").drawImage(bitmap, 0, 0)
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86))
  if (!jpeg) return null
  return { jpeg: new Uint8Array(await jpeg.arrayBuffer()), pixelWidth: bitmap.width, pixelHeight: bitmap.height }
}

function bookMarkers(html) {
  const names = ["bdata", "edata", "spark", "bifocal", "odread", "spine"]
  const seen = names.filter((name) => String(html || "").toLowerCase().includes(name))
  return `${String(html || "").length} chars: ${seen.join(", ") || "no book markers"}`
}

async function loadOpenbook(doc) {
  const live = pageBook(doc.defaultView)
  if (live) return live
  const pages = [doc.location?.href, `${doc.location?.origin || ""}/`].filter(Boolean)
  const notes = []
  for (const page of pages) {
    try {
      const response = await fetchWithin(page, 8000, { credentials: "include" })
      if (!response.ok) {
        notes.push(`HTTP ${response.status}`)
        continue
      }
      const html = await within(() => response.text(), 8000)
      notes.push(bookMarkers(html))
      const openbook = decodeOpenbook(html, readerBuid(doc.location?.hostname))
      if (openbook) return openbook
    } catch {
      notes.push("timed out")
    }
  }
  const globals = ["bData", "bdata", "eData", "edata", "BIF"].filter((name) => doc.defaultView?.[name] != null)
  throw new Error(`The open Libby book was not found. ${notes.join(" | ")}${globals.length ? ` | page has ${globals.join(", ")}` : ""}`.slice(0, 220))
}

function readChapterFrame(doc, url) {
  return new Promise((resolve, reject) => {
    const frame = doc.createElement("iframe")
    frame.setAttribute("sandbox", "allow-same-origin")
    frame.setAttribute("aria-hidden", "true")
    frame.style.cssText = "position:absolute;width:0;height:0;border:0"
    const timer = setTimeout(() => {
      frame.remove()
      reject(new Error("A chapter did not load."))
    }, 8000)
    frame.onload = () => {
      clearTimeout(timer)
      let html = ""
      try { html = frame.contentDocument?.documentElement?.outerHTML || "" } catch { html = "" }
      frame.remove()
      if (!html) reject(new Error("A chapter did not load."))
      else resolve(html)
    }
    frame.src = url
    ;(doc.body || doc.documentElement).appendChild(frame)
  })
}

async function chapterSource(doc, part) {
  const response = await fetch(part.url, { credentials: "include" })
  if (!response.ok) throw new Error(`A chapter did not load (${response.status}).`)
  const type = response.headers.get("content-type") || ""
  if (type.includes("jpeg") || /\.jpe?g$/i.test(part.path)) return { image: await response.blob() }
  const fetched = await response.text()
  const call = cipherCall(fetched)
  const opened = call && call.name !== "__bif_cfc1" ? readerCipher(doc, call) : ""
  const html = opened || fetched
  if (looksLikeChapter(html) || typeof doc?.createElement !== "function") return { html }
  try {
    const framed = await readChapterFrame(doc, part.url)
    if (looksLikeChapter(framed)) return { html: framed }
  } catch { /* the fetched page is reported below */ }
  const view = doc?.defaultView
  const fn = call ? view?.[call.name] : null
  const src = typeof fn === "function" ? fn.toString().replace(/\s+/g, " ").slice(0, 240) : "nofn"
  const names = view ? Object.getOwnPropertyNames(view).filter((name) => /cfc|crypt|bif/i.test(name)).slice(0, 12).join(",") : ""
  throw new Error(`${src} | ${names}`.slice(0, 420))
}

async function chapterBlocks(doc, part) {
  const source = await chapterSource(doc, part)
  if (source.image) {
    const image = await jpegBlock(source.image)
    return image ? [{ kind: "image", ...image, alt: part.title }] : []
  }
  const html = decodeChapter(source.html)
  const blocks = blocksFromHtml(html, part.url)
  if (!blocks.length) throw new Error(`A chapter had no text. ${chapterClue(part, source.html)}`)
  for (const block of blocks) {
    if (block.kind !== "image" || !block.src) continue
    try {
      const imageResponse = await fetchWithin(block.src, 8000, { credentials: "include" })
      if (!imageResponse.ok) continue
      const image = await jpegBlock(await within(() => imageResponse.blob(), 8000))
      if (image) Object.assign(block, image)
    } catch { /* a missing picture should not stop the book */ }
  }
  return blocks
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fetchWithin(url, ms, options = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), ms) : null
  const request = controller ? { ...options, signal: controller.signal } : options
  return fetch(url, request).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function within(work, ms) {
  let timer
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms)
  })
  return Promise.race([Promise.resolve().then(work), limit]).finally(() => clearTimeout(timer))
}

function ownText(el) {
  return [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("").replace(/\s+/g, " ").trim()
}

function sameOriginDocument(win) {
  try { return win?.document || null } catch { return null }
}

function relatedDocs(doc) {
  const docs = []
  const add = (next) => {
    if (next && !docs.includes(next)) docs.push(next)
  }
  add(doc)
  add(sameOriginDocument(doc?.defaultView?.parent))
  add(sameOriginDocument(doc?.defaultView?.top))
  for (let index = 0; index < docs.length; index += 1) {
    for (const frame of docs[index].querySelectorAll?.("iframe, frame") || []) add(sameOriginDocument(frame.contentWindow))
  }
  return docs
}

function readerText(doc) {
  const parts = [doc.body?.innerText || ""]
  const walk = (root) => {
    if (!root?.querySelectorAll) return
    for (const el of root.querySelectorAll("*")) {
      if (!el.shadowRoot) continue
      parts.push(el.shadowRoot.textContent || "")
      walk(el.shadowRoot)
    }
  }
  walk(doc)
  return parts.join("\n").replace(/\s+/g, " ")
}

function pageMarkerFromText(text) {
  const pattern = /pp?\.\s*(\d+)(?:\s*[–—-]\s*(\d+))?([\s\S]{0,8000}?)of\s+(\d+)/gi
  let match = null
  let best = null
  while ((match = pattern.exec(String(text || "")))) {
    if (/pp?\.\s*\d/i.test(match[3])) continue
    if (!best || match[3].length < best[3].length) best = match
    if (match[3].length < 40) break
  }
  if (!best) return null
  const start = Number(best[1])
  const end = Number(best[2] || best[1])
  const total = Number(best[4])
  return { start, end, total, label: `pp. ${start}${best[2] ? `-${end}` : ""} of ${total}` }
}

function markerFromLabel(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim()
  if (!clean || clean.length > 80) return null
  const match = clean.match(/pp?\.\s*(\d+)(?:\s*[–—-]\s*(\d+))?(?:\s+of\s+(\d+))?/i)
  if (!match) return null
  const before = clean.slice(0, match.index).trim()
  const rest = clean.slice(match.index + match[0].length).trim()
  if (before.length > 12 || rest.length > 60) return null
  const start = Number(match[1])
  const end = Number(match[2] || match[1])
  const total = match[3] ? Number(match[3]) : 0
  return { start, end, total, label: total ? `pp. ${start}${match[2] ? `-${end}` : ""} of ${total}` : `pp. ${start}${match[2] ? `-${end}` : ""}` }
}

function labelFromElement(el) {
  const fromOwn = markerFromLabel(ownText(el))
  if (fromOwn) return fromOwn
  const text = (el.textContent || "").replace(/\s+/g, " ").trim()
  if (!text || text.length > 80) return null
  return markerFromLabel(text)
}

function pageLabelCount(el) {
  return ((el?.textContent || "").match(/pp?\.\s*\d+/gi) || []).length
}

function parentAcrossShadow(el) {
  if (el?.parentElement) return el.parentElement
  const root = el?.getRootNode?.()
  return root?.host || null
}

function centeredPageLabel(el, width) {
  const box = el?.getBoundingClientRect?.()
  if (!box || box.width < 8 || box.width > 240) return null
  const mid = box.left + box.width / 2
  if (mid < width * 0.36 || mid > width * 0.64) return null
  if (pageLabelCount(el) !== 1) return null
  return markerFromLabel((el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100))
}

function markerUnderPoint(doc, x, y) {
  let el = doc.elementFromPoint?.(x, y) || null
  if (el?.shadowRoot?.elementFromPoint) el = el.shadowRoot.elementFromPoint(x, y) || el
  const width = doc.defaultView?.innerWidth || 800
  for (let depth = 0; el && depth < 8; depth += 1) {
    const count = pageLabelCount(el)
    if (count === 1) {
      const label = centeredPageLabel(el, width)
      if (label) return label
    }
    if (count > 1) {
      for (const child of el.children || []) {
        const box = child.getBoundingClientRect?.()
        if (!box || x < box.left || x > box.right || y < box.top || y > box.bottom) continue
        const label = centeredPageLabel(child, width)
        if (label) return label
      }
      return null
    }
    el = parentAcrossShadow(el)
  }
  return null
}

function footerMarker(doc) {
  const view = doc.defaultView
  const width = view?.innerWidth || 0
  const height = view?.innerHeight || 0
  if (!width || !height || !doc.elementFromPoint) return null
  const found = []
  for (const yPart of [0.74, 0.8, 0.86]) {
    for (const xPart of [0.4, 0.44, 0.47, 0.5, 0.53, 0.56]) {
      const label = markerUnderPoint(doc, width * xPart, height * yPart)
      if (label) found.push(label)
    }
  }
  if (!found.length) return null
  const counts = new Map()
  for (const label of found) {
    const key = `${label.start}-${label.end}`
    const item = counts.get(key) || { label, count: 0 }
    item.count += 1
    if (label.total) item.label = label
    counts.set(key, item)
  }
  const page = [...counts.values()].sort((a, b) => b.count - a.count)[0].label
  if (page.total) return page
  for (const xPart of [0.5, 0.56, 0.62]) {
    let el = doc.elementFromPoint(width * xPart, height * 0.82)
    if (el?.shadowRoot?.elementFromPoint) el = el.shadowRoot.elementFromPoint(width * xPart, height * 0.82) || el
    const total = String(el?.textContent || "").match(/of\s+(\d+)/i)
    if (!total) continue
    return { ...page, total: Number(total[1]), label: `${page.label} of ${total[1]}` }
  }
  return page
}

function readerPlace(doc) {
  const place = doc.defaultView?.BIF?.objects?.compass?.place
  const pages = place?.pages
  if (!pages?.length || !place.isFinite?.()) return null
  const start = Number(pages.head)
  const end = Number(pages.tail ?? pages[pages.length - 1])
  const total = Number(pages.total)
  if (!start || !Number.isFinite(total)) return null
  return {
    start,
    end,
    total,
    label: `pp. ${start}${end !== start ? `-${end}` : ""} of ${total}`,
    title: place.chapter?.title || "",
  }
}

function turnSpread(doc, direction) {
  const spool = doc.defaultView?.BIF?.context?.spool
  if (direction < 0 && typeof spool?.shiftLeft === "function") {
    spool.shiftLeft()
    return true
  }
  if (direction > 0 && typeof spool?.shiftRight === "function") {
    spool.shiftRight()
    return true
  }
  return false
}

function pageMarker(doc) {
  const place = readerPlace(doc)
  if (place) return place
  const pointed = footerMarker(doc)
  if (pointed) return pointed
  const pages = []
  const totals = []
  const visit = (root) => {
    if (!root?.querySelectorAll) return
    const elements = [...root.querySelectorAll("*")]
    for (const el of elements) if (el.shadowRoot) visit(el.shadowRoot)
    for (const el of elements) {
      const label = labelFromElement(el)
      const text = (el.textContent || "").replace(/\s+/g, " ").trim()
      const total = text.length <= 20 ? text.match(/^of\s+(\d+)$/i) : null
      if (!label && !total) continue
      const nested = [...el.querySelectorAll("*")].some((child) => {
        const childText = (child.textContent || "").replace(/\s+/g, " ").trim()
        return labelFromElement(child) || (childText.length <= 20 && /^of\s+\d+$/i.test(childText))
      })
      if (nested) continue
      const box = el.getBoundingClientRect?.()
      if (!box || box.width < 8 || box.height < 1 || box.width > 240) continue
      const spot = { top: box.top, left: box.left, width: box.width }
      if (label) pages.push({ ...label, ...spot })
      if (total) totals.push({ total: Number(total[1]), ...spot })
    }
  }
  const texts = []
  for (const node of relatedDocs(doc)) {
    visit(node.body || node)
    texts.push(readerText(node))
  }
  const view = doc.defaultView
  const width = view?.innerWidth || 800
  const height = view?.innerHeight || 800
  const center = width / 2
  const closest = (list) => list.reduce((nearest, candidate) => {
    const distance = Math.abs(candidate.left + candidate.width / 2 - center)
    return distance < nearest.distance ? { page: candidate, distance } : nearest
  }, { page: list[0], distance: Infinity }).page
  const footerPages = pages.filter((spot) => spot.top > height * 0.45)
  const choices = footerPages.length ? footerPages : pages
  const centered = choices.filter((spot) => {
    const mid = spot.left + spot.width / 2
    return mid > width * 0.36 && mid < width * 0.64
  })
  if (!centered.length) return choices.length ? null : pageMarkerFromText(texts.join("\n"))
  const page = closest(centered)
  if (page.total) return { start: page.start, end: page.end, total: page.total, label: page.label }
  const footerTotals = totals.filter((spot) => spot.top > height * 0.45)
  const totalChoices = footerTotals.length ? footerTotals : totals
  if (!totalChoices.length) return { start: page.start, end: page.end, total: page.total, label: page.label }
  const total = closest(totalChoices)
  return { start: page.start, end: page.end, total: total.total, label: `${page.label} of ${total.total}` }
}

function chapterLabel(doc, marker) {
  const view = doc.defaultView
  const top = (view?.innerHeight || 800) * 0.4
  const titles = []
  const walk = (root) => {
    if (!root?.querySelectorAll) return
    for (const el of root.querySelectorAll("div, span, p, h1, h2, button, a")) {
      const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()
      const box = el.getBoundingClientRect?.()
      if (!box || box.width < 1 || box.top < top) continue
      if (text.length < 2 || text.length > 80) continue
      if (/pp?\.\s*\d|of\s+\d+|^\d+\s*p$|table of contents/i.test(text)) continue
      titles.push({ text, top: box.top })
      if (el.shadowRoot) walk(el.shadowRoot)
    }
  }
  walk(doc)
  titles.sort((a, b) => a.top - b.top)
  return titles[0]?.text || (marker ? `Page ${marker.start}` : "Page")
}

function spreadPages(doc) {
  const pages = []
  const walk = (node, depth) => {
    if (!node || depth > 3) return
    if (depth > 0 && /<(p|h1|h2|h3|img|li)\b/i.test(node.body?.innerHTML || "")) {
      pages.push({ html: node.body.innerHTML, url: node.location?.href || doc.location?.href || "" })
    }
    for (const frame of node.querySelectorAll?.("iframe") || []) {
      try { if (frame.contentDocument) walk(frame.contentDocument, depth + 1) } catch { /* another origin */ }
    }
  }
  walk(doc, 0)
  if (pages.length) return pages
  let best = ""
  for (const el of doc.querySelectorAll("div, article, section")) {
    const text = (el.innerText || "").trim()
    if (text.length > 40 && /<(p|h1|h2)\b/i.test(el.innerHTML || "") && text.length > best.length) best = el.innerHTML
  }
  return best ? [{ html: best, url: doc.location?.href || "" }] : []
}

function spreadPainted(doc) {
  const limit = (doc.defaultView?.innerHeight || 800) * 0.78
  let text = ""
  let image = false
  const walk = (root) => {
    if (!root?.querySelectorAll) return
    for (const el of root.querySelectorAll("p, h1, h2, h3, li, img")) {
      const box = el.getBoundingClientRect?.()
      if (!box || box.bottom < 40 || box.top > limit) continue
      if (el.tagName === "IMG") {
        if (box.width > 140 && box.height > 140) image = true
      } else if (box.width > 8 && box.height > 8) text += ` ${el.innerText || el.textContent || ""}`
    }
    for (const frame of root.querySelectorAll("iframe")) {
      try { if (frame.contentDocument) walk(frame.contentDocument) } catch { /* another origin */ }
    }
  }
  walk(doc)
  text = text.replace(/\s+/g, " ").trim()
  if (text.length > 40) return text.slice(0, 240)
  return image ? "image" : ""
}

async function waitForTurn(doc, previous) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(100)
    const marker = pageMarker(doc)
    if (marker && marker.label !== previous) return marker
  }
  return pageMarker(doc)
}

function spreadBusy(doc) {
  const limit = (doc.defaultView?.innerHeight || 800) * 0.78
  let spinner = false
  let pending = false
  const walk = (root) => {
    if (!root?.querySelectorAll) return
    for (const el of root.querySelectorAll("img")) {
      const box = el.getBoundingClientRect?.()
      if (!box || box.bottom < 40 || box.top > limit || box.width < 16 || box.height < 16) continue
      if (box.width <= 140 && box.height <= 140) spinner = true
      else if (!el.complete || !el.naturalWidth) pending = true
    }
    for (const frame of root.querySelectorAll("iframe")) {
      try { if (frame.contentDocument) walk(frame.contentDocument) } catch { /* another origin */ }
    }
  }
  walk(doc)
  return { spinner, pending }
}

async function settleSpread(doc, previous) {
  let marker = null
  let sample = ""
  let steady = 0
  let held = ""
  let heldFor = 0
  let pendingFor = 0
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(200)
    marker = pageMarker(doc)
    const label = marker?.label || ""
    if (previous && label === previous) {
      sample = ""
      steady = 0
      held = ""
      heldFor = 0
      pendingFor = 0
      continue
    }
    if (label && label === held) heldFor += 1
    else {
      held = label
      heldFor = label ? 1 : 0
      sample = ""
      steady = 0
    }
    const busy = spreadBusy(doc)
    pendingFor = busy.pending ? pendingFor + 1 : 0
    const painted = spreadPainted(doc)
    const quiet = !busy.spinner && (!busy.pending || pendingFor >= 8)
    if (painted && painted === sample && heldFor >= 3 && quiet) {
      steady += 1
      if (steady >= 2) return marker
    } else {
      sample = painted
      steady = painted ? 1 : 0
    }
  }
  return pageMarker(doc)
}

async function blocksForSpread(doc) {
  const blocks = []
  for (const page of spreadPages(doc)) blocks.push(...blocksFromHtml(page.html, page.url))
  for (const block of blocks) {
    if (block.kind !== "image" || !block.src || block.jpeg) continue
    try {
      const imageResponse = await fetchWithin(block.src, 8000, { credentials: "include" })
      if (!imageResponse.ok) continue
      const image = await jpegBlock(await within(() => imageResponse.blob(), 8000))
      if (image) Object.assign(block, image)
    } catch { /* a missing picture should not stop the book */ }
  }
  return blocks
}

async function readRenderedBook(doc) {
  let marker = pageMarker(doc)
  if (!marker) throw new Error("The open page number was not found.")
  if (!doc.defaultView?.BIF?.context?.spool) {
    throw new Error("The Libby page turner was not found on this page.")
  }
  if (marker.start > 1) {
    reportLibby("Going to the first page")
    for (let guard = 0; guard < 500 && marker.start > 1; guard += 1) {
      const before = marker.label
      if (!turnSpread(doc, -1)) break
      const moved = await waitForTurn(doc, before)
      if (!moved || moved.label === before || moved.start >= marker.start) break
      marker = moved
    }
  }
  const chapters = []
  const seen = new Set()
  for (let guard = 0; guard < 500; guard += 1) {
    marker = await settleSpread(doc, "") || pageMarker(doc) || marker
    if (!marker) break
    if (seen.has(marker.label)) break
    seen.add(marker.label)
    reportLibby(`Reading ${marker.label}`)
    const blocks = await blocksForSpread(doc)
    const title = readerPlace(doc)?.title || chapterLabel(doc, marker)
    const current = chapters[chapters.length - 1]
    if (current && current.title === title) current.blocks.push(...blocks)
    else chapters.push({ title, blocks })
    if (marker.end >= marker.total) break
    const before = marker.label
    const floor = marker.end
    if (!turnSpread(doc, 1)) break
    const moved = await settleSpread(doc, before)
    if (!moved || moved.label === before || moved.start <= floor) break
    marker = moved
  }
  const filled = chapters.filter((chapter) => chapter.blocks.length)
  if (!filled.length) throw new Error("The open pages had no text.")
  return filled
}

async function saveLibbyBook(doc) {
  reportLibby("Reading the Libby book")
  const openbook = await loadOpenbook(doc).catch(() => null)
  const title = openbook ? bookTitle(openbook) : (doc.title || "Libby book")
  const chapters = await readRenderedBook(doc)
  reportLibby("Making the PDF")
  const pdf = buildLibbyPdf(chapters, title)
  const blob = new Blob([pdf], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = doc.createElement("a")
  link.href = url
  link.download = fileNameFor(title)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  reportLibby("PDF downloaded")
}

function exportLibbyBook(doc) {
  const host = doc?.location?.hostname || ""
  if (isLibbyAudioHost(host)) return Promise.resolve({ ok: false, reason: "This Libby title is audio, so there is no book PDF." })
  if (!isLibbyReaderHost(host)) return Promise.resolve({ ok: false, skip: true })
  return saveLibbyBook(doc).then(() => ({ ok: true })).catch((error) => ({ ok: false, reason: error?.message || "The Libby book did not save." }))
}

Object.assign(globalThis, {
  bookTitle, buildLibbyPdf, cfc1, decodeChapter, decodeOpenbook, descramble,
  exportLibbyBook, isLibbyAudioHost, isLibbyHost, isLibbyReaderHost, pageBook, pageMarkerFromText, spineParts,
})
})()
