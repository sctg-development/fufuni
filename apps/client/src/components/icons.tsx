/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import * as React from "react";

import { IconSvgProps } from "@/types";

export const Logo: React.FC<IconSvgProps> = ({
  size = 36,
  height,
  width,
  ...props
}) => (
  <svg
    viewBox="0 0 1024 1024"
    height={size || height}
    width={size || width || height}
    {...props}
  >
    <defs>
      <style>{`
        .logo-st0{fill:#DCDCDC;enable-background:new;}
        .logo-st1{fill:url(#SVGID_1_);}
        .logo-st2{fill:url(#SVGID_2_);}
        .logo-st3{fill:url(#SVGID_3_);}
        .logo-st4{fill:url(#SVGID_4_);}
        .logo-st5{fill:#E11D2F;}
        .logo-st9{fill:#258035;}
        .logo-st10{fill:#D54A15;}
        .logo-st11{fill:#C51262;}
        .logo-st12{fill:#53266B;}
        .logo-st13{fill:#9A2A7C;}
        .logo-st14{fill:#98B91F;}
        .logo-st15{fill:#EEAD00;}
        .logo-st16{fill:#298F85;}
      `}</style>
      <linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="595.6584" y1="-248.4599" x2="597.2776" y2="-246.8407" gradientTransform="matrix(227.3079 0 0 216.4182 -135288.75 53838.5664)">
        <stop offset="0" stopColor="#F58220"/>
        <stop offset="1" stopColor="#F6C026"/>
      </linearGradient>
      <linearGradient id="SVGID_2_" gradientUnits="userSpaceOnUse" x1="596.6025" y1="-248.7029" x2="598.2217" y2="-247.0837" gradientTransform="matrix(227.3079 0 0 216.4182 -135031.4375 53838.5664)">
        <stop offset="0" stopColor="#D81B8A"/>
        <stop offset="1" stopColor="#17B7C7"/>
      </linearGradient>
      <linearGradient id="SVGID_3_" gradientUnits="userSpaceOnUse" x1="595.7703" y1="-249.1149" x2="597.1862" y2="-247.6989" gradientTransform="matrix(227.3079 0 0 151.7836 -135288.75 38222.7227)">
        <stop offset="0" stopColor="#6F2DA8"/>
        <stop offset="1" stopColor="#9C27B0"/>
      </linearGradient>
      <linearGradient id="SVGID_4_" gradientUnits="userSpaceOnUse" x1="596.4193" y1="-249.4077" x2="598.0186" y2="-247.8085" gradientTransform="matrix(227.3079 0 0 151.7836 -135031.4375 38222.7227)">
        <stop offset="0" stopColor="#16A34A"/>
        <stop offset="1" stopColor="#84CC16"/>
      </linearGradient>
    </defs>
    <path className="logo-st0" d="M91,270.1C91,67.7,333.9-13.2,512,116.3C690.1-13.2,933,67.7,933,270.1c0,178.1-194.3,239.6-356.2,315.8v150.55c0,6.27-5.08,11.35-11.35,11.35H458.63c-6.31,0-11.43-5.12-11.43-11.43V585.9C285.3,509.8,91,448.3,91,270.1z"/>
    <path className="logo-st1" d="M139.6,229.7C155.8,59.6,333.9,3,487.7,116.3C358.2,237.8,269.1,302.5,139.6,407.8C99.1,334.9,131.5,302.5,139.6,229.7z"/>
    <path className="logo-st2" d="M884.4,229.7C868.2,59.6,690.1,3,536.3,116.3c129.5,121.4,218.6,186.2,348.1,291.5C924.9,334.9,892.5,302.5,884.4,229.7z"/>
    <path className="logo-st3" d="M139.6,407.8c129.5-40.5,218.6,24.3,348.1,145.7c-153.8,113.3-331.9,56.7-348.1-113.3C138.7,418.42,139.6,407.8,139.6,407.8z"/>
    <path className="logo-st4" d="M884.4,407.8c-129.5-40.5-218.6,24.3-348.1,145.7C690.1,666.9,860,609.2,884.4,440.2C887.1,421.9,884.4,407.8,884.4,407.8z"/>
    <path className="logo-st5" d="M534.6,188.1l124.2,124.2c12.5,12.5,12.5,32.8,0,45.3L534.6,481.7c-12.5,12.5-32.8,12.5-45.3,0L365.2,357.5c-12.5-12.5-12.5-32.8,0-45.3L489.4,188C501.9,175.6,522.1,175.6,534.6,188.1z"/>
  </svg>
);

