"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { Observer } from "gsap/Observer";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import ScrollTriggerConfig from "./scrollTrigger";

// Register all plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(
    ScrollTrigger,
    ScrollSmoother,
    SplitText,
    useGSAP,
    MotionPathPlugin,
    Observer,
  );
}

interface GSAPProps {
  scrollTrigger?: boolean;
}

export function GSAP({ scrollTrigger = false }: GSAPProps) {
  useGSAP(
    () => {
      gsap.defaults({ ease: "none" });
      gsap.ticker.lagSmoothing(0);

      if (!scrollTrigger) return;

      ScrollTrigger.config({ ignoreMobileResize: true });

      const id = requestAnimationFrame(() => {
        if (!ScrollSmoother.get()) {
          ScrollSmoother.create({
            smooth: 2,
            effects: true,
            speed: 0.75,
            smoothTouch: 0.01,
            normalizeScroll: true,
            ignoreMobileResize: true,
          });
        }
        ScrollTrigger.refresh();
      });

      return () => {
        cancelAnimationFrame(id);
        ScrollSmoother.get()?.kill();
      };
    },
    { dependencies: [scrollTrigger] },
  );

  return scrollTrigger ? <ScrollTriggerConfig /> : null;
}
