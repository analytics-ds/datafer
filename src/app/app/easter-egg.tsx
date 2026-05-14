"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

export function EasterEgg() {
  const firingRef = useRef(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + Shift + E -> pluie de confettis
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyE") {
        e.preventDefault();
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
