"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Link from "next/link";

import TimeStamp from "./Timestamp";
import NoiseShader from "../noise";
import Navbar from "../navbar";
import AnimatedText from "../animated-text";

gsap.registerPlugin(useGSAP);

export default function Hero() {
  const textRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.to("a", {
        borderBottomWidth: 2,
        duration: 0.5,
        delay: 0.75,
      });
    },
    { scope: textRef },
  );

  return (
    <main className="flex h-svh flex-col justify-between p-5 overflow-hidden">
      <TimeStamp />
      <div className="relative min-h-0 w-full flex-1 overflow-hidden my-4">
        <NoiseShader />
      </div>
      <div ref={textRef} className="flex flex-col gap-2 lg:flex-row lg:justify-between lg:items-end ">
        <AnimatedText
          type="chars"
          stagger={{
            each: 0.025,
            from: "random",
          }}
          duration={1.5}
        >
          <h1>
            Trèfle Studio
            <span className="ml-1 inline-block">
              <Image src="/images/trefle.svg" alt="" width={12} height={17} />
            </span>
          </h1>
        </AnimatedText>
        <AnimatedText
          delay={0.5}
          duration={1.5}
          type="chars"
          stagger={{
            each: 0.001,
            from: "random",
          }}
        >
          <p className="w-full text-lg lg:max-w-170 lg:text-[28px] leading-[1.2] text-justify">
            Basé à Marseille, nous concevons des sites internets taillés sur-mesure, pensés pour se
            démarquer (
            <Link className="border-b-0 border-(--theme-fg)" href="/services">
              UX/UI Design
            </Link>{" "}
            et{" "}
            <Link className="border-b-0 border-(--theme-fg)" href="/services">
              Développement web
            </Link>{" "}
            créatif), performer et convertir vos visiteurs en clients (
            <Link className="border-b-0 border-(--theme-fg)" href="/services">
              SEO
            </Link>
            ).
          </p>
        </AnimatedText>
      </div>
    </main>
  );
}
