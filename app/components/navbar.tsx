import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="relative flex shrink-0 justify-between items-center">
        <Link 
        href='/'
        >
          <Image
            src="/figma/logo.svg"
            alt=""
            width={40}
            height={40}
          />
        </Link>

        <ul className="flex gap-[2px]">
          <li className="size-[12px] border-2 border-cream bg-blue" />
          <li className="size-[12px] bg-red" />
          <li className="size-[12px] bg-amber" />
        </ul>

        <a
          href="mailto:contact@treflestudio.com"
        >
          <div className="flex items-center gap-1">
            <span
              className="font-sans text-[16px] md:text-[20px]"
            >
              Contact
            </span>
            <div className="relative w-2 h-2 md:w-3 md:h-3">
              <Image
                src="/figma/arrow.svg"
                alt=""
                fill
              />
            </div>
          </div>
          
          <div
            className=" w-full h-px md:h-[2px] bg-cream"
          />
        </a>
    </nav>
  );
}