export const DiscordIcon: React.FC<IconSvgProps> = ({
  size = 24,
  width,
  height,
  ...props
}) => {
  return (
    <svg
      height={size || height}
      viewBox="0 0 24 24"
      width={size || width}
      {...props}
    >
      <path
        d="M14.82 4.26a10.14 10.14 0 0 0-.53 1.1 14.66 14.66 0 0 0-4.58 0 10.14 10.14 0 0 0-.53-1.1 16 16 0 0 0-4.13 1.3 17.33 17.33 0 0 0-3 11.59 16.6 16.6 0 0 0 5.07 2.59A12.89 12.89 0 0 0 8.23 18a9.65 9.65 0 0 1-1.71-.83 3.39 3.39 0 0 0 .42-.33 11.66 11.66 0 0 0 10.12 0q.21.18.42.33a10.84 10.84 0 0 1-1.71.84 12.41 12.41 0 0 0 1.08 1.78 16.44 16.44 0 0 0 5.06-2.59 17.22 17.22 0 0 0-3-11.59 16.09 16.09 0 0 0-4.09-1.35zM8.68 14.81a1.94 1.94 0 0 1-1.8-2 1.93 1.93 0 0 1 1.8-2 1.93 1.93 0 0 1 1.8 2 1.93 1.93 0 0 1-1.8 2zm6.64 0a1.94 1.94 0 0 1-1.8-2 1.93 1.93 0 0 1 1.8-2 1.92 1.92 0 0 1 1.8 2 1.92 1.92 0 0 1-1.8 2z"
        fill="currentColor"
      />
    </svg>
  );
};

export const TwitterIcon: React.FC<IconSvgProps> = ({
  size = 24,
  width,
  height,
  ...props
}) => {
  return (
    <svg
      height={size || height}
      viewBox="0 0 24 24"
      width={size || width}
      {...props}
    >
      <path
        d="M19.633 7.997c.013.175.013.349.013.523 0 5.325-4.053 11.461-11.46 11.461-2.282 0-4.402-.661-6.186-1.809.324.037.636.05.973.05a8.07 8.07 0 0 0 5.001-1.721 4.036 4.036 0 0 1-3.767-2.793c.249.037.499.062.761.062.361 0 .724-.05 1.061-.137a4.027 4.027 0 0 1-3.23-3.953v-.05c.537.299 1.16.486 1.82.511a4.022 4.022 0 0 1-1.796-3.354c0-.748.199-1.434.548-2.032a11.457 11.457 0 0 0 8.306 4.215c-.062-.3-.1-.611-.1-.923a4.026 4.026 0 0 1 4.028-4.028c1.16 0 2.207.486 2.943 1.272a7.957 7.957 0 0 0 2.556-.973 4.02 4.02 0 0 1-1.771 2.22 8.073 8.073 0 0 0 2.319-.624 8.645 8.645 0 0 1-2.019 2.083z"
        fill="currentColor"
      />
    </svg>
  );
};

