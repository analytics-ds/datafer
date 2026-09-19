import { describe, expect, it } from "vitest";
import { fr } from "@/lib/i18n/dictionaries/fr";
import { en } from "@/lib/i18n/dictionaries/en";
import { LOCALES, translate } from "@/lib/i18n";

describe("dictionnaires i18n", () => {
  it("couvre exactement les mêmes clés en français et en anglais", () => {
    const frKeys = Object.keys(fr).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("n'a aucune traduction vide", () => {
    for (const locale of LOCALES) {
      const dict = locale === "fr" ? fr : en;
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${locale}: ${key}`).not.toBe("");
      }
    }
  });

  it("garde les mêmes paramètres {…} dans les deux langues", () => {
    const params = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(fr) as Array<keyof typeof fr>) {
      expect(params(en[key]), `paramètres de ${key}`).toEqual(params(fr[key]));
    }
  });

  it("interpole les paramètres", () => {
    expect(translate("fr", "filters.reset", { count: 3 })).toContain("3");
    expect(translate("en", "filters.reset", { count: 3 })).toContain("3");
  });

  it("laisse un placeholder inconnu en place plutôt que de l'effacer", () => {
    expect(translate("fr", "filters.reset")).toContain("{count}");
  });
});
