import { readFileSync } from "node:fs";
import { parseHTML } from "../src/lib/analysis";

const path = process.argv[2] ?? "/tmp/zalando.html";
const html = readFileSync(path, "utf8");
const t0 = Date.now();
const result = parseHTML(html);
const elapsed = Date.now() - t0;

console.log(`File: ${path}`);
console.log(`Size: ${(html.length / 1024).toFixed(1)}KB`);
console.log(`Parse time: ${elapsed}ms`);
console.log(`---`);
console.log(`wordCount: ${result.wordCount}`);
console.log(`paragraphs: ${result.paragraphs}`);
console.log(`headings (total): ${result.headings}`);
console.log(`H1: ${result.h1.length} → ${result.h1.slice(0, 3).map(s => s.slice(0, 60)).join(" | ")}`);
console.log(`H2: ${result.h2.length} → ${result.h2.slice(0, 3).map(s => s.slice(0, 60)).join(" | ")}`);
console.log(`H3: ${result.h3.length} → ${result.h3.slice(0, 3).map(s => s.slice(0, 60)).join(" | ")}`);
console.log(`---`);
console.log(`Text first 400 chars:\n${result.text.slice(0, 400)}`);
