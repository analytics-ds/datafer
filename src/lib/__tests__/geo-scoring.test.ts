import { describe, it, expect } from "vitest";
import { geoSignalsFromHtml } from "@/lib/geo-scoring";

describe("geoSignalsFromHtml", () => {
  it("retourne des signaux vides sur un HTML sans structure", () => {
    const s = geoSignalsFromHtml(
      "<p>Juste un paragraphe sans rien de particulier dedans.</p>",
    );
    expect(s.hasTable).toBe(false);
    expect(s.bulletItemsCount).toBe(0);
    expect(s.hasQuickSummary).toBe(false);
    expect(s.faqQuestionsCount).toBe(0);
    expect(s.numericMentionsCount).toBe(0);
  });

  it("détecte un tableau contenant des cellules de données", () => {
    const s = geoSignalsFromHtml(
      "<table><tr><th>A</th></tr><tr><td>1</td></tr></table>",
    );
    expect(s.hasTable).toBe(true);
  });

  it("ne compte pas un tableau sans cellule de données", () => {
    const s = geoSignalsFromHtml(
      "<table><tr><th>A</th><th>B</th></tr></table>",
    );
    expect(s.hasTable).toBe(false);
  });

  it("compte les items de liste", () => {
    const s = geoSignalsFromHtml(
      "<ul><li>un</li><li>deux</li><li>trois</li></ul>",
    );
    expect(s.bulletItemsCount).toBe(3);
  });

  it("détecte un quick summary en italique en tête de contenu", () => {
    const html =
      "<p><em>En bref : ce contenu résume les points essentiels à connaître absolument.</em></p>" +
      "<h1>Titre</h1><p>La suite du contenu.</p>";
    expect(geoSignalsFromHtml(html).hasQuickSummary).toBe(true);
  });

  it("détecte un quick summary via un heading dédié", () => {
    const html = "<h1>Titre</h1><h2>À retenir</h2><p>Les points clés.</p>";
    expect(geoSignalsFromHtml(html).hasQuickSummary).toBe(true);
  });

  it("compte les questions d'une section FAQ", () => {
    const html =
      "<h2>FAQ</h2><h3>Comment faire ?</h3><p>Réponse.</p>" +
      "<h3>Pourquoi choisir ?</h3><p>Réponse.</p>";
    const s = geoSignalsFromHtml(html);
    expect(s.faqQuestionsCount).toBeGreaterThanOrEqual(2);
  });

  it("compte les mentions chiffrées avec unités", () => {
    const html =
      "<p>Économisez 200€ en 15 minutes, soit 30% de réduction.</p>";
    expect(geoSignalsFromHtml(html).numericMentionsCount).toBe(3);
  });
});
