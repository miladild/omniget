import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { readFile } from "node:fs/promises"

const code = await readFile(new URL("../src/libby-export.js", import.meta.url), "utf8")
const sandbox = { console, URL, Blob, TextEncoder, TextDecoder, atob, btoa }
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
const {
  bookTitle,
  buildLibbyPdf,
  cfc1,
  decodeChapter,
  decodeOpenbook,
  descramble,
  isLibbyAudioHost,
  isLibbyHost,
  isLibbyReaderHost,
  pageMarkerFromText,
  spineParts,
} = sandbox

test("recognises Libby without treating it as the book reader", () => {
  assert.equal(isLibbyHost("libbyapp.com"), true)
  assert.equal(isLibbyHost("dewey-abc.read.libbyapp.com"), true)
  assert.equal(isLibbyReaderHost("dewey-abc.read.libbyapp.com"), true)
  assert.equal(isLibbyReaderHost("libbyapp.com"), false)
  assert.equal(isLibbyAudioHost("dewey-abc.listen.libbyapp.com"), true)
  assert.equal(isLibbyHost("learning.oreilly.com"), false)
})

test("reads a ciphered Libby chapter", () => {
  assert.equal(cfc1("sGVa=G8b"), "hello")
  const plain = btoa("<p>hello</p>")
  const chars = plain.split("")
  for (let index = 0; index + 4 <= chars.length; index += 4) {
    const first = chars[index]
    chars[index] = chars[index + 3]
    chars[index + 3] = first
  }
  const html = `parent.__bif_cfc1(self, '${chars.join("")}')`
  assert.equal(decodeChapter(html), "<p>hello</p>")
  assert.equal(decodeChapter("<html><body><p>plain</p></body></html>"), "<html><body><p>plain</p></body></html>")
})

test("descramble follows the Libby reader shift", () => {
  assert.equal(descramble("1", "A"), "B")
  assert.equal(descramble("0", "ABCD"), "ABCD")
})

test("reads one Libby book from the reader payload and keeps chapters together", () => {
  const openbook = {
    b: {
      title: { main: "Sample" },
      spine: [
        { path: "OEBPS/c1.xhtml", "-odread-original-path": "OEBPS/c1.xhtml" },
        { path: "OEBPS/c2.xhtml", "-odread-original-path": "OEBPS/c2.xhtml" },
      ],
      nav: { toc: [{ title: "One", path: "OEBPS/c1.xhtml" }, { title: "Two", path: "OEBPS/c2.xhtml" }] },
      "-odread-cmpt-params": ["cmpt=1", "cmpt=2"],
    },
  }
  const payload = btoa(JSON.stringify(openbook))
  const html = `window.eData = ${JSON.stringify([payload])};SPARK.bifocalPath`
  const decoded = decodeOpenbook(html, "000")
  assert.equal(bookTitle(decoded), "Sample")
  const parts = spineParts(decoded, "https://dewey-000.read.libbyapp.com")
  assert.equal(parts.length, 2)
  assert.equal(parts[0].title, "One")
  assert.equal(parts[0].url, "https://dewey-000.read.libbyapp.com/OEBPS/c1.xhtml?cmpt=1")
  assert.equal(parts[1].title, "Two")
})

test("builds one PDF for the Libby chapters", () => {
  const pdf = buildLibbyPdf([
    { title: "One", blocks: [{ kind: "p", text: "Hello from Libby" }] },
    { title: "Two", blocks: [{ kind: "p", text: "Second chapter" }] },
  ], "Sample")
  const text = new TextDecoder().decode(pdf)
  assert.match(text, /^%PDF-1\.4/)
  assert.match(text, /Hello from Libby/)
  assert.match(text, /Second chapter/)
  assert.match(text, /\/Count 3/)
  assert.match(text, /\/Subtype \/Link/)
  assert.ok(text.indexOf("(Contents)") < text.indexOf("(One)"))
})

test("puts the cover before the contents and drops empty page stamps", () => {
  const pdf = buildLibbyPdf([
    { title: "Cover", blocks: [{ kind: "p", text: "Front of the book" }] },
    { title: "Pages 5-6", blocks: [] },
    { title: "Pages 7-8", blocks: [{ kind: "p", text: "5" }] },
    { title: "Introduction", blocks: [{ kind: "p", text: "Psychology is the study" }] },
    { title: "Pages 11-12", blocks: [{ kind: "p", text: "Kept with the introduction" }] },
  ], "Sample")
  const text = new TextDecoder().decode(pdf)
  assert.equal(text.includes("Pages 5-6"), false)
  assert.equal(text.includes("(5)"), false)
  assert.equal(text.includes("(Cover)"), false)
  assert.ok(text.indexOf("(Front of the book)") < text.indexOf("(Contents)"))
  assert.ok(text.indexOf("(Contents)") < text.indexOf("(Introduction)"))
  assert.match(text, /Kept with the introduction/)
})

test("puts the cover picture on the first page", () => {
  const pdf = buildLibbyPdf([
    {
      title: "Cover",
      blocks: [{
        kind: "image",
        jpeg: new Uint8Array([255, 216, 255, 217]),
        pixelWidth: 800,
        pixelHeight: 1200,
        alt: "Cover: Psych 101. A crash course in the science of the mind, with a catalog blurb long enough that it must not be printed across the picture.",
      }],
    },
    { title: "Introduction", blocks: [{ kind: "p", text: "Psychology is the study" }] },
  ], "Psych")
  const text = new TextDecoder().decode(pdf)
  const picture = text.indexOf("/Im1 Do")
  assert.ok(picture >= 0)
  assert.ok(picture < text.indexOf("(Contents)"))
  assert.equal(text.includes("(Cover)"), false)
  assert.equal(text.includes("crash course"), false)
})

