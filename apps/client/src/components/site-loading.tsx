/**
 * @copyright Copyright (c) 2024-2026 Ronan LE MEILLAT
 * @license AGPL-3.0-or-later
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
import { useEffect } from "react";
import { createPortal } from "react-dom";

let styleInjected = false;

export const SiteLoading = () => {
  useEffect(() => {
    if (styleInjected) return;

    const styleElement = document.createElement("style");

    styleElement.innerHTML = `
      @keyframes spinner-rotate {
        to {
          transform: rotate(360deg);
        }
      }
    `;
    document.head.appendChild(styleElement);
    styleInjected = true;

    // nothing to cleanup: we keep the style for the whole app
  }, []);

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center dark:bg-black">
      <div
        aria-label="Loading"
        aria-live="polite"
        className="
          block
          w-48 h-48
          rounded-full
          bg-[conic-gradient(red,orange,yellow,green,blue,indigo,violet,red)]
          mask-[radial-gradient(circle_closest-side,transparent_75%,#000_75%,#000_100%)]
          animate-[spinner-rotate_800ms_linear_infinite]
        "
        role="status"
      />
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
};
