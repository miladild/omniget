import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { readFile } from "node:fs/promises"

const code = await readFile(new URL("../src/oreilly-export.js", import.meta.url), "utf8")
const sandbox = { console, URL, Blob, setInterval, clearInterval, TextEncoder, TextDecoder }
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
const { bookFileName, bookIsbn, buildBookPdf, chapterHrefs, collectBookPages, isOReillyHost, layoutBlocks, layoutContents, nextPageUrl, paginateBook, pdfEscape, pickNextControl, textWidth } = sandbox

test("recognises the O'Reilly hosts the content script is allowed to run on", () => {
  assert.equal(isOReillyHost("learning.oreilly.com"), true)
  assert.equal(isOReillyHost("cdn.oreillystatic.com"), true)
  assert.equal(isOReillyHost("example.com"), false)
})

test("reads the book id from the reader address", () => {
  assert.equal(
    bookIsbn("https://learning.oreilly.com/library/view/ai-engineering/9781098166298/preface01.html"),
    "9781098166298",
  )
  assert.equal(bookIsbn("https://example.com/"), "")
})

test("keeps quotes, dashes, and accents instead of question marks", () => {
  const encoded = pdfEscape("it’s — a café")
  assert.equal(encoded.includes("?"), false)
  assert.match(encoded, /\\222/)
  assert.match(encoded, /\\227/)
  assert.match(encoded, /\\351/)
})

test("names one file for the book", () => {
  assert.equal(bookFileName("Preface - AI Engineering", "Preface"), "Preface - AI Engineering.pdf")
})

test("picks the enabled Next control and ignores Previous", () => {
  const next = pickNextControl([
    { label: "Previous", disabled: false },
    { label: "Next", disabled: false },
  ])
  assert.equal(next.label, "Next")
  assert.equal(pickNextControl([{ label: "Next", disabled: true }]), null)
})

test("follows the contents order when the chevron is named with the next chapter", () => {
  const current = "https://learning.oreilly.com/library/view/ai-engineering/9781098166298/preface01.html"
  const hrefs = chapterHrefs([
    "https://learning.oreilly.com/library/view/ai-engineering/9781098166298/preface01.html",
    "https://learning.oreilly.com/library/view/ai-engineering/9781098166298/ch01.html",
    "https://learning.oreilly.com/library/view/ai-engineering/9781098166298/ch02.html",
    "https://learning.oreilly.com/videos/other/123",
  ], current)
  assert.deepEqual(JSON.parse(JSON.stringify(hrefs)), [
    "/library/view/ai-engineering/9781098166298/preface01.html",
    "/library/view/ai-engineering/9781098166298/ch01.html",
    "/library/view/ai-engineering/9781098166298/ch02.html",
  ])
  const control = pickNextControl([
    { label: "Preface", side: "previous" },
    { label: "1. Introduction to Building AI Applications with Foundation Models", side: "next" },
  ])
  assert.equal(control.side, "next")
  assert.equal(nextPageUrl(`${current}#contact`, current), "")
  assert.equal(
    nextPageUrl("https://learning.oreilly.com/library/view/ai-engineering/9781098166298/ch01.html", current),
    "https://learning.oreilly.com/library/view/ai-engineering/9781098166298/ch01.html",
  )
})

test("walks each reader page once and stops when Next does not change the page", async () => {
  const book = [
    { heading: "Preface", text: "When ChatGPT came out." },
    { heading: "What This Book Is About", text: "This book is about building AI applications." },
  ]
  let index = 0
  const pages = await collectBookPages({
    read: () => book[Math.min(index, book.length - 1)],
    pickNext: () => (index < book.length - 1 ? { label: "Next" } : null),
    activate: () => {
      index += 1
    },
    waitForChange: async () => true,
  })
  assert.deepEqual(JSON.parse(JSON.stringify(pages)), book)
})

test("aligns the contents page numbers in one column", () => {
  const rows = layoutContents([
    { title: "Preface", page: 2 },
    { title: "What This Book Is About", page: 14 },
  ], "AI Engineering").flat()
  const preface = rows.find((line) => line.text === "Preface")
  const chapter = rows.find((line) => line.text === "What This Book Is About")
  assert.equal(preface.y, rows.find((line) => line.text === "1").y)
  assert.equal(
    Math.round(preface.pageX + textWidth("2", 11)),
    Math.round(chapter.pageX + textWidth("14", 11)),
  )
  assert.ok(preface.leader.to > preface.leader.from)
})

