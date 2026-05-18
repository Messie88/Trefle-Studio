"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import React, { useEffect, useRef, useState } from "react";

interface Props {
  children: any;
  className?: string;
  animateOnScroll?: boolean;
  duration?: number;
  hasHover?: boolean;
  delay?: number;
  type?: "chars" | "lines" | "words";
  tl?: gsap.core.Timeline;
  scrub?: boolean;
  stagger?: {
    each?: number;
    from?: "center" | "end" | "start" | "edges" | "random" | [number, number];
  } | number;
  ease?: string;
}

const AnimatedText = ({
  children,
  className,
  animateOnScroll,
  duration = 0.5,
  hasHover = false,
  delay = 0,
  type = "lines",
  tl,
  scrub = false,
  stagger = 0.05,
  ease = "expo.out",
}: Props) => {
  const containerRef = useRef<any>(null);
  const linesRef = useRef<any[]>([]);
  const hasAnimatedRef = useRef(false);
  const isResizeReflowRef = useRef(false);
  const [resizeKey, setResizeKey] = useState(0);

  useEffect(() => {
    const resizeHandler = () => {
      isResizeReflowRef.current = true;
      setResizeKey((prev) => prev + 1);
    };

    const debounceFunction = (cb: () => void, delay: number) => {
      let timer: number;

      return () => {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => cb(), delay);
      };
    };

    const debounce = debounceFunction(resizeHandler, 300);

    window.addEventListener("resize", debounce);

    return () => {
      window.removeEventListener("resize", debounce);
    };
  }, []);

  useGSAP(
    () => {
      if (!containerRef.current) return;
      const isResizeReflow = isResizeReflowRef.current;
      isResizeReflowRef.current = false;
      linesRef.current = [];

      let elements = [];

      if (containerRef.current.hasAttribute("data-copy-wrapper")) {
        elements = Array.from(containerRef.current.children);
      } else {
        elements = [containerRef.current];
      }

      elements.forEach((element) => {
        const split = SplitText.create(element, {
          type: "chars,lines",
          mask: "lines",
          linesClass: "line++",
        });

        const computedStyle = window.getComputedStyle(element);
        const textIndent = computedStyle.textIndent;

        if (textIndent && textIndent !== "0px") {
          if (Array.isArray(split[type])) {
            split.lines[0]?.setAttribute(
              "style",
              `padding-left: ${textIndent}`,
            );
          }

          element.style.textIndent = textIndent;
        }

        linesRef.current.push(split[type]);
      });

      gsap.set(linesRef.current, {
        yPercent: 120,
      });

      // Make container visible only after lines are hidden (prevents FOUC)
      gsap.set(containerRef.current, { visibility: "visible" });

      // Keep text reflowed on resize without replaying the intro animation.
      if (isResizeReflow && hasAnimatedRef.current) {
        gsap.set(linesRef.current, { yPercent: 0 });
        return;
      }

      const animationProps = {
        yPercent: 0,
        duration: 1.2,
        ease,
        stagger,
        delay,
        onStart: () => {
          hasAnimatedRef.current = true;
        },
      };

      if (tl) {
        // tl.to(linesRef.current, animationProps);
        if (animateOnScroll) {
          tl?.to(
            linesRef.current,
            {
              ...animationProps,
              scrollTrigger: {
                trigger: containerRef.current,
                start: "top top",
                end: "bottom 50%",
                scrub,
              },
            },
            "<",
          );
        } else {
          tl?.to(linesRef.current, animationProps, "<");
        }
      } else {
        if (animateOnScroll) {
          gsap?.to(linesRef.current, {
            ...animationProps,
            scrollTrigger: {
              trigger: containerRef.current,
              // end: "top 70%",
              // start: "top top",
              end: "bottom 50%",
              scrub,
            },
          });
        } else {
          gsap.to(linesRef.current, animationProps);
        }
      }
    },
    {
      scope: containerRef,
      dependencies: [
        animateOnScroll,
        delay,
        duration,
        ease,
        resizeKey,
        scrub,
        stagger,
        tl,
        type,
      ],
    },
  );

  if (React.Children.count(children) === 1) {
    const child = React.Children.only(children);
    return React.cloneElement(child, {
      ref: containerRef,
      style: {
        ...(child.props as { style?: React.CSSProperties }).style,
        visibility: "hidden" as const,
      },
    } as React.Attributes & {
      ref: React.Ref<unknown>;
    });
  }

  return (
    <div
      ref={containerRef}
      data-copy-wrapper="true"
      style={{ visibility: "hidden" }}
      className={(className)}
    >
      {children}
    </div>
  );
};

export default AnimatedText;
