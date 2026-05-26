import { describe, it, expect } from "vitest";
import { parseSitemapXml } from "../sitemap-parser";

describe("parseSitemapXml", () => {
  it("parses a flat urlset", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc><lastmod>2026-01-01</lastmod></url>
      </urlset>`;
    const r = parseSitemapXml(xml);
    expect(r.urls).toEqual([
      { loc: "https://example.com/a" },
      { loc: "https://example.com/b", lastmod: "2026-01-01" },
    ]);
    expect(r.sitemaps).toEqual([]);
  });

  it("parses a sitemap index", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
      </sitemapindex>`;
    const r = parseSitemapXml(xml);
    expect(r.urls).toEqual([]);
    expect(r.sitemaps).toEqual([
      "https://example.com/sitemap-1.xml",
      "https://example.com/sitemap-2.xml",
    ]);
  });

  it("returns empty when given HTML instead of XML", () => {
    const html = `<!DOCTYPE html><html><body>not a sitemap</body></html>`;
    const r = parseSitemapXml(html);
    expect(r.urls).toEqual([]);
    expect(r.sitemaps).toEqual([]);
  });

  it("tolerates missing XML declaration", () => {
    const xml = `<urlset><url><loc>https://example.com/x</loc></url></urlset>`;
    const r = parseSitemapXml(xml);
    expect(r.urls).toEqual([{ loc: "https://example.com/x" }]);
  });

  it("skips lastmod when not under <url>", () => {
    const xml = `<urlset>
      <url><loc>https://example.com/a</loc></url>
      <sitemap><loc>https://example.com/sub.xml</loc><lastmod>2026-01-01</lastmod></sitemap>
    </urlset>`;
    const r = parseSitemapXml(xml);
    expect(r.urls).toEqual([{ loc: "https://example.com/a" }]);
    expect(r.sitemaps).toEqual(["https://example.com/sub.xml"]);
  });
});
