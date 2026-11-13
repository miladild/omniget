const MAX_PAGES = 400
const PAGE_WAIT_MS = 8000
const LINE_CHARS = 85
const LINES_PER_SHEET = 48
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 54
const FONT_SIZE = 11
const LEADING = 14

function isOReillyHost(hostname) {
  return /(^|\.)oreilly\.com$/i.test(hostname || "") || /(^|\.)oreillystatic\.com$/i.test(hostname || "")
}

function bookFileName(documentTitle, firstHeading) {
  const raw = String(documentTitle || firstHeading || "oreilly-book")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return `${raw || "oreilly-book"}.pdf`
}

function samePage(left, right) {
  return left?.heading === right?.heading && left?.text === right?.text
}

function pickNextControl(controls) {
  const marked = (controls || []).filter((control) => control?.side === "next" && !control.disabled)
  if (marked.length > 0) return marked[marked.length - 1]
  const usable = (controls || []).filter((control) => {
    if (control?.disabled) return false
    const label = String(control?.label || "")
    if (!/\bnext\b/i.test(label)) return false
    if (/\b(prev|previous)\b/i.test(label)) return false
    return true
  })
  return usable.length > 0 ? usable[usable.length - 1] : null
}

function bookIsbn(href) {
  const match = String(href || "").match(/\/library\/view\/[^/]+\/(\d{10,13})(?:\/|$)/)
  return match ? match[1] : ""
}

function bookPrefix(href) {
  try {
    const path = new URL(href).pathname
    const match = path.match(/^(.*\/library\/view\/[^/]+\/[^/]+\/)/)
    return match ? match[1] : ""
  } catch {
    return ""
  }
}

function chapterHrefs(hrefs, currentHref) {
  const prefix = bookPrefix(currentHref)
  if (!prefix) return []
  const seen = new Set()
  const ordered = []
  for (const href of hrefs || []) {
    let path = ""
    try {
      path = new URL(href, currentHref).pathname
    } catch {
      continue
    }
    if (!path.startsWith(prefix) || seen.has(path)) continue
    seen.add(path)
    ordered.push(path)
  }
  return ordered
}

const BLOCK_STYLES = {
  h1: { font: "F2", size: 18, leading: 22, color: "0.18 0.22 0.28", gap: 12, breakBefore: true, highlight: true },
  h2: { font: "F2", size: 13, leading: 17, color: "0.12 0.12 0.12", gap: 8 },
  h3: { font: "F2", size: 12, leading: 16, color: "0.2 0.2 0.2", gap: 6 },
  h4: { font: "F2", size: 11, leading: 15, color: "0.25 0.25 0.25", gap: 4 },
  p: { font: "F1", size: 11, leading: 15, color: "0.1 0.1 0.1", gap: 8 },
  li: { font: "F1", size: 11, leading: 15, color: "0.1 0.1 0.1", gap: 3, indent: 14, bullet: true },
  quote: { font: "F1", size: 11, leading: 15, color: "0.28 0.28 0.28", gap: 8, indent: 16 },
  pre: { font: "F1", size: 9, leading: 12, color: "0.15 0.15 0.15", gap: 8, indent: 8 },
}

function wrapText(text, limit = LINE_CHARS) {
  const lines = []
  const paragraphs = String(text || "").replace(/\r\n/g, "\n").split("\n")
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push("")
      continue
    }
    let line = ""
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (next.length <= limit) {
        line = next
      } else {
        if (line) lines.push(line)
        line = word.length > limit ? word.slice(0, limit) : word
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

function chapterBlocks(page) {
  if (Array.isArray(page?.blocks) && page.blocks.length) return page.blocks
  const blocks = []
  if (page?.heading) blocks.push({ kind: "h1", text: page.heading })
  for (const chunk of String(page?.text || "").split(/\n{2,}|\n/)) {
    const text = chunk.trim()
    if (text) blocks.push({ kind: "p", text })
  }
  return blocks.length ? blocks : [{ kind: "p", text: "(empty)" }]
}

function linkFromHref(href) {
  const raw = String(href || "").trim()
  if (!raw || /^javascript:/i.test(raw) || raw.startsWith("#")) return null
  if (/^mailto:/i.test(raw)) return { type: "uri", href: raw }
  let url
  try { url = new URL(raw, "https://learning.oreilly.com/files/chapter.html") } catch { return null }
  const file = decodeURIComponent((url.pathname.split("/").pop() || "").split("?")[0]).toLowerCase()
  const numbered = file.match(/^(?:ch|chapter)0*(\d+)\b/i)
  if (numbered) return { type: "chapter", number: Number(numbered[1]), file }
  const oreilly = /(^|\.)oreilly\.com$/i.test(url.hostname) || /(^|\.)oreillystatic\.com$/i.test(url.hostname)
  if (oreilly && /\.x?html?$/i.test(file)) return { type: "file", file }
  if (/^https?:$/i.test(url.protocol)) return { type: "uri", href: url.href }
  return null
}

function chapterMentions(pieces) {
  const out = []
  for (const piece of pieces || []) {
    if (!piece?.text) continue
    if (piece.link) {
      out.push(piece)
      continue
    }
    const pattern = /\b((?:chapters?|chaps?|ch)\.?\s+)(\d{1,2})\b/gi
    let last = 0
    let match
    let found = false
    while ((match = pattern.exec(piece.text))) {
      found = true
      if (match.index > last) out.push({ text: piece.text.slice(last, match.index), link: null })
      out.push({ text: match[0], link: { type: "chapter", number: Number(match[2]) } })
      last = match.index + match[0].length
    }
    if (!found) out.push({ text: piece.text, link: null })
    else if (last < piece.text.length) out.push({ text: piece.text.slice(last), link: null })
  }
  return out
}

function chapterNumberFrom(file, heading) {
  const name = String(file || "").split("?")[0].split("/").pop().toLowerCase()
  const fromFile = name.match(/^(?:ch|chapter)0*(\d+)\b/i)
  if (fromFile) return { file: name, number: Number(fromFile[1]) }
  const fromHeading = String(heading || "").match(/^\s*chapter\s+(\d{1,2})\b/i) || String(heading || "").match(/^\s*(\d{1,2})\s*[.)]\s+\S/)
  return { file: name, number: fromHeading ? Number(fromHeading[1]) : 0 }
}

function sheetHasBody(lines) {
  return (lines || []).some((line) => line.image || line.tableRow || String(line.text || "").trim())
}

