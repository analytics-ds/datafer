import * as fs from "node:fs";
import { parseHTML } from "../src/lib/analysis";

// 1) HTML brut tel que BD le sert (octets ISO-8859-1)
const raw = fs.readFileSync("/tmp/mx-bd.html");
console.log(`Raw bytes: ${raw.length}`);

// 2) Décodage UTF-8 (ce que r.text() fait par défaut sur certains runtimes)
const utf8 = raw.toString("utf-8");
const r1 = parseHTML(utf8);
console.log(`Decoded utf-8: wc=${r1.wordCount}, h1=${r1.h1.length}, h2=${r1.h2.length}, paragraphs=${r1.paragraphs}`);

// 3) Décodage ISO-8859-1 (le bon)
const latin = raw.toString("latin1");
const r2 = parseHTML(latin);
console.log(`Decoded iso-8859-1: wc=${r2.wordCount}, h1=${r2.h1.length}, h2=${r2.h2.length}, paragraphs=${r2.paragraphs}`);
