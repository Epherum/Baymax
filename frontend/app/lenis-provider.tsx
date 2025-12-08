"use client";

import Lenis from "lenis";
import { useEffect } from "react";

type Props = {
  children: React.ReactNode;
};

export default function LenisProvider({ children }: Props) {
  useEffect(() => {
    const lenis = new Lenis({
      smoothWheel: true,
      lerp: 0.2, // higher lerp = snappier, less floaty
      duration: 0.6,
      wheelMultiplier: 0.9,
      touchMultiplier: 0.9,
    });

    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