function layoutBlocks(blocks) {
  const top = PAGE_HEIGHT - MARGIN
  const bottom = MARGIN + 16
  const contentWidth = PAGE_WIDTH - MARGIN * 2
  const pageRoom = top - bottom
  const sheets = []
  let lines = []
  let y = top
  const nextSheet = () => {
    if (sheetHasBody(lines)) sheets.push(lines)
    lines = []
    y = top
  }
  const placeText = (text, font, size, color, x) => {
    if (lines.length && y - (size + 4) < bottom) nextSheet()
    y -= size + 4
    if (y < bottom && !lines.length) y = top - (size + 4)
    lines.push({ text, font, size, color, x, y })
  }
  const placeWrapped = (text, font, size, color, x, width) => {
    for (const line of wrapToWidth(text, size, width)) placeText(line, font, size, color, x)
  }
  const placeFigure = (block) => {
    const caption = String(block.caption || block.alt || "").replace(/\s+/g, " ").trim()
    if (!block.jpeg?.length || !block.pixelWidth || !block.pixelHeight) {
      if (caption) placeWrapped(caption, "F1", 10, "0.35 0.35 0.35", MARGIN, contentWidth)
      return
    }
    let w = block.pixelWidth * 72 / 110
    let h = block.pixelHeight * 72 / 110
    const captionLines = caption ? wrapToWidth(caption, 9, contentWidth) : []
    const captionHeight = captionLines.length ? captionLines.length * 13 + 8 : 0
    const maxH = Math.max(72, pageRoom - captionHeight)
    if (w > contentWidth) {
      h *= contentWidth / w
      w = contentWidth
    }
    if (h > maxH) {
      w *= maxH / h
      h = maxH
    }
    const needed = h + captionHeight
    if (lines.length && needed <= pageRoom && y - needed < bottom) nextSheet()
    const available = Math.max(36, y - bottom - captionHeight)
    if (h > available) {
      w *= available / h
      h = available
    }
    y -= h
    lines.push({
      image: true,
      jpeg: block.jpeg,
      pixelWidth: block.pixelWidth,
      pixelHeight: block.pixelHeight,
      x: MARGIN + Math.max(0, (contentWidth - w) / 2),
      y,
      w,
      h,
    })
    y -= 4
    for (const text of captionLines) {
      y -= 13
      lines.push({ text, font: "F1", size: 9, color: "0.35 0.35 0.35", x: MARGIN, y })
    }
    y -= 8
  }
  const placeTable = (block) => {
    const rows = (block.rows || []).filter((row) => row.some((cell) => String(cell || "").trim()))
    if (!rows.length) {
      if (block.caption) placeWrapped(block.caption, "F2", 10, "0.2 0.2 0.2", MARGIN, contentWidth)
      return
    }
    const cols = Math.max(...rows.map((row) => row.length))
    const fontSize = cols > 6 ? 8 : 9
    const leading = fontSize + 3
    const pad = 3
    const natural = Array.from({ length: cols }, () => 40)
    for (const row of rows) {
      row.forEach((cell, index) => {
        const widest = String(cell || "").split("\n").reduce((max, line) => Math.max(max, textWidth(line, fontSize)), 0)
        natural[index] = Math.max(natural[index], Math.min(widest + pad * 2, 280))
      })
    }
    const used = natural.reduce((sum, width) => sum + width, 0)
    const colWidths = natural.map((width) => (width / used) * contentWidth)
    const prepared = rows.map((row) => {
      const cells = Array.from({ length: cols }, (_, index) => {
        return wrapToWidth(row[index] || "", fontSize, Math.max(12, colWidths[index] - pad * 2))
      })
      const height = Math.max(...cells.map((cell) => cell.length), 1) * leading + pad * 2
      return { cells, height }
    })
    const pageBody = top - bottom
    const headerAllowance = block.header ? Math.min(prepared[0]?.height || 0, pageBody / 3) : 0
    const maxLines = Math.max(1, Math.floor((pageBody - headerAllowance - pad * 2) / leading))
    const fitted = []
    for (const row of prepared) {
      const tallest = Math.max(...row.cells.map((cell) => cell.length), 1)
      if (tallest <= maxLines) {
        fitted.push(row)
        continue
      }
      for (let offset = 0; offset < tallest; offset += maxLines) {
        const cells = row.cells.map((cell) => cell.slice(offset, offset + maxLines))
        const used = Math.max(...cells.map((cell) => cell.length), 1)
        fitted.push({ cells, height: used * leading + pad * 2 })
      }
    }
    const captionLines = block.caption ? wrapToWidth(block.caption, 10, contentWidth) : []
    const opening = captionLines.length * 14 + (fitted[0]?.height || 0) + (fitted[1]?.height || 0)
    if (lines.length && opening < pageBody && y - opening < bottom) nextSheet()
    for (const line of captionLines) placeText(line, "F2", 10, "0.2 0.2 0.2", MARGIN)
    let header = null
    const drawRow = (row, isHeader) => {
      if (lines.length && y - row.height < bottom) {
        nextSheet()
        if (header && !isHeader) drawRow(header, true)
      }
      y -= row.height
      lines.push({
        tableRow: true,
        x: MARGIN,
        y,
        height: row.height,
        width: contentWidth,
        cells: row.cells,
        colWidths,
        fontSize,
        leading,
        pad,
        header: isHeader,
      })
    }
    fitted.forEach((row, index) => {
      const isHeader = index === 0 && block.header !== false && Boolean(block.header)
      if (isHeader) header = row
      drawRow(row, isHeader)
    })
    y -= 10
  }
  const placeLines = (style, wrapped) => {
    if (!wrapped.length) return
    let index = 0
    while (index < wrapped.length) {
      let room = Math.floor((y - bottom) / style.leading)
      if (room < 1) {
        if (lines.length) {
          nextSheet()
          continue
        }
        room = Math.max(1, Math.floor(pageRoom / style.leading))
      }
      const left = wrapped.length - index
      let take = Math.min(room, left)
      if (lines.length && left > take && take < 2 && left >= 2) {
        nextSheet()
        continue
      }
      if (left > take && left - take === 1 && take > 2) take -= 1
      for (let step = 0; step < take; step += 1) {
        const at = index + step
        const x = MARGIN + (style.indent || 0)
        let runs = wrapped[at].map((run) => ({ text: run.text, link: run.link || null }))
        if (style.bullet && at === 0) runs = [{ text: "• ", link: null }, ...runs]
        y -= style.leading
        const links = []
        let cursor = x
        const text = runs.map((run) => run.text).join("")
        for (const run of runs) {
          const width = textWidth(run.text, style.size)
          if (run.link) {
            const last = links[links.length - 1]
            const same = last && JSON.stringify(last.link) === JSON.stringify(run.link) && Math.abs(last.x + last.w - cursor) < 0.8
            if (same) last.w += width
            else links.push({ x: cursor, w: width, link: run.link })
          }
          cursor += width
        }
        lines.push({
          text,
          runs,
          links,
          font: style.font,
          size: style.size,
          color: style.color,
          x,
          y,
          highlight: Boolean(style.highlight && at === 0),
          rule: Boolean(style.rule && at === wrapped.length - 1),
        })
        if (style.rule && at === wrapped.length - 1) y -= 6
      }
      index += take
      if (index < wrapped.length) nextSheet()
    }
    y -= style.gap || 0
  }
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]
    if (block.kind === "skip") continue
    if (block.kind === "table") {
      placeTable(block)
      continue
    }
    if (block.kind === "img" || block.kind === "svg") {
      placeFigure(block)
      continue
    }
    const style = BLOCK_STYLES[block.kind] || BLOCK_STYLES.p
    if (style.breakBefore && lines.length) nextSheet()
    if (/^h[1-4]$/.test(block.kind) && lines.length) {
      const next = blocks[blockIndex + 1]
      const portrait = next && (next.kind === "img" || next.kind === "svg") && next.pixelHeight > next.pixelWidth * 1.2
      const reserve = portrait ? 0 : style.leading + (style.gap || 0) + ((BLOCK_STYLES[next?.kind] || BLOCK_STYLES.p).leading * 2)
      if (reserve && y - reserve < bottom) nextSheet()
    }
    const width = Math.max(24, contentWidth - (style.indent || 0))
    const source = block.pieces?.length ? block.pieces : [{ text: block.text || "", link: null }]
    const linked = block.kind === "h1" || block.kind === "pre" ? source : chapterMentions(source)
    const wrapped = block.kind === "pre"
      ? String(block.text || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => [{ text: line, link: null }])
      : wrapPieces(linked, style.size, width)
    const blockHeight = wrapped.length * style.leading + (style.gap || 0)
    if ((block.kind === "pre" || block.kind === "quote") && wrapped.length > 1 && wrapped.length <= 12 && blockHeight <= pageRoom && lines.length && y - blockHeight < bottom) {
      nextSheet()
    }
    placeLines(style, wrapped)
  }
  if (sheetHasBody(lines)) sheets.push(lines)
  return sheets.filter(sheetHasBody)
}

