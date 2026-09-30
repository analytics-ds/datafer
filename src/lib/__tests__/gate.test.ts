import { describe, it, expect } from "vitest";
import { gate } from "@/lib/gate";

const PWD = "mot-de-passe-test";
const prod = { GATE_MODE: "direct", GATE_PASSWORD: PWD, PROXY_SECRET: "sig" };
const preprod = { GATE_MODE: "all", GATE_PASSWORD: PWD };
const req = (url: string, init: RequestInit = {}) => new Request(url, init);

async function login(env: typeof preprod, url: string) {
  const body = new URLSearchParams({ password: PWD, next: "/app" });
  const r = await gate(req(`${url}/__gate`, { method: "POST", body }), env);
  return r!.headers.get("set-cookie")!.split(";")[0];
}

describe("gate", () => {
  it("prod : corpus.datashake.fr relayé et signé passe", async () => {
    expect(await gate(req("https://datafer.analytics-e0d.workers.dev/app", { headers: { "x-corpus-proxy": "sig" } }), prod)).toBeNull();
  });
  it("prod : accès direct workers.dev sans signature → page de mot de passe", async () => {
    const r = await gate(req("https://datafer.analytics-e0d.workers.dev/app"), prod);
    expect(r?.status).toBe(200);
    expect(await r!.text()).toContain('type="password"');
  });
  it("prod : fausse signature refusée", async () => {
    const r = await gate(req("https://datafer.analytics-e0d.workers.dev/app", { headers: { "x-corpus-proxy": "faux" } }), prod);
    expect(r).not.toBeNull();
  });
  it("API et crons en Bearer passent, contrôlés par leur propre clé", async () => {
    expect(await gate(req("https://datafer-preprod.analytics-e0d.workers.dev/api/v1/briefs", { headers: { authorization: "Bearer dfk_x" } }), preprod)).toBeNull();
  });
  it("preprod : tout est verrouillé, le bon mot de passe pose un cookie qui ouvre", async () => {
    const url = "https://datafer-preprod.analytics-e0d.workers.dev";
    expect(await gate(req(`${url}/app`), preprod)).not.toBeNull();
    const cookie = await login(preprod, url);
    expect(await gate(req(`${url}/app`, { headers: { cookie } }), preprod)).toBeNull();
  });
  it("mauvais mot de passe → 401, pas de cookie", async () => {
    const body = new URLSearchParams({ password: "non", next: "/" });
    const r = await gate(req("https://x.workers.dev/__gate", { method: "POST", body }), preprod);
    expect(r?.status).toBe(401);
    expect(r?.headers.get("set-cookie")).toBeNull();
  });
  it("redirection après saisie limitée au même site", async () => {
    const body = new URLSearchParams({ password: PWD, next: "//evil.com" });
    const r = await gate(req("https://x.workers.dev/__gate", { method: "POST", body }), preprod);
    expect(r?.headers.get("location")).toBe("/");
  });
  it("sans mot de passe configuré, on ferme", async () => {
    const r = await gate(req("https://x.workers.dev/"), { GATE_MODE: "all" });
    expect(r?.status).toBe(403);
  });
  it("sans GATE_MODE, rien ne change", async () => {
    expect(await gate(req("https://x.workers.dev/"), {})).toBeNull();
  });
});
