// Embeddings bge-m3 pour les URLs du sitemap + les paragraphes d'éditeur.
// Modèle : `@cf/baai/bge-m3`, 1024 dimensions, multilingue, gratuit dans
// Workers AI (même modèle que le critère sémantique paragraphe de iter 8).
//
// On s'appuie sur le type global `Ai` injecté par cloudflare-env.d.ts plutôt
// qu'un import explicite, pour éviter le conflit entre la version générée
// par wrangler et celle de @cloudflare/workers-types.

const EMBEDDING_DIM = 1024;
const EMBEDDING_BATCH_SIZE = 50;
const MODEL = "@cf/baai/bge-m3";

// Construit l'input texte à embedder pour une URL indexée.
// Format : "title \n h1 \n meta_description \n first_paragraph".
// Les sections vides sont skippées. Ça reste compact (qq centaines de tokens)
// donc bge-m3 (capacité 8192) ne tronque jamais.
export function buildUrlEmbeddingInput(parts: {
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  firstParagraph: string | null;
}): string {
  const lines: string[] = [];
  if (parts.title) lines.push(parts.title);
  if (parts.h1 && parts.h1 !== parts.title) lines.push(parts.h1);
  if (parts.metaDescription) lines.push(parts.metaDescription);
  if (parts.firstParagraph) lines.push(parts.firstParagraph);
  return lines.join("\n");
}

// Embed un batch de textes. Retourne null pour les entrées vides afin
// de garder l'alignement avec l'input.
export async function embedTexts(
  ai: Ai | undefined,
  texts: string[],
): Promise<(Float32Array | null)[]> {
  if (!ai) return texts.map(() => null);
  const result: (Float32Array | null)[] = new Array(texts.length).fill(null);
  const indices: number[] = [];
  const nonEmpty: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]?.trim();
    if (t && t.length > 0) {
      indices.push(i);
      nonEmpty.push(t);
    }
  }
  if (nonEmpty.length === 0) return result;

  for (let i = 0; i < nonEmpty.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = nonEmpty.slice(i, i + EMBEDDING_BATCH_SIZE);
    const data = await runWithRetry(ai, batch);
    if (!data) continue;
    for (let j = 0; j < data.length; j++) {
      const vec = data[j];
      if (!vec || vec.length !== EMBEDDING_DIM) continue;
      const f32 = new Float32Array(EMBEDDING_DIM);
      for (let k = 0; k < EMBEDDING_DIM; k++) f32[k] = vec[k];
      result[indices[i + j]] = f32;
    }
  }
  return result;
}

// Retry interne pour absorber les erreurs transientes de Workers AI (1031,
// 429, timeouts). Backoff exponentiel 0 / 500ms / 1500ms.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runWithRetry(ai: any, batch: string[]): Promise<number[][] | null> {
  const delays = [0, 500, 1500];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      const r = (await ai.run(MODEL, { text: batch })) as { data?: number[][] };
      if (r.data && r.data.length > 0) return r.data;
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`[maillage] embed retry=${attempt} : ${msg}`);
      if (msg.includes("invalid") || msg.includes("input")) return null;
    }
  }
  console.log(`[maillage] embed batch failed after 3 attempts (size=${batch.length})`);
  return null;
}

// Sérialise un embedding Float32Array vers Uint8Array prêt pour BLOB D1.
export function encodeEmbedding(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

// Désérialise depuis BLOB D1 vers Float32Array. Accepte ArrayBuffer ou
// Uint8Array (drizzle peut retourner l'un ou l'autre selon driver).
export function decodeEmbedding(blob: ArrayBuffer | Uint8Array | null | undefined): Float32Array | null {
  if (!blob) return null;
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (bytes.byteLength !== EMBEDDING_DIM * 4) return null;
  // Copie pour garantir alignement (le slice du buffer parent peut être unaligned).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}

// Cosinus similarity entre deux Float32Array de même longueur.
// Optimisé : pas d'allocations, single pass.
export function cosineSimilarityF32(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
