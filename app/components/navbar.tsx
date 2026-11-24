"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import { themeLabels, themeOrder, themeSwatchClass } from "@/app/lib/themes";
import { useThemeStore } from "@/app/store/theme";
import AnimatedText from "./animated-text";

gsap.registerPlugin(useGSAP);

const INTRO_INDICATOR_DELAY = 0.1;
const THEME_INDICATOR_DELAY = 0.1;
const INDICATOR_DURATION = 0.4;
const CONTACT_STAGGER = { each: 0.02, from: "random" as const };

function getButtonOffset(list: HTMLElement, button: HTMLElement): { x: number; y: number } {
  const listRect = list.getBoundingClientRect();
  const btnRect = button.getBoundingClientRect();

  return {
    x: btnRect.left - listRect.left,
    y: btnRect.top - listRect.top,
  };
}

export default function Navbar() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const listRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hasPositioned = useRef(false);
  const prevTheme = useRef(theme);
  const contactRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const listEl = listRef.current;
      const indicator = indicatorRef.current;
      const contact = contactRef.current;

      if (!listEl || !indicator || !contact) return;

      const themeSwitcherButtom = gsap.utils.toArray<HTMLElement>(listEl.children).slice(1);
      const button = buttonRefs.current[themeOrder.indexOf(theme)];

      gsap.set(indicator, { autoAlpha: 0 });

      if (button) {
        gsap.set(indicator, { x: getButtonOffset(listEl, button).x + 14 });
        hasPositioned.current = true;
      }

      const tl = gsap.timeline();

      tl.fromTo(
        themeSwitcherButtom,
        { opacity: 0, yPercent: 100 },
        { opacity: 1, yPercent: 0, stagger: 0.1, delay: 1 },
      ).to(
        indicator,
        {
          autoAlpha: 1,
          duration: INDICATOR_DURATION,
          ease: "sine.in",
        },
        `+=${INTRO_INDICATOR_DELAY}`,
      );

      gsap.to(contact, {
        borderBottomWidth: 1,
        duration: 0.5,
        delay: 0.75,
      });

      // Reveal navbar images (logo, contact arrow), hidden via opacity-0
      gsap.fromTo(
        "img",
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.5, delay: 1 },
      );
    },
    { scope: navRef, dependencies: [] },
  );

  useGSAP(
    () => {
      const list = listRef.current;
      const indicator = indicatorRef.current;
      const index = themeOrder.indexOf(theme);
      const button = buttonRefs.current[index];

      if (!list || !indicator || !button) return;

      const { x } = getButtonOffset(list, button);

      if (prevTheme.current === theme) {
        if (!hasPositioned.current) {
          gsap.set(indicator, { x });
          hasPositioned.current = true;
        }
        return;
      }

      const prevIndex = themeOrder.indexOf(prevTheme.current);
      const movingRight = index > prevIndex;
      prevTheme.current = theme;

      gsap.fromTo(
        indicator,
        {
          rotate: 0,
          yPercent: -30,
        },
        {
          x: x + 14,
          yPercent: 0,
          rotate: movingRight ? 90 : -90,
          delay: THEME_INDICATOR_DELAY,
          duration: INDICATOR_DURATION,
          ease: "sine.inOut",
          overwrite: true,
        },
      );
    },
    { dependencies: [theme], scope: listRef },
  );

  return (
    <nav ref={navRef} className="relative flex shrink-0 items-center justify-between p-5 ">
      <Link href="/">
        <Image src="/images/logo.svg" alt="" width={40} height={40} className="opacity-0" />
      </Link>

      <ul
        ref={listRef}
        className="relative flex gap-[2px] items-center justify-between max-h-4 h-4 overflow-hidden px-1 py-4"
        role="list"
      >
        <div
          ref={indicatorRef}
          aria-hidden
          className="pointer-events-none absolute -left-4 size-4 border-2 border-(--theme-fg) z-50"
        />

        {themeOrder.map((id, index) => (
          <li key={id} role="listitem" className="flex items-center">
            <button
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              aria-label={themeLabels[id]}
              aria-pressed={theme === id}
              onClick={() => setTheme(id)}
              className={`size-3 cursor-pointer ${themeSwatchClass[id]}`}
            />
          </li>
        ))}
      </ul>
      <div className="flex gap-3 font-sans text-[16px] md:text-[20px]">
        <AnimatedText type="chars" stagger={CONTACT_STAGGER} delay={0.5} duration={1.5}>
          <Link href='/lab'>
            Lab
          </Link>
        </AnimatedText>
        <a href="mailto:contact@treflestudio.com">
          <div ref={contactRef} className="flex items-center gap-1">
            <AnimatedText type="chars" stagger={CONTACT_STAGGER} delay={0.5} duration={1.5}>
              <span>Contact</span>
            </AnimatedText>
            <div className="relative size-3 md:size-3.5">
              <Image src="/images/arrow.svg" alt="" fill className="opacity-0" />
            </div>
          </div>
        </a>
      </div>
    </nav>
  );
}
