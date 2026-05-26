import { describe, it, expect } from "vitest";
import { buildUrlEmbeddingInput, cosineSimilarityF32, decodeEmbedding, encodeEmbedding } from "../url-embedder";

describe("buildUrlEmbeddingInput", () => {
  it("joins available fields with newlines", () => {
    const txt = buildUrlEmbeddingInput({
      title: "Titre",
      h1: "Autre H1",
      metaDescription: "Meta",
      firstParagraph: "Premier paragraphe",
    });
    expect(txt).toBe("Titre\nAutre H1\nMeta\nPremier paragraphe");
  });

  it("skips empty/null fields", () => {
    const txt = buildUrlEmbeddingInput({
      title: "T",
      h1: null,
      metaDescription: null,
      firstParagraph: "Para",
    });
    expect(txt).toBe("T\nPara");
  });

  it("dedups h1 if identical to title", () => {
    const txt = buildUrlEmbeddingInput({
      title: "Identique",
      h1: "Identique",
      metaDescription: null,
      firstParagraph: null,
    });
    expect(txt).toBe("Identique");
  });
});

describe("encode/decode embedding", () => {
  it("round trips a 1024-dim vector", () => {
    const v = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) v[i] = Math.sin(i) * 0.5;
    const encoded = encodeEmbedding(v);
    expect(encoded.byteLength).toBe(1024 * 4);
    const back = decodeEmbedding(encoded);
    expect(back).not.toBeNull();
    expect(back!.length).toBe(1024);
    for (let i = 0; i < 1024; i++) {
      expect(back![i]).toBeCloseTo(v[i], 6);
    }
  });

  it("returns null for wrong-sized blob", () => {
    expect(decodeEmbedding(new Uint8Array(10))).toBeNull();
    expect(decodeEmbedding(null)).toBeNull();
    expect(decodeEmbedding(undefined)).toBeNull();
  });
});

describe("cosineSimilarityF32", () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarityF32(v, v)).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarityF32(a, b)).toBeCloseTo(0, 6);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarityF32(new Float32Array([1, 2]), new Float32Array([1, 2, 3]))).toBe(0);
  });

  it("returns 0 for zero vector", () => {
    expect(cosineSimilarityF32(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0);
  });
});
