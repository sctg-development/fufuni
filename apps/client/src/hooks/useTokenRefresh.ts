/**
 * @copyright Copyright (c) 2024-2026 Ronan LE MEILLAT
 * @license AGPL-3.0-or-later
 */

import { useCallback } from "react";
import { useAuth } from "@/authentication/providers/use-auth";

interface UseTokenRefreshOptions {
  onTokenRefreshed?: (newToken: string) => Promise<void>;
}

/**
 * Hook to refresh the access token and optionally trigger a callback
 * Handles token refresh via the authentication provider
 */
export const useTokenRefresh = (options?: UseTokenRefreshOptions) => {
  const auth = useAuth();

  const refreshToken = useCallback(async () => {
    try {
      const newToken = await auth.refreshAccessToken();
      
      if (newToken && options?.onTokenRefreshed) {
        await options.onTokenRefreshed(newToken);
      }
      
      return newToken;
    } catch (error) {
      console.error("[useTokenRefresh] Error refreshing token:", error);
      throw error;
    }
  }, [auth, options]);

  return { refreshToken };
};
