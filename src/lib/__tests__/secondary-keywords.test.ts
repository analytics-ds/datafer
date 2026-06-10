import { describe, it, expect } from "vitest";
import {
  normalizeSecondaryKeywords,
  MAX_SECONDARY_KEYWORDS,
  MAX_SECONDARY_KEYWORD_CHARS,
} from "@/lib/briefs-service";

describe("normalizeSecondaryKeywords", () => {
  const main = "verre à whisky";

  it("trim + retire les vides et les espaces multiples", () => {
    expect(
      normalizeSecondaryKeywords(["  verre   tumbler  ", "", "   ", "carafe whisky"], main),
    ).toEqual(["verre tumbler", "carafe whisky"]);
  });

  it("retourne [] sur les entrées non-array non-string", () => {
    expect(normalizeSecondaryKeywords(null, main)).toEqual([]);
    expect(normalizeSecondaryKeywords(undefined, main)).toEqual([]);
    expect(normalizeSecondaryKeywords(42, main)).toEqual([]);
    expect(normalizeSecondaryKeywords({ a: 1 }, main)).toEqual([]);
  });

  it("ignore les items non-string dans un array", () => {
    expect(
      normalizeSecondaryKeywords([123, null, "verre tumbler", { x: 1 }, true], main),
    ).toEqual(["verre tumbler"]);
  });

  it("accepte une string séparée par virgules / points-virgules / retours ligne (API v1)", () => {
    expect(
      normalizeSecondaryKeywords("verre tumbler, carafe whisky; pierre à whisky\nset dégustation", main),
    ).toEqual(["verre tumbler", "carafe whisky", "pierre à whisky", "set dégustation"]);
  });

  it("dédoublonne case et accents insensitive", () => {
    expect(
      normalizeSecondaryKeywords(["Verre Tumbler", "verre tumbler", "dégustation", "degustation"], main),
    ).toEqual(["Verre Tumbler", "dégustation"]);
  });

  it("rejette le mot-clé principal exact et ses sous-ensembles de tokens", () => {
    // "whisky" et "verre whisky" : tous leurs tokens sont dans le principal →
    // seraient masqués par isJunkNlpTerm côté UI tout en étant scorés.
    expect(
      normalizeSecondaryKeywords(
        ["verre à whisky", "whisky", "verre whisky", "whiskys", "verre tumbler"],
        main,
      ),
    ).toEqual(["verre tumbler"]);
  });

  it("garde un mot-clé qui étend le principal avec un token nouveau", () => {
    expect(normalizeSecondaryKeywords(["verre whisky cristal"], main)).toEqual([
      "verre whisky cristal",
    ]);
  });

  it("cap au nombre max de mots-clés", () => {
    const many = Array.from({ length: 25 }, (_, i) => `mot ${i} distinct${i}`);
    expect(normalizeSecondaryKeywords(many, main)).toHaveLength(MAX_SECONDARY_KEYWORDS);
  });

  it("rejette les mots-clés trop longs (garde-fou D1 row size)", () => {
    const long = "a ".repeat(MAX_SECONDARY_KEYWORD_CHARS) + "fin";
    expect(normalizeSecondaryKeywords([long, "verre tumbler"], main)).toEqual([
      "verre tumbler",
    ]);
  });

  it("rejette les mots-clés sans token significatif (ponctuation, 1 char)", () => {
    expect(normalizeSecondaryKeywords(["!!!", "a", "; ;"], main)).toEqual([]);
  });

  it("conserve tels quels les caractères spéciaux inoffensifs", () => {
    expect(normalizeSecondaryKeywords(["whisky d'écosse 12 ans"], main)).toEqual([
      "whisky d'écosse 12 ans",
    ]);
  });
});
