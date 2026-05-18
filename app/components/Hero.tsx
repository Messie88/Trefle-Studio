"use client";

import { useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import NoiseShader from "./noise";
import Navbar from "./navbar";
import Link from "next/link";
import AnimatedText from "./animated-text";

gsap.registerPlugin(useGSAP);

export default function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <main
      ref={rootRef}
      className="flex h-svh flex-col justify-between p-5 gap-5 overflow-hidden"
    >
      <Navbar />
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
          <NoiseShader />

        {/* <ul className=" absolute top-1/2 -translate-y-1/2 gap-[32px]">
          <li className="flex items-center gap-[12px]">
            <Image
              src="/figma/ellipse.svg"
              alt=""
              width={10}
              height={10}
              className="shrink-0"
            />
            <span className="text-[12px] font-serif">21:34 (CET)</span>
          </li>
          <li className="flex items-center gap-[12px]">
            <Image
              src="/figma/loc1.svg"
              alt=""
              width={12}
              height={12}
              className="shrink-0"
            />
            <span style={{ letterSpacing: "-0.264px" }}>Marseille, FR</span>
          </li>
          <li className="flex items-center gap-[12px]">
            <Image
              src="/figma/globe.svg"
              alt=""
              width={12}
              height={12}
              className="shrink-0"
            />
            <span style={{ letterSpacing: "-0.264px" }}>Worldwide</span>
          </li>
        </ul> */}
      </div>
      <div className="flex flex-col lg:flex-row lg:justify-between">
        <div className=" relative">
          <AnimatedText 
            delay={.75} 
            stagger={{
              each: .025,
              from: "random",
            }}
            duration={1.5}
            type="chars"
          >
            <span className="absolute -top-2 text-[10px] ">SITE TEMPORAIRE</span>
          </AnimatedText>
          <AnimatedText 
          type="chars" 
          stagger={{
            each: .025,
            from: "random",
          }}
          duration={1.5}
          >
            <h1 className="flex">
              Trèfle Studio
              <span className="ml-1 inline-block">
                <Image
                  src="/figma/trefle.svg"
                  alt=""
                  width={12}
                  height={17}
                />
              </span>
            </h1>
          </AnimatedText>
        </div>
        <AnimatedText delay={.5} duration={1.5} stagger={{
            each: .001,
            from: "random",
          }}>
          <p className="w-full text-lg lg:max-w-[680px] lg:text-[28px] leading-[1.2] text-justify">
            Basé à Marseille, nous concevons des sites internets taillés sur-mesure, pensés pour se
            démarquer (<Link className="underline" href="/services">UX/UI Design</Link> et{" "}
            <Link className="underline" href="/services">Développement web</Link> créatif), performer et
            convertir vos visiteurs en clients (<Link className="underline" href="/services">SEO</Link>).
          </p>
        </AnimatedText>
      </div>
    </main>
  );
}