function paginateBook(pages) {
  const sheets = []
  for (const page of pages || []) sheets.push(...layoutBlocks(chapterBlocks(page)))
  return sheets.length ? sheets : [[]]
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

function chunksForWidth(word, size, maxWidth) {
  if (textWidth(word, size) <= maxWidth) return [word]
  const parts = []
  let chunk = ""
  for (const char of word) {
    const next = chunk + char
    if (chunk && textWidth(next, size) > maxWidth) {
      parts.push(chunk)
      chunk = char
    } else chunk = next
  }
  if (chunk) parts.push(chunk)
  return parts.length ? parts : [word]
}

function wrapToWidth(text, size, maxWidth) {
  const paragraphs = String(text || "").replace(/\r\n/g, "\n").split("\n")
  const lines = []
  for (const paragraph of paragraphs) {
    const words = paragraph.replace(/[ \t]+/g, " ").trim().split(" ").filter(Boolean)
    if (!words.length) continue
    let line = ""
    for (const word of words) {
      for (const piece of chunksForWidth(word, size, maxWidth)) {
        const next = line ? `${line} ${piece}` : piece
        if (textWidth(next, size) <= maxWidth) line = next
        else {
          if (line) lines.push(line)
          line = piece
        }
      }
    }
    if (line) lines.push(line)
  }
  return lines.length ? lines : [""]
}

function wrapPieces(pieces, size, maxWidth) {
  const tokens = []
  for (const piece of pieces || []) {
    const parts = String(piece?.text || "").split(/(\s+)/).filter((part) => part !== "")
    for (const part of parts) {
      if (/^\s+$/.test(part)) tokens.push({ space: true, link: piece.link || null })
      else for (const chunk of chunksForWidth(part, size, maxWidth)) tokens.push({ text: chunk, link: piece.link || null })
    }
  }
  const lines = []
  let runs = []
  let width = 0
  const flush = () => {
    while (runs[0]?.text === " ") runs.shift()
    while (runs.at(-1)?.text === " ") runs.pop()
    if (runs.length) lines.push(runs)
    runs = []
    width = 0
  }
  for (const token of tokens) {
    if (token.space) {
      if (!runs.length) continue
      const spaceWidth = textWidth(" ", size)
      if (width + spaceWidth > maxWidth) {
        flush()
        continue
      }
      runs.push({ text: " ", link: token.link || null })
      width += spaceWidth
      continue
    }
    const wordWidth = textWidth(token.text, size)
    if (runs.length && width + wordWidth > maxWidth) flush()
    runs.push({ text: token.text, link: token.link })
    width += wordWidth
  }
  flush()
  return lines
}

function layoutContents(entries, bookTitle) {
  const size = 11
  const leading = 16
  const top = PAGE_HEIGHT - MARGIN
  const bottom = MARGIN + 28
  const right = PAGE_WIDTH - MARGIN
  const indexWidth = 28
  const titleX = MARGIN + indexWidth
  const sheets = []
  let lines = []
  let y = top
  const add = (line) => {
    const gap = line.gapBefore || 0
    if (lines.length && y - gap - leading < bottom) {
      sheets.push(lines)
      lines = []
      y = top
    }
    y -= gap
    y -= leading
    lines.push({ ...line, y })
  }
  add({
    text: "Contents",
    font: "F2",
    size: 20,
    color: "0.18 0.22 0.28",
    x: MARGIN,
    highlight: true,
    gapBefore: 4,
  })
  if (bookTitle) {
    add({ text: bookTitle, font: "F1", size: 10, color: "0.4 0.4 0.4", x: MARGIN, gapBefore: 4 })
  }
  y -= 8
  entries.forEach((entry, index) => {
    const pageText = String(entry.page)
    const pageWidth = textWidth(pageText, size)
    const pageX = right - pageWidth
    const maxTitle = pageX - titleX - 18
    const wrapped = wrapToWidth(entry.title || "Chapter", size, maxTitle)
    const titleWidth = textWidth(wrapped[0], size)
    add({
      text: String(index + 1),
      font: "F2",
      size,
      color: "0.35 0.42 0.50",
      x: MARGIN,
      gapBefore: index === 0 ? 0 : 4,
      destPage: entry.page,
    })
    const rowY = lines[lines.length - 1].y
    lines.push({
      text: wrapped[0],
      font: "F1",
      size,
      color: "0.12 0.12 0.12",
      x: titleX,
      y: rowY,
      leader: { from: titleX + titleWidth + 6, to: pageX - 8 },
      pageText,
      pageX,
      destPage: entry.page,
    })
    for (const extra of wrapped.slice(1)) {
      add({ text: extra, font: "F1", size, color: "0.12 0.12 0.12", x: titleX, destPage: entry.page })
    }
  })
  if (sheetHasBody(lines)) sheets.push(lines)
  return sheets.filter(sheetHasBody)
}

function bookLabel(title) {
  const parts = String(title || "").split("|").map((part) => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || ""
}

const WIN_ANSI_BYTES = {
  "\u20ac": 0x80,
  "\u201a": 0x82,
  "\u0192": 0x83,
  "\u201e": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u02c6": 0x88,
  "\u2030": 0x89,
  "\u0160": 0x8a,
  "\u2039": 0x8b,
  "\u0152": 0x8c,
  "\u017d": 0x8e,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201c": 0x93,
  "\u201d": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u02dc": 0x98,
  "\u2122": 0x99,
  "\u0161": 0x9a,
  "\u203a": 0x9b,
  "\u0153": 0x9c,
  "\u017e": 0x9e,
  "\u0178": 0x9f,
}

function winAnsiByte(char) {
  const code = char.codePointAt(0)
  if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return code
  return WIN_ANSI_BYTES[char] ?? -1
}

function pdfEscape(value) {
  let out = ""
  for (const char of String(value)) {
    const byte = winAnsiByte(char)
    if (byte < 0) {
      if (/\s/u.test(char)) out += " "
      continue
    }
    if (byte === 0x5c) out += "\\\\"
    else if (byte === 0x28) out += "\\("
    else if (byte === 0x29) out += "\\)"
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`
    else out += String.fromCharCode(byte)
  }
  return out
}

const LINK_BLUE = "0.12 0.35 0.62"

function pdfNum(value) {
  return Number(value || 0).toFixed(2)
}

function paintSheet(lines, label, pageNumber, cover = false) {
  const commands = cover ? [] : ["0.85 0.85 0.85 RG", "0.6 w", `${MARGIN} ${PAGE_HEIGHT - 36} m ${PAGE_WIDTH - MARGIN} ${PAGE_HEIGHT - 36} l S`]
  for (const line of lines) {
    if (line.image && line.name) {
      commands.push("q")
      commands.push(`${pdfNum(line.w)} 0 0 ${pdfNum(line.h)} ${pdfNum(line.x)} ${pdfNum(line.y)} cm`)
      commands.push(`/${line.name} Do`)
      commands.push("Q")
      continue
    }
    if (line.tableRow) {
      let cursor = line.x
      line.cells.forEach((cell, index) => {
        const colWidth = line.colWidths[index]
        if (line.header) {
          commands.push("0.94 0.94 0.94 rg")
          commands.push(`${pdfNum(cursor)} ${pdfNum(line.y)} ${pdfNum(colWidth)} ${pdfNum(line.height)} re f`)
        }
        commands.push("0.72 0.72 0.72 RG")
        commands.push("0.6 w")
        commands.push(`${pdfNum(cursor)} ${pdfNum(line.y)} ${pdfNum(colWidth)} ${pdfNum(line.height)} re S`)
        cell.forEach((text, row) => {
          if (!text) return
          const textY = line.y + line.height - line.pad - line.fontSize - row * line.leading
          commands.push("BT")
          commands.push(line.header ? "0.1 0.1 0.1 rg" : "0.12 0.12 0.12 rg")
          commands.push(`/${line.header ? "F2" : "F1"} ${line.fontSize} Tf`)
          commands.push(`1 0 0 1 ${pdfNum(cursor + line.pad)} ${pdfNum(textY)} Tm`)
          commands.push(`(${pdfEscape(text)}) Tj`)
          commands.push("ET")
        })
        cursor += colWidth
      })
      continue
    }
    if (!line.text) continue
    if (line.highlight) {
      commands.push("0.93 0.94 0.95 rg")
      commands.push(`${MARGIN - 8} ${line.y - 5} ${PAGE_WIDTH - MARGIN * 2 + 16} ${line.size + 10} re f`)
    }
    const linkedRuns = (line.runs || []).some((run) => run.link && run.text.trim())
    if (linkedRuns) {
      let cursor = line.x
      let span = null
      const paintSpan = () => {
        if (!span) return
        commands.push("BT")
        commands.push(`${LINK_BLUE} rg`)
        commands.push(`/${line.font} ${line.size} Tf`)
        commands.push(`1 0 0 1 ${pdfNum(span.x)} ${pdfNum(line.y)} Tm`)
        commands.push(`(${pdfEscape(span.text)}) Tj`)
        commands.push("ET")
        commands.push(`${LINK_BLUE} RG`)
        commands.push("0.6 w")
        commands.push(`${pdfNum(span.x)} ${pdfNum(line.y - 1.5)} m ${pdfNum(span.x + span.w)} ${pdfNum(line.y - 1.5)} l S`)
        span = null
      }
      for (const run of line.runs) {
        const width = textWidth(run.text, line.size)
        if (run.link) {
          const same = span && JSON.stringify(span.link) === JSON.stringify(run.link)
          if (same) {
            span.text += run.text
            span.w += width
          } else {
            paintSpan()
            span = { x: cursor, w: width, text: run.text, link: run.link }
          }
        } else {
          paintSpan()
          commands.push("BT")
          commands.push(`${line.color} rg`)
          commands.push(`/${line.font} ${line.size} Tf`)
          commands.push(`1 0 0 1 ${pdfNum(cursor)} ${pdfNum(line.y)} Tm`)
          commands.push(`(${pdfEscape(run.text)}) Tj`)
          commands.push("ET")
        }
        cursor += width
      }
      paintSpan()
    } else {
      const linkedLine = Boolean(line.destPage)
      commands.push("BT")
      commands.push(`${linkedLine ? LINK_BLUE : line.color} rg`)
      commands.push(`/${line.font} ${line.size} Tf`)
      commands.push(`1 0 0 1 ${line.x} ${line.y} Tm`)
      commands.push(`(${pdfEscape(line.text)}) Tj`)
      commands.push("ET")
      if (linkedLine) {
        const width = textWidth(line.text, line.size)
        commands.push(`${LINK_BLUE} RG`)
        commands.push("0.6 w")
        commands.push(`${pdfNum(line.x)} ${pdfNum(line.y - 1.5)} m ${pdfNum(line.x + width)} ${pdfNum(line.y - 1.5)} l S`)
      }
    }
    if (line.leader && line.leader.to - line.leader.from > 6) {
      commands.push("0.65 0.65 0.65 RG")
      commands.push("1 J")
      commands.push("0.8 w")
      commands.push("[0.4 3] 0 d")
      commands.push(`${line.leader.from} ${line.y + 2} m ${line.leader.to} ${line.y + 2} l S`)
      commands.push("[] 0 d")
      commands.push("0 J")
    }
    if (line.pageText) {
      commands.push("BT")
      commands.push("0.12 0.12 0.12 rg")
      commands.push(`/F1 ${line.size} Tf`)
      commands.push(`1 0 0 1 ${line.pageX} ${line.y} Tm`)
      commands.push(`(${pdfEscape(line.pageText)}) Tj`)
      commands.push("ET")
    }
    if (line.rule) {
      commands.push("0.55 0.09 0.11 RG")
      commands.push("1.2 w")
      commands.push(`${line.x} ${line.y - 5} m ${line.x + 84} ${line.y - 5} l S`)
    }
  }
  if (!cover) {
  commands.push("BT")
  commands.push("0.4 0.4 0.4 rg")
  commands.push("/F1 9 Tf")
  commands.push(`1 0 0 1 ${MARGIN} 32 Tm`)
  commands.push(`(${pdfEscape(label)}) Tj`)
  commands.push("ET")
  const pageLabel = String(pageNumber)
  const pageX = PAGE_WIDTH - MARGIN - textWidth(pageLabel, 9)
  commands.push("BT")
  commands.push("0.4 0.4 0.4 rg")
  commands.push("/F1 9 Tf")
  commands.push(`1 0 0 1 ${pageX} 32 Tm`)
  commands.push(`(${pageLabel}) Tj`)
  commands.push("ET")
  }
  return commands.join("\n")
}

function layoutCover(cover) {
  if (!cover?.jpeg?.length || !cover.pixelWidth || !cover.pixelHeight) return []
  const maxW = PAGE_WIDTH - 36
  const maxH = PAGE_HEIGHT - 36
  const fit = Math.min(maxW / cover.pixelWidth, maxH / cover.pixelHeight)
  const w = cover.pixelWidth * fit
  const h = cover.pixelHeight * fit
  return [[{
    image: true,
    jpeg: cover.jpeg,
    pixelWidth: cover.pixelWidth,
    pixelHeight: cover.pixelHeight,
    x: (PAGE_WIDTH - w) / 2,
    y: (PAGE_HEIGHT - h) / 2,
    w,
    h,
  }]]
}

function pageAnnotations(lines, rendered, chapters) {
  const annots = []
  const add = (rect, action) => {
    annots.push(`<< /Type /Annot /Subtype /Link /Rect [${rect}] /Border [0 0 0] ${action} >>`)
  }
  for (const line of lines || []) {
    if (line.destPage) {
      const target = rendered[line.destPage - 1]
      if (target) {
        add(
          `${pdfNum(MARGIN - 4)} ${pdfNum(Math.max(0, line.y - 3))} ${pdfNum(PAGE_WIDTH - MARGIN + 4)} ${pdfNum(line.y + (line.size || 11) + 3)}`,
          `/Dest [${target.pageId} 0 R /XYZ 0 ${PAGE_HEIGHT} null]`,
        )
      }
    }
    for (const mark of line.links || []) {
      const rect = `${pdfNum(mark.x)} ${pdfNum(Math.max(0, line.y - 2))} ${pdfNum(mark.x + mark.w)} ${pdfNum(line.y + (line.size || 11) + 2)}`
      if (mark.link?.type === "uri" && mark.link.href) {
        add(rect, `/A << /S /URI /URI (${pdfEscape(mark.link.href)}) >>`)
        continue
      }
      const chapter = (chapters || []).find((item) => {
        if (mark.link?.type === "file") return item.file === mark.link.file
        return mark.link?.type === "chapter" && item.number && item.number === mark.link.number
      })
      const target = chapter ? rendered[chapter.pageIndex] : null
      if (target) add(rect, `/Dest [${target.pageId} 0 R /XYZ 0 ${PAGE_HEIGHT} null]`)
    }
  }
  return annots.length ? ` /Annots [${annots.join(" ")}]` : ""
}

function buildBookPdf(pages, sourceTitle = "", cover = null) {
  const chapters = (pages || []).map((page) => {
    const blocks = chapterBlocks(page)
    const title = page?.heading || blocks.find((block) => block.kind === "h1")?.text || "Chapter"
    const identity = chapterNumberFrom(page?.file, title)
    return { title, file: identity.file, number: identity.number, sheets: layoutBlocks(blocks) }
  }).filter((chapter) => chapter.sheets.length)
  const coverSheets = layoutCover(cover)
  const chapterEntries = (offset) => chapters.map((chapter, index) => ({
    title: chapter.title,
    page: offset + 1 + chapters.slice(0, index).reduce((sum, item) => sum + item.sheets.length, 0),
  }))
  let entries = [
    ...(coverSheets.length ? [{ title: "Cover", page: 1 }] : []),
    ...chapterEntries(coverSheets.length + 1),
  ]
  let tocSheets = layoutContents(entries, bookLabel(sourceTitle))
  for (let pass = 0; pass < 3; pass += 1) {
    const offset = coverSheets.length + tocSheets.length
    entries = [
      ...(coverSheets.length ? [{ title: "Cover", page: 1 }] : []),
      ...chapterEntries(offset),
    ]
    const next = layoutContents(entries, bookLabel(sourceTitle))
    const previous = tocSheets.length
    tocSheets = next
    if (next.length === previous) break
  }
  const assembled = [
    ...coverSheets.map((lines) => ({ lines, label: "Cover", cover: true })),
    ...tocSheets.map((lines) => ({ lines, label: "Contents" })),
    ...chapters.flatMap((chapter) => chapter.sheets.map((lines) => ({ lines, label: chapter.title }))),
  ]
  if (!assembled.length) assembled.push({ lines: [], label: "Contents" })

  const bodies = new Map()
  const pageIds = []
  const outlineRoot = 5
  let nextId = 6
  const rendered = assembled.map((sheet, index) => {
    const pageId = nextId
    const streamId = nextId + 1
    nextId += 2
    pageIds.push(pageId)
    const images = []
    for (const line of sheet.lines) {
      if (!line.image || !line.jpeg?.length) continue
      const objectId = nextId
      nextId += 1
      line.name = `Im${objectId}`
      const image = { jpeg: line.jpeg, pixelWidth: line.pixelWidth, pixelHeight: line.pixelHeight }
      bodies.set(objectId, image)
      images.push({ name: line.name, objectId })
    }
    const stream = paintSheet(sheet.lines, sheet.label, index + 1, sheet.cover)
    return { pageId, streamId, stream, images, lines: sheet.lines }
  })
  const outlineItems = []
  let cursor = coverSheets.length + tocSheets.length
  chapters.forEach((chapter) => {
    chapter.pageIndex = cursor
    outlineItems.push({ id: nextId, title: chapter.title, pageId: rendered[cursor]?.pageId || rendered[0].pageId })
    nextId += 1
    cursor += chapter.sheets.length
  })
  const contentsPage = rendered[coverSheets.length]
  if (contentsPage) {
    outlineItems.unshift({ id: nextId, title: "Contents", pageId: contentsPage.pageId })
    nextId += 1
  }
  if (coverSheets.length && rendered[0]) {
    outlineItems.unshift({ id: nextId, title: "Cover", pageId: rendered[0].pageId })
    nextId += 1
  }

  bodies.set(1, `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRoot} 0 R >>`)
  bodies.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`)
  bodies.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
  bodies.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
  for (const page of rendered) {
    const xobjects = page.images.map((image) => `/${image.name} ${image.objectId} 0 R`).join(" ")
    const resources = xobjects
      ? `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects} >> >>`
      : "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>"
    const annots = pageAnnotations(page.lines, rendered, chapters)
    bodies.set(
      page.pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${page.streamId} 0 R ${resources}${annots} >>`,
    )
    bodies.set(page.streamId, `<< /Length ${page.stream.length} >>\nstream\n${page.stream}\nendstream`)
  }
  const orderedOutlines = outlineItems
  bodies.set(
    outlineRoot,
    `<< /Type /Outlines /First ${orderedOutlines[0]?.id || 0} 0 R /Last ${orderedOutlines[orderedOutlines.length - 1]?.id || 0} 0 R /Count ${orderedOutlines.length} >>`,
  )
  orderedOutlines.forEach((item, index) => {
    const prev = orderedOutlines[index - 1]
    const next = orderedOutlines[index + 1]
    bodies.set(
      item.id,
      `<< /Title (${pdfEscape(item.title)}) /Parent ${outlineRoot} 0 R /Dest [${item.pageId} 0 R /Fit]${prev ? ` /Prev ${prev.id} 0 R` : ""}${next ? ` /Next ${next.id} 0 R` : ""} >>`,
    )
  })

  const encoder = new TextEncoder()
  const chunks = [encoder.encode("%PDF-1.4\n")]
  let written = chunks[0].length
  const offsets = [0]
  const ids = [...bodies.keys()].sort((a, b) => a - b)
  for (const id of ids) {
    offsets[id] = written
    const body = bodies.get(id)
    const bytes = body?.jpeg
      ? [
          encoder.encode(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${body.pixelWidth} /Height ${body.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${body.jpeg.length} >>\nstream\n`),
          body.jpeg,
          encoder.encode("\nendstream\nendobj\n"),
        ]
      : [encoder.encode(`${id} 0 obj\n${body}\nendobj\n`)]
    for (const part of bytes) {
      chunks.push(part)
      written += part.length
    }
  }
  const xrefAt = written
  let xref = `xref\n0 ${ids.length + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= ids.length; id += 1) {
    xref += `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${ids.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  chunks.push(encoder.encode(xref))
  const total = chunks.reduce((sum, part) => sum + part.length, 0)
  const pdf = new Uint8Array(total)
  let offset = 0
  for (const part of chunks) {
    pdf.set(part, offset)
    offset += part.length
  }
  return pdf
}

async function collectBookPages({ read, pickNext, activate, waitForChange, onPage, maxPages = MAX_PAGES }) {
  const pages = []
  for (let index = 0; index < maxPages; index += 1) {
    const page = read()
    if (!page?.text) break
    if (pages.length > 0 && samePage(pages[pages.length - 1], page)) break
    pages.push(page)
    onPage?.(pages.length, page.heading)
    const control = pickNext()
    if (!control) break
    activate(control)
    const changed = await waitForChange(page)
    if (!changed) break
  }
  return pages
}

function readReaderPage(doc) {
  const headingEl = doc.querySelector?.("h1")
  const heading = (headingEl?.textContent || "").trim()
  const chapter = doc.querySelector?.(".orm-ChapterReader-readerContainer")
  const scope = chapter || headingEl?.parentElement || doc.querySelector?.("main") || doc.body
  const text = (scope?.innerText || scope?.textContent || "").replace(/[ \t]+\n/g, "\n").trim()
  return { heading, text }
}

function nextPageUrl(linkHref, currentHref) {
  try {
    const next = new URL(linkHref || "", currentHref)
    const here = new URL(currentHref)
    if (!next.pathname || next.pathname === here.pathname) return ""
    return next.href
  } catch {
    return ""
  }
}

function nextChapterLink(doc) {
  const progress = doc.querySelector?.(".orm-ProgressBar-bar")
  if (!progress) return null
  let bar = progress.parentElement
  while (bar && bar.querySelectorAll("a.orm-Link-root").length < 1) bar = bar.parentElement
  if (!bar?.getBoundingClientRect) return null
  const bounds = bar.getBoundingClientRect()
  const mid = bounds.left + bounds.width / 2
  const links = [...bar.querySelectorAll("a.orm-Link-root")].filter((link) => {
    if (link.getAttribute("aria-disabled") === "true") return false
    const box = link.getBoundingClientRect()
    return box.width > 0 && box.width < 80 && box.left > mid
  })
  return links.length > 0 ? links[links.length - 1] : null
}

function contentsLinks(doc) {
  const label = [...doc.querySelectorAll("button, [role='tab'], h2, div, span")].find((element) => {
    return (element.childNodes.length <= 1) && (element.textContent || "").trim() === "Contents"
  })
  let root = label?.parentElement || null
  while (root && root.querySelectorAll("a.orm-Link-root").length < 3) root = root.parentElement
  if (!root || root === doc.body || root === doc.documentElement) return []
  return [...root.querySelectorAll("a.orm-Link-root")]
}

function listReaderControls(doc) {
  const controls = [...doc.querySelectorAll("a, button")].map((element) => ({
    label: [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("rel"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    disabled: Boolean(element.disabled) || element.getAttribute("aria-disabled") === "true",
    element,
  }))
  const next = nextChapterLink(doc)
  if (next) controls.push({ label: (next.textContent || "Next").trim() || "Next", side: "next", disabled: false, element: next })
  return controls
}

function waitForReaderChange(doc, before) {
  return new Promise((resolve) => {
    const started = Date.now()
    let stable = null
    let stableReads = 0
    const timer = setInterval(() => {
      const current = readReaderPage(doc)
      if (samePage(before, current)) {
        stable = null
        stableReads = 0
      } else if (stable && samePage(stable, current)) {
        stableReads += 1
        if (stableReads >= 2) {
          clearInterval(timer)
          resolve(true)
        }
      } else {
        stable = current
        stableReads = 0
      }
      if (Date.now() - started >= PAGE_WAIT_MS) {
        clearInterval(timer)
        resolve(!samePage(before, readReaderPage(doc)))
      }
    }, 250)
  })
}

async function collectContentsPages(doc, onPage) {
  const prefix = bookPrefix(doc.location?.href || globalThis.location?.href || "")
  const links = contentsLinks(doc).filter((link) => {
    try {
      return new URL(link.href, doc.location?.href || globalThis.location.href).pathname.startsWith(prefix)
    } catch {
      return false
    }
  })
  const hrefs = chapterHrefs(links.map((link) => link.href), doc.location?.href || globalThis.location?.href || "")
  if (hrefs.length < 2) return null
  const pages = []
  for (const path of hrefs) {
    const link = links.find((item) => {
      try {
        return new URL(item.href, doc.location?.href || globalThis.location.href).pathname === path
      } catch {
        return false
      }
    })
    const before = readReaderPage(doc)
    const here = new URL(doc.location?.href || globalThis.location.href).pathname
    if (here !== path && link) {
      link.click()
      await waitForReaderChange(doc, before)
    }
    const page = readReaderPage(doc)
    if (!page?.text || (pages.length > 0 && samePage(pages[pages.length - 1], page))) continue
    pages.push(page)
    onPage?.(pages.length, page.heading)
  }
  return pages.length > 0 ? pages : null
}

const EXPORT_JOB_KEY = "omniget-oreilly-job"

function readExportJob() {
  try {
    return JSON.parse(sessionStorage.getItem(EXPORT_JOB_KEY) || "null")
  } catch {
    return null
  }
}

function writeExportJob(job) {
  sessionStorage.setItem(EXPORT_JOB_KEY, JSON.stringify(job))
}

function reportExport(job, line) {
  job.log = [...(job.log || []), line].slice(-20)
  console.info("[omniget]", line)
  try {
    chrome.runtime?.sendMessage?.({ type: "omniget-oreilly-progress", line })
  } catch { /* the popup may already be closed */ }
}

function whenChapterReady(doc) {
  return new Promise((resolve) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const page = readReaderPage(doc)
      const ready = page.heading && page.text.length > 80
      if (ready || Date.now() - started >= PAGE_WAIT_MS) {
        clearInterval(timer)
        resolve(page)
      }
    }, 200)
  })
}

