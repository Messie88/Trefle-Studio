"use client";

import { useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

import vertexSrc from "./vertex.glsl";
import fragmentSrc from "./fragment.glsl";

interface NoiseShaderProps {
  intensity?: number;
  className?: string;
}

export default function NoiseShader({
  intensity = 0.5,
  className,
}: NoiseShaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useGSAP(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    gsap.from(canvas, {
      duration: 2,
      width: 0,
      height: 0,
      skewY: -50,
      skewX: 50,
      scale: 10,
      position: "absolute",
      top: "50%",
      left: "50%",
      ease: "expo.out",
      rotationZ: 90,
    });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(container.clientWidth, container.clientHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      u_time: { value: 0 },
      u_res: {
        value: new THREE.Vector2(
          container.clientWidth * dpr,
          container.clientHeight * dpr,
        ),
      },
      u_mouse: { value: new THREE.Vector2(10) },
      u_intensity: { value: intensity },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: vertexSrc,
      fragmentShader: fragmentSrc,
      uniforms,
      transparent: true,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const LERP_RATE = 0.1;
    const SETTLE_EPS = 0.0001;

    let targetMx = 0.5;
    let targetMy = 0.5;
    let mx = 0.5;
    let my = 0.5;
    let lastMx = 0.5;
    let lastMy = 0.5;
    let targetMouseTime = 0;
    let mouseTime = 0;
    let dirty = true;

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const w = rect.width || 1;
      const h = rect.height || 1;
      const nx = (e.clientX - rect.left) / w;
      const ny = 1 - (e.clientY - rect.top) / h;
      targetMouseTime += Math.hypot(nx - lastMx, ny - lastMy) * 6.0;
      lastMx = nx;
      lastMy = ny;
      targetMx = nx;
      targetMy = ny;
      dirty = true;
    };
    window.addEventListener("mousemove", onMove);

    const syncSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      uniforms.u_res.value.set(w * dpr, h * dpr);
      dirty = true;
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    let raf = 0;
    const tick = () => {
      if (dirty) {
        mx = lerp(mx, targetMx, LERP_RATE);
        my = lerp(my, targetMy, LERP_RATE);
        mouseTime = lerp(mouseTime, targetMouseTime, LERP_RATE);

        uniforms.u_time.value = mouseTime;
        uniforms.u_mouse.value.set(mx, my);
        renderer.render(scene, camera);

        if (
          Math.abs(targetMx - mx) < SETTLE_EPS &&
          Math.abs(targetMy - my) < SETTLE_EPS &&
          Math.abs(targetMouseTime - mouseTime) < SETTLE_EPS
        ) {
          mx = targetMx;
          my = targetMy;
          mouseTime = targetMouseTime;
          dirty = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [intensity]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full "
    >
      {/* <ul className="text-[12px] text-white/60 font-serif absolute top-1/2 -translate-y-1/2 right-5 flex gap-5">
        <li className="flex items-center gap-[12px]">
          <Image
            src="/figma/ellipse.svg"
            alt=""
            width={10}
            height={10}
            className="shrink-0"
          />
          <span className="text-[12px] text-white/60 font-serif">21:34 (CET)</span>
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
      <canvas
        ref={canvasRef}
        aria-hidden
        className="h-full w-full"
      />
    </div>
  );
}