test("draws tables and embeds pictures", () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)
  const pdf = buildBookPdf([
    {
      heading: "Figures",
      blocks: [
        { kind: "h1", text: "Figures" },
        { kind: "table", header: true, caption: "Model sizes", rows: [["Model", "Size"], ["Llama", "70B"]] },
        { kind: "img", caption: "Training curve", jpeg, pixelWidth: 400, pixelHeight: 200 },
      ],
    },
  ], "AI Engineering")
  const text = new TextDecoder().decode(pdf)
  assert.match(text, /Model sizes/)
  assert.match(text, /Llama/)
  assert.match(text, /Training curve/)
  assert.match(text, /\/DCTDecode/)
  assert.match(text, /\/Subtype \/Image/)
  let found = false
  for (let index = 0; index <= pdf.length - jpeg.length; index += 1) {
    found = jpeg.every((byte, offset) => pdf[index + offset] === byte)
    if (found) break
  }
  assert.equal(found, true)
})

test("keeps headings and figure captions together and drops empty pages", () => {
  const filler = Array.from({ length: 48 }, () => "This sentence fills the page so a later heading is not left on its own.").join(" ")
  const sheets = layoutBlocks([
    { kind: "h1", text: "Chapter" },
    { kind: "p", text: filler },
    { kind: "h2", text: "Next section" },
    { kind: "p", text: "This stays with the heading." },
    { kind: "img", caption: "Training curve", jpeg: Uint8Array.of(1, 2, 3, 4), pixelWidth: 800, pixelHeight: 400 },
    { kind: "skip" },
  ])
  assert.ok(sheets.every((lines) => lines.length > 0))
  const headingSheet = sheets.findIndex((lines) => lines.some((line) => line.text === "Next section"))
  const followSheet = sheets.findIndex((lines) => lines.some((line) => String(line.text).includes("stays with")))
  assert.equal(headingSheet, followSheet)
  const imageSheet = sheets.findIndex((lines) => lines.some((line) => line.image))
  const captionSheet = sheets.findIndex((lines) => lines.some((line) => line.text === "Training curve"))
  assert.equal(imageSheet, captionSheet)
  const image = sheets[imageSheet].find((line) => line.image)
  assert.ok(image.w <= 504)
  assert.ok(image.h > 40)
  const icon = layoutBlocks([{ kind: "img", jpeg: Uint8Array.of(1), pixelWidth: 32, pixelHeight: 32, caption: "Icon" }])
  assert.ok(icon.flat().find((line) => line.image).w < 40)
  assert.equal(layoutBlocks([{ kind: "skip" }]).length, 0)
})

test("writes one PDF that contains every section", () => {
  const pages = [
    { heading: "Preface", text: "When ChatGPT came out." },
    { heading: "What This Book Is About", text: "This book is about building AI applications." },
  ]
  const pdf = new TextDecoder().decode(buildBookPdf(pages, "Preface | AI Engineering"))
  assert.match(pdf, /^%PDF-1\.4/)
  assert.match(pdf, /\/Type \/Catalog/)
  assert.match(pdf, /\/Outlines/)
  assert.match(pdf, /Helvetica-Bold/)
  assert.match(pdf, /\/Count 3/)
  assert.match(pdf, /Contents/)
  assert.match(pdf, /AI Engineering/)
  assert.match(pdf, /Preface/)
  assert.match(pdf, /What This Book Is About/)
  assert.match(pdf, /\/Subtype \/Link/)
  assert.match(pdf, /\/Dest \[/)
  assert.equal(paginateBook(pages).length, 2)
})

test("the manifest loads this file as a classic script the popup can inject", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"))
  const entry = manifest.content_scripts.find((script) => script.js?.includes("src/oreilly-export.js"))
  assert.equal(entry.type, undefined)
  assert.equal(code.includes("export "), false)
  assert.deepEqual(entry.matches, ["*://*.oreilly.com/*", "*://*.oreillystatic.com/*"])
})