async function continueExport(doc) {
  const job = readExportJob()
  if (!job?.active) return
  const page = await whenChapterReady(doc)
  const path = location.pathname
  if (job.pending && job.pending !== path) {
    reportExport(job, `Still on ${path}`)
    writeExportJob(job)
    return
  }
  job.pending = ""
  if (page.text && !job.pages.some((item) => item.path === path)) {
    job.pages.push({ path, heading: page.heading, text: page.text })
  }
  const next = nextPageUrl(nextChapterLink(doc)?.href, location.href)
  let nextPath = ""
  try { nextPath = next ? new URL(next).pathname : "" } catch { nextPath = "" }
  const repeated = nextPath && job.pages.some((item) => item.path === nextPath)
  if (!next || repeated || job.pages.length >= MAX_PAGES) {
    reportExport(job, next ? `Saving ${job.pages.length}` : `No next chapter. Saving ${job.pages.length}`)
    try {
      downloadPdf(buildBookPdf(job.pages), bookFileName(doc.title, job.pages[0]?.heading))
      reportExport(job, "Saved")
      sessionStorage.removeItem(EXPORT_JOB_KEY)
    } catch (error) {
      console.error("[omniget]", error)
      reportExport(job, "Export failed")
      writeExportJob({ ...job, active: false })
    }
    const button = document.getElementById("omniget-oreilly-pdf")
    if (button) button.disabled = false
    return
  }
  job.pending = nextPath
  reportExport(job, `Reading ${job.pages.length}: ${page.heading || path}`)
  try {
    writeExportJob(job)
  } catch (error) {
    console.error("[omniget]", error)
    reportExport(job, "Export failed")
    return
  }
  const leftFrom = path
  location.assign(next)
  window.setTimeout(() => {
    if (location.pathname !== leftFrom) {
      whenChapterReady(doc).then(() => continueExport(doc))
      return
    }
    const link = nextChapterLink(doc)
    reportExport(readExportJob() || job, "Next link did not open, clicking it")
    link?.click()
    const clickedAt = Date.now()
    const timer = window.setInterval(() => {
      if (location.pathname !== leftFrom) {
        window.clearInterval(timer)
        whenChapterReady(doc).then(() => continueExport(doc))
      } else if (Date.now() - clickedAt >= PAGE_WAIT_MS) {
        window.clearInterval(timer)
        const stalled = readExportJob() || job
        stalled.active = false
        reportExport(stalled, "Next chapter did not open")
        writeExportJob(stalled)
        const button = document.getElementById("omniget-oreilly-pdf")
        if (button) button.disabled = false
      }
    }, 250)
  }, 1500)
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) throw new Error(`Chapter list returned ${response.status}`)
  return response.json()
}

