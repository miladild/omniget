import test from "node:test";
import assert from "node:assert/strict";

import { getHlsGroupKey, getHlsVariantToken, getStatedQuality, isCaptionMedia, isStreamingFragment } from "../src/hls-grouping.js";

test("variant token collapses master-like names to 'master'", () => {
  assert.equal(getHlsVariantToken("master.m3u8"), "master");
  assert.equal(getHlsVariantToken("playlist.m3u8"), "master");
  assert.equal(getHlsVariantToken("index.m3u8"), "master");
  assert.equal(getHlsVariantToken("main.m3u8"), "master");
  assert.equal(getHlsVariantToken("manifest.m3u8"), "master");
});

test("variant token collapses pure resolution names to 'master'", () => {
  assert.equal(getHlsVariantToken("1080.m3u8"), "master");
  assert.equal(getHlsVariantToken("1080p.m3u8"), "master");
  assert.equal(getHlsVariantToken("720p.m3u8"), "master");
  assert.equal(getHlsVariantToken("480.m3u8"), "master");
});

test("variant token collapses quality labels to 'master'", () => {
  assert.equal(getHlsVariantToken("high.m3u8"), "master");
  assert.equal(getHlsVariantToken("hd.m3u8"), "master");
  assert.equal(getHlsVariantToken("auto.m3u8"), "master");
});

test("variant token preserves distinct video identifiers", () => {
  assert.equal(getHlsVariantToken("moviea_master.m3u8"), "moviea_master");
  assert.equal(getHlsVariantToken("movieb_master.m3u8"), "movieb_master");
  assert.equal(getHlsVariantToken("session-abc123.m3u8"), "session-abc123");
});

test("variant token is case-insensitive", () => {
  assert.equal(getHlsVariantToken("MASTER.M3U8"), "master");
  assert.equal(getHlsVariantToken("Playlist.M3U8"), "master");
});

test("variant token strips query string before matching", () => {
  assert.equal(getHlsVariantToken("master.m3u8?token=abc"), "master");
  assert.equal(getHlsVariantToken("moviea.m3u8?sig=xyz"), "moviea");
});

test("group key keeps distinct videos in the same directory separate", () => {
  const keyA = getHlsGroupKey("https://cdn.example.com/videos/moviea_master.m3u8");
  const keyB = getHlsGroupKey("https://cdn.example.com/videos/movieb_master.m3u8");
  assert.notEqual(keyA, keyB);
});

test("group key groups master with its numeric variants in the same directory", () => {
  const master = getHlsGroupKey("https://cdn.example.com/video1/master.m3u8");
  const v1080 = getHlsGroupKey("https://cdn.example.com/video1/1080p.m3u8");
  const v720 = getHlsGroupKey("https://cdn.example.com/video1/720.m3u8");
  assert.equal(master, v1080);
  assert.equal(master, v720);
});

test("group key differentiates different directories", () => {
  const keyA = getHlsGroupKey("https://cdn.example.com/videoA/master.m3u8");
  const keyB = getHlsGroupKey("https://cdn.example.com/videoB/master.m3u8");
  assert.notEqual(keyA, keyB);
});

test("group key differentiates different origins", () => {
  const keyA = getHlsGroupKey("https://cdn1.example.com/videos/master.m3u8");
  const keyB = getHlsGroupKey("https://cdn2.example.com/videos/master.m3u8");
  assert.notEqual(keyA, keyB);
});

test("group key treats resolution copies of one Pluralsight clip as one video", () => {
  const hd = getHlsGroupKey("https://prod-video-cdn.pluralsight.com/media/courses/clip-1/1280x720/index.m3u8");
  const sd = getHlsGroupKey("https://prod-video-cdn.pluralsight.com/media/courses/clip-1/640x480/index.m3u8");
  const file = getHlsGroupKey("https://prod-video-cdn.pluralsight.com/media/courses/clip-1/1280x720.mp4");
  const other = getHlsGroupKey("https://prod-video-cdn.pluralsight.com/media/courses/clip-2/1280x720/index.m3u8");
  assert.equal(hd, sd);
  assert.equal(hd, file);
  assert.notEqual(hd, other);
});

test("group key treats Kaltura quality streams of one lesson as one video", () => {
  const master = getHlsGroupKey("https://cdnapisec.kaltura.com/p/1926081/sp/192608100/playManifest/entryId/1_abc/flavorIds/0_a,0_b/format/applehttp/a.m3u8");
  const high = getHlsGroupKey("https://cdnapisec.kaltura.com/p/1926081/sp/192608100/serveFlavor/entryId/1_abc/flavorId/0_a/index.m3u8");
  const low = getHlsGroupKey("https://cdn.kaltura.com/p/1926081/playManifest/entryId/1_abc/flavorIds/0_b/format/applehttp/a.m3u8");
  const other = getHlsGroupKey("https://cdnapisec.kaltura.com/p/1926081/playManifest/entryId/1_other/format/applehttp/a.m3u8");
  assert.equal(master, high);
  assert.equal(master, low);
  assert.notEqual(master, other);
});

function pluralsightManifest(path) {
  const payload = Buffer.from(JSON.stringify({ path })).toString("base64url");
  return `https://app.pluralsight.com/video/delivery/api/v1/manifests/eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}

test("group key treats Pluralsight rendition links for one clip as one video", () => {
  const clip = "clips2/c260b5fc-9ea8-4d8f-8015-25bf40c03c26/versions/fe42d385-ab50-40b1-877b-fb36d80f81aa/en/hls";
  const master = getHlsGroupKey(pluralsightManifest(`${clip}/master.m3u8`));
  const hd = getHlsGroupKey(pluralsightManifest(`${clip}/hls_1920x1080.m3u8`));
  const sd = getHlsGroupKey(pluralsightManifest(`${clip}/hls_1280x720.m3u8`));
  const audio = getHlsGroupKey(pluralsightManifest(`${clip}/hls_aac-96k-en.m3u8`));
  const other = getHlsGroupKey(pluralsightManifest("clips2/other-clip/versions/other-version/en/hls/master.m3u8"));
  assert.equal(master, hd);
  assert.equal(master, sd);
  assert.equal(master, audio);
  assert.notEqual(master, other);
  assert.ok(getStatedQuality(pluralsightManifest(`${clip}/hls_1920x1080.m3u8`)) > getStatedQuality(pluralsightManifest(`${clip}/hls_1280x720.m3u8`)));
  assert.equal(isCaptionMedia(pluralsightManifest(`${clip}/hls_captions-en.m3u8`)), true);
  assert.equal(isStreamingFragment("https://vid30.pluralsight.com/clips2/c260b5fc/versions/fe42/en/hls/hls_1920x1080.ts"), true);
});

test("stated quality reads the resolution and ignores addresses that do not name one", () => {
  assert.equal(getStatedQuality("https://cdn.example.com/clip-1/1920x1080/index.m3u8"), 1080);
  assert.equal(getStatedQuality("https://cdn.example.com/clip-1/1280x720.mp4"), 720);
  assert.ok(getStatedQuality("https://cdn.example.com/clip-1/1920x1080/index.m3u8") > getStatedQuality("https://cdn.example.com/clip-1/640x480/index.m3u8"));
  assert.equal(getStatedQuality("https://cdnapisec.kaltura.com/p/1/playManifest/entryId/1_abc/flavorIds/0_a,0_b/a.m3u8"), 0);
});

test("group key falls back to raw url for invalid input", () => {
  assert.equal(getHlsGroupKey("not-a-url"), "not-a-url");
});
