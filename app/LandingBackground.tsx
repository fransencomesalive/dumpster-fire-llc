"use client";

import { useEffect, useRef } from "react";
import styles from "./site.module.css";

const meshBlooms = [
  { hex: "#F3E8D2", radiusMin: 0.55, radiusMax: 0.75, alpha: "dd" },
  { hex: "#DFC9A6", radiusMin: 0.2, radiusMax: 0.3, alpha: "66" },
  { hex: "#F3E8D2", radiusMin: 0.38, radiusMax: 0.52, alpha: "99" },
  { hex: "#DFC9A6", radiusMin: 0.5, radiusMax: 0.68, alpha: "cc" },
  { hex: "#DFC9A6", radiusMin: 0.52, radiusMax: 0.7, alpha: "cc" },
  { hex: "#DFC9A6", radiusMin: 0.18, radiusMax: 0.28, alpha: "55" },
  { hex: "#F3E8D2", radiusMin: 0.48, radiusMax: 0.65, alpha: "cc" },
  { hex: "#DFC9A6", radiusMin: 0.15, radiusMax: 0.25, alpha: "44" },
];

type MeshBloom = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  hex: string;
  alpha: string;
  radius: number;
};

function drawMesh(context: CanvasRenderingContext2D, blooms: MeshBloom[], width: number, height: number) {
  context.fillStyle = "#DFC9A6";
  context.fillRect(0, 0, width, height);

  blooms.forEach((bloom) => {
    const x = bloom.x * width;
    const y = bloom.y * height;
    const radius = bloom.radius * Math.max(width, height);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, `${bloom.hex}${bloom.alpha}`);
    gradient.addColorStop(0.55, `${bloom.hex}55`);
    gradient.addColorStop(1, `${bloom.hex}00`);

    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

function drawStatic(
  context: CanvasRenderingContext2D,
  imageData: ImageData,
  width: number,
  height: number,
  particleCount: number,
) {
  const pixels = imageData.data;

  pixels.fill(0);

  for (let index = 0; index < particleCount; index += 1) {
    const pixelIndex = ((Math.random() * height | 0) * width + (Math.random() * width | 0)) * 4;

    pixels[pixelIndex] = 138;
    pixels[pixelIndex + 1] = 96;
    pixels[pixelIndex + 2] = 55;
    pixels[pixelIndex + 3] = 82;
  }

  context.putImageData(imageData, 0, 0);
}

export default function LandingBackground() {
  const meshRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const meshCanvas = meshRef.current;
    const staticCanvas = staticRef.current;
    const meshContext = meshCanvas?.getContext("2d");
    const staticContext = staticCanvas?.getContext("2d");

    if (!meshCanvas || !staticCanvas || !meshContext || !staticContext) return;

    const mesh = meshCanvas;
    const statik = staticCanvas;
    const meshDraw = meshContext;
    const staticDraw = staticContext;

    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;
    let staticWidth = 0;
    let staticHeight = 0;
    let staticImageData = staticDraw.createImageData(1, 1);
    let staticParticleCount = 0;
    let animationFrame = 0;
    let frame = 0;
    const blooms = meshBlooms.map((bloom) => ({
      x: Math.random(),
      y: Math.random(),
      velocityX: (Math.random() - 0.5) * 0.00025,
      velocityY: (Math.random() - 0.5) * 0.00025,
      hex: bloom.hex,
      alpha: bloom.alpha,
      radius: bloom.radiusMin + Math.random() * (bloom.radiusMax - bloom.radiusMin),
    }));

    function resize() {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      staticWidth = Math.floor(1.5 * viewportWidth);
      staticHeight = Math.floor(1.5 * viewportHeight);

      mesh.width = viewportWidth;
      mesh.height = viewportHeight;
      statik.width = staticWidth;
      statik.height = staticHeight;
      statik.style.width = `${viewportWidth}px`;
      statik.style.height = `${viewportHeight}px`;
      staticDraw.imageSmoothingEnabled = false;

      staticImageData = staticDraw.createImageData(staticWidth, staticHeight);
      staticParticleCount = Math.floor(staticWidth * staticHeight * 0.018);

      drawMesh(meshDraw, blooms, viewportWidth, viewportHeight);
      drawStatic(staticDraw, staticImageData, staticWidth, staticHeight, staticParticleCount);
    }

    function animate() {
      frame += 1;

      if (frame % 2 === 0) {
        blooms.forEach((bloom) => {
          bloom.x += bloom.velocityX;
          bloom.y += bloom.velocityY;

          if (bloom.x < 0.05 || bloom.x > 0.95) bloom.velocityX *= -1;
          if (bloom.y < 0.05 || bloom.y > 0.95) bloom.velocityY *= -1;
        });

        drawMesh(meshDraw, blooms, viewportWidth, viewportHeight);
      }

      if (frame % 3 === 0) {
        drawStatic(staticDraw, staticImageData, staticWidth, staticHeight, staticParticleCount);
      }

      animationFrame = window.requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener("resize", resize);
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <>
      <canvas ref={meshRef} className={styles.publicLandingMesh} aria-hidden="true" />
      <canvas ref={staticRef} className={styles.publicLandingStatic} aria-hidden="true" />
    </>
  );
}
