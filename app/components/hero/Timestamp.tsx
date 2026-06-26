import Image from "next/image";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

import AnimatedText from "../animated-text";

const data = [
  {
    label: "SITE TEMPORAIRE",
    imgUrl: "",
  },
  {
    label: "21:34 (CET)",
    imgUrl: "ellipse",
  },
  {
    label: "MARSEILLE, FR",
    imgUrl: "location",
  },
  {
    label: "WORKING WORLDWIDE",
    imgUrl: "globe",
  },
];

const TimeStamp = () => {
  const ref = useRef(null);

  useGSAP(() => {
    if (!ref.current) return;

    gsap.fromTo(
      "img",
      {
        autoAlpha: 0,
        y: 10,
      },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.5,
        delay: 1,
      },
    );
  });

  return (
    <ul ref={ref} className="flex justify-between text-[10px] sm:text-sm mt-15">
      {data.map((item) => {
        return (
          <li key={item.label} className="flex items-center gap-2 sm:gap-4">
            {item.imgUrl && (
              <Image
                src={`/images/${item.imgUrl}.svg`}
                alt={`${item.imgUrl} icon`}
                width={12}
                height={12}
                className="opacity-0"
              />
            )}
            <AnimatedText
              type="chars"
              delay={1}
              duration={1.5}
              stagger={{
                each: 0.025,
                from: "random",
              }}
            >
              <span style={{ letterSpacing: "-0.264px" }}>{item.label}</span>
            </AnimatedText>
          </li>
        );
      })}
    </ul>
  );
};

export default TimeStamp;
