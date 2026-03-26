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

import { useCallback, useState } from "react";

export interface UseClipboardProps {
  /**
   * The time in milliseconds to wait before resetting the clipboard.
   * @default 2000
   */
  timeout?: number;
}

const transformValue = (text: string) => {
  // Manually replace all &nbsp; to avoid get different unicode characters;
  return text.replace(/[\u00A0]/g, " ");
};

/**
 * Copies the given text to the clipboard.
 * @param {number} timeout - timeout in ms, default 2000
 * @returns {copy, copied, error, reset} - copy function, copied state, error state, reset function
 */
export function useClipboard({ timeout = 2000 }: UseClipboardProps = {}) {
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyTimeout, setCopyTimeout] = useState<
    ReturnType<typeof setTimeout> | null
  >(null);

  const onClearTimeout = useCallback(() => {
    if (copyTimeout) {
      clearTimeout(copyTimeout);
    }
  }, [copyTimeout]);

  const handleCopyResult = useCallback(
    (value: boolean) => {
      onClearTimeout();
      setCopyTimeout(setTimeout(() => setCopied(false), timeout));
      setCopied(value);
    },
    [onClearTimeout, timeout],
  );

  const copy = useCallback(
    (valueToCopy: any) => {
      if ("clipboard" in navigator) {
        const transformedValue =
          typeof valueToCopy === "string"
            ? transformValue(valueToCopy)
            : valueToCopy;

        navigator.clipboard
          .writeText(transformedValue)
          .then(() => handleCopyResult(true))
          .catch((err) => setError(err));
      } else {
        setError(
          new Error("useClipboard: navigator.clipboard is not supported"),
        );
      }
    },
    [handleCopyResult],
  );

  const reset = useCallback(() => {
    setCopied(false);
    setError(null);
    onClearTimeout();
  }, [onClearTimeout]);

  return { copy, reset, error, copied };
}

export type UseClipboardReturn = ReturnType<typeof useClipboard>;