async function loadChapters(isbn) {
  const chapters = []
  const covers = []
  let url = `https://learning.oreilly.com/api/v2/epubs/urn:orm:book:${isbn}/files/?limit=500`
  while (url) {
    const payload = await fetchJson(url)
    for (const row of payload.results || []) {
      if (!row?.url) continue
      const filename = row.filename || ""
      if (/^cover\./i.test(filename)) {
        covers.push({ title: "Cover", url: row.url, filename, mediaType: row.media_type || "" })
        continue
      }
      if (String(row?.kind || "").toLowerCase() !== "chapter") continue
      chapters.push({ title: filename || "Chapter", url: row.url })
    }
    url = payload.next || ""
  }
  const cover = covers.find((item) => /\.(jpe?g|png|webp|gif)$/i.test(item.filename)) || covers[0] || null
  return { chapters, cover }
}

async function loadCover(cover) {
  if (!cover?.url) return null
  const response = await fetch(cover.url, { credentials: "include" })
  if (!response.ok) return null
  const contentType = response.headers.get("content-type") || ""
  const imageFile = /\.(jpe?g|png|webp|gif)$/i.test(cover.filename || "")
  if (/^image\//i.test(contentType) || (imageFile && !/html|xml/i.test(contentType))) {
    return rasterizeBlob(await response.blob())
  }
  const parsed = textFromChapterHtml(await response.text())
  const figures = (parsed.blocks || []).filter((block) => (block.kind === "img" && block.src) || (block.kind === "svg" && block.markup))
  for (const figure of figures) {
    const loaded = await loadFigure(figure, cover.url)
    if (loaded?.jpeg) return loaded
  }
  return null
}

