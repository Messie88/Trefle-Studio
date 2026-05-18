'use client';

import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const ScrollTriggerConfig = () => {
  useGSAP(() => {
    // Clear any existing ScrollTrigger instances
    ScrollTrigger.clearScrollMemory('manual');

    // Set ScrollTrigger defaults
    ScrollTrigger.defaults({});
  }, []);

  return null;
};

export default ScrollTriggerConfig;
