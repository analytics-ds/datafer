import { describe, expect, it } from "vitest";
import { findMatchingFolder, normalizeFolderName, normalizeWebsite } from "@/lib/folders-service";

describe("normalizeWebsite", () => {
  it("ramène une adresse saisie à la main à son domaine nu", () => {
    expect(normalizeWebsite("https://www.Skello.io/fr/")).toBe("skello.io");
    expect(normalizeWebsite("skello.io")).toBe("skello.io");
    expect(normalizeWebsite("http://shop.ripcurl.eu")).toBe("shop.ripcurl.eu");
  });
  it("rend null sur une saisie vide ou sans domaine", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
    expect(normalizeWebsite("pas un site")).toBeNull();
    expect(normalizeWebsite("localhost")).toBeNull();
  });
});

describe("normalizeFolderName", () => {
  it("ignore accents, casse et ponctuation", () => {
    expect(normalizeFolderName("Épicerie Fine & Co")).toBe("epicerie fine co");
    expect(normalizeFolderName("  rip-curl ")).toBe("rip curl");
  });
});

describe("findMatchingFolder", () => {
  const rows = [
    { id: "1", name: "Skello", website: "https://www.skello.io" },
    { id: "2", name: "Rip Curl", website: null },
    { id: "3", name: "Como", website: "como.fr" },
  ];
  it("retrouve un dossier par son domaine, quel que soit le nom", () => {
    expect(findMatchingFolder(rows, { name: "Skello FR", website: "skello.io/fr" })?.id).toBe("1");
  });
  it("retrouve un dossier sans site par son nom", () => {
    expect(findMatchingFolder(rows, { name: "rip curl" })?.id).toBe("2");
    expect(findMatchingFolder(rows, { name: "RIP CURL", website: "ripcurl.com" })?.id).toBe("2");
  });
  it("ne confond pas deux homonymes aux sites différents", () => {
    expect(findMatchingFolder(rows, { name: "Como", website: "como-motors.com" })).toBeNull();
  });
  it("rend null pour un client inconnu", () => {
    expect(findMatchingFolder(rows, { name: "Empowill", website: "empowill.com" })).toBeNull();
  });
});
