"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import vertexSrc from "../noise/vertex.glsl";
import fragmentSrc from "./fragment.glsl";

type BackgroundUniforms = {
  u_time: { value: number };
  u_res: { value: THREE.Vector2 };
};

export default function BackgroundNoise() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
    });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x808080, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms: BackgroundUniforms = {
      u_time: { value: 0 },
      u_res: { value: new THREE.Vector2(1, 1) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: vertexSrc,
      fragmentShader: fragmentSrc,
      uniforms,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const syncSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      uniforms.u_res.value.set(w * dpr, h * dpr);
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    syncSize();

    let raf = 0;
    const start = performance.now();

    const tick = () => {
      if (!prefersReducedMotion) {
        uniforms.u_time.value = (performance.now() - start) * 0.001;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full mix-blend-overlay"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