function readableHeading(value) {
  let text = String(value || "").replace(/\s+/g, " ").trim()
  text = text.replace(/\.(html?|xhtml)$/i, "")
  let previous = ""
  while (text && previous !== text) {
    previous = text
    text = text.replace(/__([^_]+)__/g, "$1")
    text = text.replace(/(^|[\s(\[])_([^_\n]+)_([\s)\].,;:!?]|$)/g, "$1$2$3")
  }
  if (!/\s/.test(text) && text.includes("_")) text = text.replace(/_+/g, " ")
  return text.replace(/\s+/g, " ").trim()
}

function plainText(value, keepLines) {
  const text = String(value || "")
  if (keepLines) return text.replace(/\t/g, "  ").replace(/\r/g, "").trim()
  return text.replace(/\s+/g, " ").trim()
}

function inlinePieces(node, mentions) {
  const pieces = []
  const walk = (current, link) => {
    for (const child of current.childNodes || []) {
      if (child.nodeType === 3) {
        const text = String(child.textContent || "").replace(/\s+/g, " ")
        if (text) pieces.push({ text, link })
        continue
      }
      if (child.nodeType !== 1) continue
      const tag = child.tagName.toLowerCase()
      if (tag === "script" || tag === "style" || tag === "img" || tag === "svg" || tag === "table") continue
      if (tag === "a") {
        walk(child, linkFromHref(child.getAttribute("href") || "") || link)
        continue
      }
      walk(child, link)
    }
  }
  walk(node, null)
  const merged = []
  for (const piece of pieces) {
    const last = merged[merged.length - 1]
    const same = JSON.stringify(last?.link || null) === JSON.stringify(piece.link || null)
    if (last && same) last.text += piece.text
    else merged.push({ text: piece.text, link: piece.link || null })
  }
  return mentions ? chapterMentions(merged) : merged
}