export const GithubIcon: React.FC<IconSvgProps> = ({
  size = 24,
  width,
  height,
  ...props
}) => {
  return (
    <svg
      height={size || height}
      viewBox="0 0 24 24"
      width={size || width}
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M12.026 2c-5.509 0-9.974 4.465-9.974 9.974 0 4.406 2.857 8.145 6.821 9.465.499.09.679-.217.679-.481 0-.237-.008-.865-.011-1.696-2.775.602-3.361-1.338-3.361-1.338-.452-1.152-1.107-1.459-1.107-1.459-.905-.619.069-.605.069-.605 1.002.07 1.527 1.028 1.527 1.028.89 1.524 2.336 1.084 2.902.829.091-.645.351-1.085.635-1.334-2.214-.251-4.542-1.107-4.542-4.93 0-1.087.389-1.979 1.024-2.675-.101-.253-.446-1.268.099-2.64 0 0 .837-.269 2.742 1.021a9.582 9.582 0 0 1 2.496-.336 9.554 9.554 0 0 1 2.496.336c1.906-1.291 2.742-1.021 2.742-1.021.545 1.372.203 2.387.099 2.64.64.696 1.024 1.587 1.024 2.675 0 3.833-2.33 4.675-4.552 4.922.355.308.675.916.675 1.846 0 1.334-.012 2.41-.012 2.737 0 .267.178.577.687.479C19.146 20.115 22 16.379 22 11.974 22 6.465 17.535 2 12.026 2z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
};

export const MoonFilledIcon = ({
  size = 24,
  width,
  height,
  ...props
}: IconSvgProps) => (
  <svg
    aria-hidden="true"
    focusable="false"
    height={size || height}
    role="presentation"
    viewBox="0 0 24 24"
    width={size || width}
    {...props}
  >
    <path
      d="M21.53 15.93c-.16-.27-.61-.69-1.73-.49a8.46 8.46 0 01-1.88.13 8.409 8.409 0 01-5.91-2.82 8.068 8.068 0 01-1.44-8.66c.44-1.01.13-1.54-.09-1.76s-.77-.55-1.83-.11a10.318 10.318 0 00-6.32 10.21 10.475 10.475 0 007.04 8.99 10 10 0 002.89.55c.16.01.32.02.48.02a10.5 10.5 0 008.47-4.27c.67-.93.49-1.519.32-1.79z"
      fill="currentColor"
    />
  </svg>
);

export const SunFilledIcon = ({
  size = 24,
  width,
  height,
  ...props
}: IconSvgProps) => (
  <svg
    aria-hidden="true"
    focusable="false"
    height={size || height}
    role="presentation"
    viewBox="0 0 24 24"
    width={size || width}
    {...props}
  >
    <g fill="currentColor">
      <path d="M19 12a7 7 0 11-7-7 7 7 0 017 7z" />
      <path d="M12 22.96a.969.969 0 01-1-.96v-.08a1 1 0 012 0 1.038 1.038 0 01-1 1.04zm7.14-2.82a1.024 1.024 0 01-.71-.29l-.13-.13a1 1 0 011.41-1.41l.13.13a1 1 0 010 1.41.984.984 0 01-.7.29zm-14.28 0a1.024 1.024 0 01-.71-.29 1 1 0 010-1.41l.13-.13a1 1 0 011.41 1.41l-.13.13a1 1 0 01-.7.29zM22 13h-.08a1 1 0 010-2 1.038 1.038 0 011.04 1 .969.969 0 01-.96 1zM2.08 13H2a1 1 0 010-2 1.038 1.038 0 011.04 1 .969.969 0 01-.96 1zm16.93-7.01a1.024 1.024 0 01-.71-.29 1 1 0 010-1.41l.13-.13a1 1 0 011.41 1.41l-.13.13a.984.984 0 01-.7.29zm-14.02 0a1.024 1.024 0 01-.71-.29l-.13-.14a1 1 0 011.41-1.41l.13.13a1 1 0 010 1.41.97.97 0 01-.7.3zM12 3.04a.969.969 0 01-1-.96V2a1 1 0 012 0 1.038 1.038 0 01-1 1.04z" />
    </g>
  </svg>
);

export const HeartFilledIcon = ({
  size = 24,
  width,
  height,
  ...props
}: IconSvgProps) => (
  <svg
    aria-hidden="true"
    focusable="false"
    height={size || height}
    role="presentation"
    viewBox="0 0 24 24"
    width={size || width}
    {...props}
  >
    <path
      d="M12.62 20.81c-.34.12-.9.12-1.24 0C8.48 19.82 2 15.69 2 8.69 2 5.6 4.49 3.1 7.56 3.1c1.82 0 3.43.88 4.44 2.24a5.53 5.53 0 0 1 4.44-2.24C19.51 3.1 22 5.6 22 8.69c0 7-6.48 11.13-9.38 12.12Z"
      fill="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
    />
  </svg>
);

export const SearchIcon = (props: IconSvgProps) => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height="1em"
    role="presentation"
    viewBox="0 0 24 24"
    width="1em"
    {...props}
  >
    <path
      d="M11.5 21C16.7467 21 21 16.7467 21 11.5C21 6.25329 16.7467 2 11.5 2C6.25329 2 2 6.25329 2 11.5C2 16.7467 6.25329 21 11.5 21Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path
      d="M22 22L20 20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);
