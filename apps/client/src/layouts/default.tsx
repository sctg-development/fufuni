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

import type React from "react";

import { Link } from "@heroui/react";
import { Trans, useTranslation } from "react-i18next";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { JWTPayload, jwtVerify } from "jose";

import { getLocalJwkSet } from "@/authentication/utils/jwks";
import { Navbar } from "@/components/navbar";
import { UserTechnicalInfoModal } from "@/modals/user-technical-info";
import { LoginLogoutLink } from "@/authentication";

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth0();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [decodedToken, setDecodedToken] = useState<JWTPayload | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const decodedTokenCacheRef = useRef<Map<string, JWTPayload>>(new Map());
  const accessTokenRef = useRef<string | null>(null);

  const decodeAndStoreToken = useCallback(
    async (token: string) => {
      try {
        if (decodedTokenCacheRef.current.has(token)) {
          console.log("[Token] Using cached decoded token");
          setDecodedToken(decodedTokenCacheRef.current.get(token) || null);
          return;
        }

        console.log("[Token] Decoding new token, starting with 'ey...':", token.substring(0, 20));
        const JWKS = await getLocalJwkSet(import.meta.env.AUTH0_DOMAIN);

        const verified = await jwtVerify(token, JWKS, {
          issuer: `https://${import.meta.env.AUTH0_DOMAIN}/`,
          audience: import.meta.env.AUTH0_AUDIENCE,
        });

        const payload = verified.payload as JWTPayload;

        decodedTokenCacheRef.current.set(token, payload);
        setDecodedToken(payload);
        console.log("[Token] Token decoded and stored successfully, exp:", new Date(payload.exp! * 1000).toISOString());
      } catch (err) {
        console.error("[Token] Failed to decode access token:", err);
      }
    },
    [],
  );

  const loadToken = useCallback(
    async (ignoreCache = false) => {
      try {
        console.log("[Token] Loading token with ignoreCache =", ignoreCache);
        
        // If forcing a refresh, clear the local cache first
        if (ignoreCache) {
          console.log("[Token] Clearing local token cache");
          decodedTokenCacheRef.current.clear();
        }

        const options = ignoreCache
          ? {
              ignoreCache: true,
              audience: import.meta.env.AUTH0_AUDIENCE,
              scope: import.meta.env.AUTH0_SCOPE,
              // Force a refresh if token has less than 0 seconds TTL (always refresh)
              minTtl: 0,
            }
          : undefined;

        console.log("[Token] Calling getAccessTokenSilently with options:", options);
        const response = await getAccessTokenSilently(options as any);

        // Extract token string from response (handles both string and verbose response)
        const token =
          typeof response === "string" ? response : response?.access_token;

        if (!token) {
          throw new Error("Failed to get access token");
        }

        console.log("[Token] Got token from Auth0, comparing...");
        if (accessTokenRef.current && accessTokenRef.current === token) {
          console.warn("[Token] WARNING: Got same token! Auth0 returned cached token despite ignoreCache");
        }
        
        accessTokenRef.current = token;
        setAccessToken(token);
        await decodeAndStoreToken(token);
      } catch (err) {
        console.error("[Token] Failed to load access token:", err);
      }
    },
    [getAccessTokenSilently, decodeAndStoreToken],
  );

  const handleRefreshToken = useCallback(async () => {
    console.log("[Token] handleRefreshToken called");
    
    try {
      // Search for refresh token in localStorage (Auth0 SDK cache)
      let refreshToken: string | null = null;
      let cacheKey: string | null = null;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.includes("@@auth0spajs@@") || key?.includes("auth0")) {
          try {
            const item = localStorage.getItem(key!);
            if (item) {
              const data = JSON.parse(item);
              if (data?.body?.refresh_token) {
                refreshToken = data.body.refresh_token;
                cacheKey = key;
                console.log("[Token] Found refresh_token in cache key:", key);
                break;
              }
            }
          } catch (e) {
            // Skip parsing errors
          }
        }
      }

      if (refreshToken) {
        console.log("[Token] Attempting token refresh via Auth0 oauth/token endpoint");
        
        const response = await fetch(`https://${import.meta.env.AUTH0_DOMAIN}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: import.meta.env.AUTH0_CLIENT_ID,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            audience: import.meta.env.AUTH0_AUDIENCE,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("[Token] Token refresh failed:", error);
          throw new Error(error.error_description || "Token refresh failed");
        }

        const data = await response.json();
        console.log("[Token] Successfully got new token from Auth0 token endpoint");
        console.log("[Token] New token exp:", new Date(data.expires_in * 1000 + Date.now()).toISOString());
        
        // Update the refresh token in localStorage if a new one was provided
        if (data.refresh_token && cacheKey) {
          console.log("[Token] Updating cached refresh_token in localStorage");
          try {
            const cacheStr = localStorage.getItem(cacheKey);
            if (cacheStr) {
              const cache = JSON.parse(cacheStr);
              cache.body.refresh_token = data.refresh_token;
              localStorage.setItem(cacheKey, JSON.stringify(cache));
              console.log("[Token] Refresh token updated in cache");
            }
          } catch (e) {
            console.warn("[Token] Failed to update cached refresh_token:", e);
          }
        }
        
        // Update our state and ref
        accessTokenRef.current = data.access_token;
        setAccessToken(data.access_token);
        await decodeAndStoreToken(data.access_token);
        return;
      }
      
      console.warn("[Token] No refresh_token found, falling back to getAccessTokenSilently");
      await loadToken(true);
    } catch (error) {
      console.error("[Token] handleRefreshToken error:", error);
    }
  }, [loadToken, decodeAndStoreToken]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;

    loadToken().then(() => {
      if (!isMounted) return;
    });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, loadToken]);

  return (
    <div className="relative flex flex-col h-screen">
      <Navbar />
      <main className="container mx-auto max-w-7xl px-6 grow pt-16">
        {children}
      </main>
      <footer className="w-full flex items-center justify-center py-3">
        <Link
          isExternal
          className="flex items-center gap-1 text-current"
          href="https://github.com/sctg-development/fufuni"
          title={t("vite-react-heroui-auth0-template")}
        >
          <span className="text-default-600">
            <Trans ns="base">powered-by</Trans>
          </span>
          <p className="text-primary">SCTG React template</p>
        </Link>
        &nbsp;
        <div className="flex items-center gap-2 text-primary">
          {isAuthenticated && (
            <span onClick={() => setIsModalOpen(true)} className="cursor-pointer">
              {t("user")}: &nbsp;{user?.name}
            </span>
          )}
          <span className="text-default-600">
            <LoginLogoutLink color="foreground" size="md" loginI18nKey="manage-store" />
          </span>
        </div>
      </footer>
      {user ? (
        <UserTechnicalInfoModal
          accessToken={accessToken}
          isOpen={isModalOpen}
          tokenPayload={decodedToken}
          user={user}
          onClose={() => setIsModalOpen(false)}
          onTokenRefresh={handleRefreshToken}
        />
      ) : (
        <></>
      )}
    </div>
  );
}