function pushTextBlock(blocks, kind, source) {
  const node = source && source.nodeType === 1 ? source : null
  const mentions = kind !== "h1" && kind !== "pre"
  let pieces = node ? inlinePieces(node, mentions) : null
  if (pieces && /^h[1-4]$/.test(kind)) {
    pieces = pieces.map((piece) => ({ ...piece, text: readableHeading(piece.text) })).filter((piece) => piece.text)
  }
  const plain = pieces
    ? pieces.map((piece) => piece.text).join("").replace(/\s+/g, " ").trim()
    : (/^h[1-4]$/.test(kind) ? readableHeading(plainText(source, false)) : plainText(source, kind === "pre"))
  if (!plain) return
  const block = { kind, text: plain }
  if (pieces?.some((piece) => piece.text)) block.pieces = pieces
  blocks.push(block)
}

function cellLines(cell) {
  if (!cell) return []
  const blocks = [...(cell.children || [])].filter((el) => /^(p|div|li|h[1-6])$/i.test(el.tagName))
  if (blocks.length > 1) return blocks.map((block) => plainText(block.textContent)).filter(Boolean)
  const parts = []
  let current = ""
  const flush = () => {
    const text = plainText(current)
    if (text) parts.push(text)
    current = ""
  }
  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) current += child.textContent
      else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase()
        if (tag === "br") flush()
        else if (tag === "p" || tag === "li" || tag === "div") {
          flush()
          const text = plainText(child.textContent)
          if (text) parts.push(text)
        } else walk(child)
      }
    }
  }
  walk(cell)
  flush()
  return parts.length ? parts : [plainText(cell.textContent)].filter(Boolean)
}

function tableRows(table) {
  const rows = []
  for (const section of table.children) {
    const tag = section.tagName.toLowerCase()
    const source = tag === "tr" ? [section] : (tag === "thead" || tag === "tbody" || tag === "tfoot" ? [...section.children] : [])
    for (const row of source) {
      if (row.tagName?.toLowerCase() !== "tr") continue
      const cells = [...row.children].filter((cell) => {
        const name = cell.tagName.toLowerCase()
        return name === "td" || name === "th"
      })
      if (cells.length) rows.push(cells.map((cell) => cellLines(cell).join("\n")))
    }
  }
  return rows
}

function imageSource(img) {
  const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original") || ""
  if (src && !src.startsWith("data:image/svg")) return src
  const srcset = img.getAttribute("srcset") || ""
  const candidate = srcset.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean).pop()
  return candidate || src
}

function absorb(node, blocks) {
  const tag = node.tagName.toLowerCase()
  if (tag === "script" || tag === "style" || tag === "noscript" || tag === "nav") return
  if (tag === "table") {
    const rows = tableRows(node)
    const caption = cellLines(node.querySelector("caption")).join("\n")
    if (rows.length) blocks.push({ kind: "table", caption, rows, header: Boolean(node.querySelector("th")) })
    for (const img of node.querySelectorAll("img, svg")) absorb(img, blocks)
    return
  }
  if (tag === "figure" || node.getAttribute("data-type") === "figure") {
    const caption = cellLines(node.querySelector("figcaption")).join(" ")
    const img = node.querySelector("img")
    const svg = node.querySelector("svg")
    const table = node.querySelector("table")
    if (img) blocks.push({ kind: "img", src: imageSource(img), alt: img.getAttribute("alt") || "", caption })
    else if (svg) blocks.push({ kind: "svg", markup: svg.outerHTML, caption })
    else if (table) {
      const rows = tableRows(table)
      if (rows.length) blocks.push({ kind: "table", caption: caption || cellLines(table.querySelector("caption")).join("\n"), rows, header: Boolean(table.querySelector("th")) })
      for (const img of node.querySelectorAll("img, svg")) absorb(img, blocks)
    }
    return
  }
  if (tag === "picture") {
    const img = node.querySelector("img")
    if (img) absorb(img, blocks)
    return
  }
  if (tag === "img") {
    const src = imageSource(node)
    if (src) blocks.push({ kind: "img", src, alt: node.getAttribute("alt") || "", caption: "" })
    return
  }
  if (tag === "svg") {
    blocks.push({ kind: "svg", markup: node.outerHTML, caption: "" })
    return
  }
  if (tag === "object" || tag === "embed") {
    const src = node.getAttribute("data") || node.getAttribute("src") || ""
    const type = node.getAttribute("type") || ""
    if (src && (/image|svg/.test(type) || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(src))) {
      blocks.push({ kind: "img", src, alt: "", caption: "" })
    }
    return
  }
  if (/^h[1-4]$/.test(tag)) {
    pushTextBlock(blocks, tag, node)
    return
  }
  if (tag === "pre") {
    pushTextBlock(blocks, "pre", node.textContent)
    return
  }
  if (tag === "blockquote") {
    if (node.querySelector("table, img, svg, figure")) [...node.children].forEach((child) => absorb(child, blocks))
    else pushTextBlock(blocks, "quote", node)
    return
  }
  if (tag === "li") {
    if (node.querySelector("table, img, svg, figure")) [...node.children].forEach((child) => absorb(child, blocks))
    else if (node.querySelector("p")) [...node.children].forEach((child) => {
      if (child.tagName?.toLowerCase() === "p") pushTextBlock(blocks, "li", child)
    })
    else pushTextBlock(blocks, "li", node)
    return
  }
  if (tag === "p") {
    if (!node.querySelector("img, svg")) {
      pushTextBlock(blocks, "p", node)
      return
    }
    let group = []
    const flush = () => {
      if (!group.length) return
      const span = node.ownerDocument.createElement("span")
      for (const child of group) span.appendChild(child.cloneNode(true))
      pushTextBlock(blocks, "p", span)
      group = []
    }
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && /^(img|svg)$/i.test(child.tagName)) {
        flush()
        absorb(child, blocks)
      } else group.push(child)
    }
    flush()
    return
  }
  ;[...node.children].forEach((child) => absorb(child, blocks))
}

