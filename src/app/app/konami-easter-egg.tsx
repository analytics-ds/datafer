"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
];

export function KonamiEasterEgg() {
  const bufferRef = useRef<string[]>([]);
  const firingRef = useRef(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Ignore quand l'utilisateur tape dans l'éditeur de brief ou un input
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }

      const buf = bufferRef.current;
      buf.push(e.code);
      if (buf.length > SEQUENCE.length) buf.shift();
      if (buf.length === SEQUENCE.length && buf.every((k, i) => k === SEQUENCE[i])) {
        bufferRef.current = [];
        fire();
      }
    }

    function fire() {
      if (firingRef.current) return;
      firingRef.current = true;

      try {
        const audio = new Audio("/sounds/yay.mp3");
        audio.volume = 0.7;
        audio.play().catch(() => {});
      } catch {}

      const duration = 5000;
      const end = Date.now() + duration;
      const defaults = {
        startVelocity: 35,
        spread: 360,
        ticks: 70,
        zIndex: 9999,
        shapes: ["circle", "square", "star"] as confetti.Shape[],
      };

      confetti({
        particleCount: 220,
        spread: 110,
        origin: { y: 0.6 },
        shapes: defaults.shapes,
        zIndex: defaults.zIndex,
      });

      const interval = window.setInterval(() => {
        const left = end - Date.now();
        if (left <= 0) {
          window.clearInterval(interval);
          firingRef.current = false;
          return;
        }
        const count = 60 * (left / duration);
        confetti({
          ...defaults,
          particleCount: count,
          origin: { x: 0.1 + Math.random() * 0.2, y: Math.random() * 0.6 + 0.1 },
        });
        confetti({
          ...defaults,
          particleCount: count,
          origin: { x: 0.7 + Math.random() * 0.2, y: Math.random() * 0.6 + 0.1 },
        });
      }, 220);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