test("drops pages the reader captured more than once", () => {
  const intro = [
    { kind: "h", level: 1, text: "What is psychology?" },
    { kind: "p", text: "Psychology is the study of mental and behavioral processes" },
    { kind: "p", text: "Ivan Pavlov studied association in dogs." },
  ]
  const jpeg = new Uint8Array([255, 216, 255, 217])
  const picture = { kind: "image", jpeg, pixelWidth: 400, pixelHeight: 300, src: "cover.jpg" }
  const pdf = buildLibbyPdf([
    { title: "Introduction", blocks: [...intro, ...intro, picture, picture] },
    { title: "Dedication", blocks: [{ kind: "p", text: "For my family" }] },
    { title: "Introduction", blocks: intro },
    { title: "Ivan Pavlov", blocks: [...intro, { kind: "p", text: "A new paragraph after the repeated pages." }] },
  ], "Psych")
  const text = new TextDecoder().decode(pdf)
  assert.equal(text.split("Psychology is the study").length - 1, 1)
  assert.equal(text.split("Ivan Pavlov studied").length - 1, 1)
  assert.equal(text.split("/Im1 Do").length - 1, 1)
  assert.match(text, /For my family/)
  assert.match(text, /A new paragraph after the repeated pages/)
})

test("spaces paragraphs and opens the next topic like a chapter", () => {
  const pdf = buildLibbyPdf([
    {
      title: "Mind",
      blocks: [
        { kind: "h", level: 2, text: "What psychology studies" },
        { kind: "p", text: "First paragraph about the mind." },
        { kind: "p", text: "Second paragraph keeps a gap." },
        { kind: "li", text: "Observation" },
        { kind: "quote", text: "A cited line from the book." },
      ],
    },
  ], "Psych")
  const text = new TextDecoder().decode(pdf)
  assert.match(text, /What psychology studies/)
  assert.match(text, /First paragraph about the mind/)
  assert.match(text, /Second paragraph keeps a gap/)
  assert.match(text, /\\225/)
  assert.match(text, /A cited line from the book/)
  assert.match(text, /\/F2 18 Tf/)
  assert.match(text, /\/F2 13 Tf/)
  assert.match(text, /0\.93 0\.94 0\.95 rg/)
  assert.match(text, /0\.85 0\.85 0\.85 RG/)
  assert.ok(text.indexOf("(Contents)") < text.indexOf("(What psychology studies)"))
  assert.ok(text.indexOf("(Mind)") < text.indexOf("(What psychology studies)"))
})

test("moves a heading onto the next page with the paragraph that follows it", () => {
  const filler = "This sentence fills the page so the next heading cannot sit alone at the bottom. ".repeat(40)
  const pdf = buildLibbyPdf([
    {
      title: "Mind",
      blocks: [
        { kind: "p", text: filler },
        { kind: "h", level: 2, text: "The next topic" },
        { kind: "p", text: "The paragraph that belongs with the next topic stays on that heading page." },
      ],
    },
  ], "Psych")
  const text = new TextDecoder().decode(pdf)
  const together = text.split("endstream").some((stream) => stream.includes("(The next topic)") && stream.includes("(The paragraph that belongs"))
  assert.equal(together, true)
})

test("gives each contents entry its own row", () => {
  const pdf = buildLibbyPdf([
    { title: "Ivan Pavlov", blocks: [{ kind: "p", text: "Dogs and bells." }] },
    { title: "B. F. Skinner", blocks: [{ kind: "p", text: "Boxes and behavior." }] },
  ], "Psych")
  const text = new TextDecoder().decode(pdf)
  const contents = text.split("endstream").find((stream) => stream.includes("(Contents)") && stream.includes("(Ivan Pavlov)"))
  const baselines = [...contents.matchAll(/([\d.]+) Td \(Ivan Pavlov\)|([\d.]+) Td \(B\. F\. Skinner\)/g)]
    .map((hit) => Number(hit[1] || hit[2]))
  assert.equal(baselines.length, 2)
  assert.ok(baselines[0] - baselines[1] >= 28)
})

test("reads the page footer even when the cover badge sits between the numbers", () => {
  const marker = pageMarkerFromText(`Cover text ${"x".repeat(3000)} pp. 1-2 ${"y".repeat(900)} of 480 later`)
  assert.equal(marker.label, "pp. 1-2 of 480")
  assert.equal(marker.start, 1)
  assert.equal(marker.end, 2)
  assert.equal(marker.total, 480)
})

test("keeps the Libby saver separate from the O'Reilly saver", async () => {
  const oreilly = await readFile(new URL("../src/oreilly-export.js", import.meta.url), "utf8")
  const popup = await readFile(new URL("../popup/popup.js", import.meta.url), "utf8")
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"))
  assert.equal(/libby/i.test(oreilly), false)
  assert.match(popup, /initLibbyExport/)
  assert.match(popup, /initOReillyExport/)
  assert.match(popup, /src\/libby-export\.js/)
  assert.ok(manifest.host_permissions.includes("*://*.libbyapp.com/*"))
  const oreillyScript = manifest.content_scripts.find((script) => script.js?.includes("src/oreilly-export.js"))
  assert.deepEqual(oreillyScript.matches, ["*://*.oreilly.com/*", "*://*.oreillystatic.com/*"])
})
