"use client";

import { useGSAP } from "@gsap/react";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useState } from "react";

// import clsx from "clsx";
import { GSAP } from "@/app/components/gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";

export default function ClientLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useGSAP(() => {
    setMounted(true);
  }, { dependencies: [] });

  useGSAP(
    () => {
      if (!mounted) return;

      // Ensure route changes start from the top even with GSAP ScrollSmoother enabled.
      const smoother = ScrollSmoother.get();

      if (smoother) {
        smoother.scrollTo(0, false);
        return;
      }

      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    },
    { dependencies: [pathname, mounted] },
  );

  // ScrollSmoother wrappers are client-only: avoids hydration mismatches when
  // extensions inject nodes into <body> before React hydrates.
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <div id="smooth-wrapper">
      <div
        id="smooth-content"
        // className={clsx(!isHome && "pt-30", "relative overflow-hidden")}
      >
        {children}
      </div>
      <GSAP scrollTrigger />
    </div>
  );
}
