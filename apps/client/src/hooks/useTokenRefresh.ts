/**
 * @copyright Copyright (c) 2024-2026 Ronan LE MEILLAT
 * @license AGPL-3.0-or-later
 */

import { useCallback } from "react";
import { useAuth } from "@/authentication/providers/use-auth";

export const TOKEN_REFRESHED_EVENT = "fufuni:token-refreshed";

interface UseTokenRefreshOptions {
  onTokenRefreshed?: (newToken: string) => Promise<void>;
}

/**
 * Hook to refresh the access token and optionally trigger a callback
 * Handles token refresh via the authentication provider
 * Dispatches a global event so other components can sync the token
 */
export const useTokenRefresh = (options?: UseTokenRefreshOptions) => {
  const auth = useAuth();

  const refreshToken = useCallback(async () => {
    try {
      const newToken = await auth.refreshAccessToken();
      
      if (newToken) {
        if (options?.onTokenRefreshed) {
          await options.onTokenRefreshed(newToken);
        }
        window.dispatchEvent(
          new CustomEvent(TOKEN_REFRESHED_EVENT, { detail: newToken })
        );
      }
      
      return newToken;
    } catch (error) {
      console.error("[useTokenRefresh] Error refreshing token:", error);
      throw error;
    }
  }, [auth, options]);

  return { refreshToken };
};