function blocksFromHtml(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html")
  const scope = parsed.querySelector("#sbo-rt-content") || parsed.body
  if (!scope) return []
  const blocks = []
  ;[...scope.children].forEach((child) => absorb(child, blocks))
  return blocks
}

function sizedSvg(markup) {
  let svg = String(markup || "")
  if (!/<svg[\s>]/i.test(svg)) return svg
  if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  if (/\swidth=/.test(svg)) return svg
  const box = svg.match(/viewBox=["']([\d.\s-]+)["']/i)
  const parts = box ? box[1].trim().split(/\s+/).map(Number) : []
  const width = parts.length === 4 && parts[2] > 0 ? parts[2] : 800
  const height = parts.length === 4 && parts[3] > 0 ? parts[3] : 500
  return svg.replace(/<svg/i, `<svg width="${width}" height="${height}"`)
}

function imageHasInk(context, width, height) {
  try {
    const data = context.getImageData(0, 0, width, height).data
    const step = Math.max(4, Math.floor(data.length / 8000) * 4)
    let ink = 0
    for (let index = 0; index < data.length; index += step) {
      if (data[index] < 248 || data[index + 1] < 248 || data[index + 2] < 248) ink += 1
      if (ink >= 12) return true
    }
    return false
  } catch {
    return true
  }
}

function rasterizeBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const sourceWidth = img.naturalWidth || img.width
      const sourceHeight = img.naturalHeight || img.height
      if (sourceWidth < 48 && sourceHeight < 48) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      const scale = Math.min(1, 1400 / sourceWidth, 1400 / sourceHeight)
      const width = Math.max(1, Math.round(sourceWidth * scale))
      const height = Math.max(1, Math.round(sourceHeight * scale))
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext("2d")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, width, height)
      context.drawImage(img, 0, 0, width, height)
      if (!imageHasInk(context, width, height)) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      canvas.toBlob((jpeg) => {
        URL.revokeObjectURL(url)
        if (!jpeg) {
          resolve(null)
          return
        }
        jpeg.arrayBuffer().then((buffer) => {
          resolve({ jpeg: new Uint8Array(buffer), pixelWidth: width, pixelHeight: height })
        }).catch(() => resolve(null))
      }, "image/jpeg", 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

async function loadFigure(block, baseUrl) {
  try {
    let blob
    if (block.kind === "svg") {
      blob = new Blob([sizedSvg(block.markup)], { type: "image/svg+xml;charset=utf-8" })
    } else if (block.src) {
      const absolute = new URL(block.src, baseUrl).href
      const response = await fetch(absolute, { credentials: "include" })
      if (!response.ok) return null
      blob = await response.blob()
    }
    if (!blob) return null
    return await rasterizeBlob(blob)
  } catch {
    return null
  }
}

function textFromChapterHtml(html) {
  const blocks = blocksFromHtml(html)
  const heading = blocks.find((block) => block.kind === "h1")?.text || ""
  const text = blocks.map((block) => block.text).join("\n\n")
  return { heading, text, blocks }
}

async function exportWholeBook(doc) {
  const button = doc.getElementById("omniget-oreilly-pdf")
  const job = { log: [] }
  if (button) button.disabled = true
  try {
    const isbn = bookIsbn(location.href)
    if (!isbn) throw new Error("This page has no book id")
    reportExport(job, "Reading the chapter list")
    const listed = await loadChapters(isbn)
    const chapters = listed.chapters || []
    if (!chapters.length) throw new Error("The chapter list was empty")
    reportExport(job, `Found ${chapters.length} chapters`)
    let cover = null
    if (listed.cover) {
      reportExport(job, "Reading the cover")
      cover = await loadCover(listed.cover)
    }
    const pages = []
    for (let index = 0; index < chapters.length; index += 1) {
      const chapter = chapters[index]
      reportExport(job, `Reading ${index + 1} of ${chapters.length}: ${chapter.title}`)
      const response = await fetch(chapter.url, { credentials: "include" })
      if (!response.ok) {
        reportExport(job, `Skipped ${chapter.title} (${response.status})`)
        continue
      }
      const parsed = textFromChapterHtml(await response.text())
      const heading = readableHeading(parsed.heading || String(chapter.title || "Chapter").replace(/\.[^.]+$/, ""))
      const blocks = parsed.blocks?.length ? parsed.blocks : []
      if (!blocks.some((block) => block.kind === "h1")) blocks.unshift({ kind: "h1", text: heading })
      const figures = blocks.filter((block) => (block.kind === "img" && block.src) || (block.kind === "svg" && block.markup))
      for (let figureIndex = 0; figureIndex < figures.length; figureIndex += 1) {
        const figure = figures[figureIndex]
        reportExport(job, `Figure ${figureIndex + 1} of ${figures.length} in ${chapter.title}`)
        const loaded = await loadFigure(figure, chapter.url)
        if (loaded) {
          Object.assign(figure, loaded)
        } else if (figure.caption || figure.alt) {
          figure.kind = "p"
          figure.text = figure.caption || figure.alt
        } else {
          figure.kind = "skip"
        }
      }
      const keep = blocks.some((block) => block.kind !== "h1" && (block.text || block.rows?.length || block.jpeg))
      if (!keep) continue
      pages.push({ heading, blocks, file: chapter.title })
    }
    if (!pages.length) throw new Error("No chapter text came back")
    const figureCount = pages.reduce((sum, page) => sum + page.blocks.filter((block) => block.jpeg).length, 0)
    const tableCount = pages.reduce((sum, page) => sum + page.blocks.filter((block) => block.kind === "table").length, 0)
    reportExport(job, `Saving ${pages.length} chapters, ${tableCount} tables, ${figureCount} figures`)
    downloadPdf(buildBookPdf(pages, doc.title, cover), bookFileName(doc.title, pages[0].heading))
    reportExport(job, "Saved")
  } catch (error) {
    console.error("[omniget]", error)
    reportExport(job, error?.message || "Export failed")
  } finally {
    if (button) button.disabled = false
  }
}

function startExport(doc) {
  const button = document.getElementById("omniget-oreilly-pdf")
  if (button) button.disabled = true
  const job = { active: true, pages: [], pending: "", log: [] }
  try {
    writeExportJob(job)
  } catch (error) {
    console.error("[omniget]", error)
    if (button) button.textContent = "Export failed"
    return
  }
  reportExport(job, "Starting")
  continueExport(doc)
}

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

if (typeof document !== "undefined" && document.documentElement) {
  document.getElementById("omniget-oreilly-pdf")?.remove()
  try { sessionStorage.removeItem(EXPORT_JOB_KEY) } catch { /* the saver still runs from the popup */ }
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "omniget-oreilly-export") return
    if (typeof exportWholeBook !== "function") {
      sendResponse({ ok: false, reason: "The book page did not load the saver." })
      return
    }
    exportWholeBook(document)
    sendResponse({ ok: true })
  })
}
