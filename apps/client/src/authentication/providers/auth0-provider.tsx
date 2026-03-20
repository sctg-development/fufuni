/**
 * @copyright Copyright (c) 2024-2026 Ronan LE MEILLAT
 * @license AGPL-3.0-or-later
 */

import {
  useAuth0,
  withAuthenticationRequired,
  LogoutOptions as Auth0LogoutOptions,
  RedirectLoginOptions,
} from "@auth0/auth0-react";
import React, { JSX, useCallback, useMemo, useRef } from "react";
import { JWTPayload, decodeJwt, jwtVerify } from "jose";

import {
  AuthProvider,
  AuthUser,
  TokenOptions,
  LogoutOptions,
  LoginOptions,
  AuthGuardProps,
} from "./auth-provider";

import { getLocalJwkSet } from "@/authentication/utils/jwks";

/**
 * Auth0 implementation of the AuthProvider interface
 */
export const useAuth0Provider = (): AuthProvider => {
  const {
    isAuthenticated,
    isLoading,
    user,
    getAccessTokenSilently,
    loginWithRedirect,
    logout: auth0Logout,
  } = useAuth0();

  const parseJwtPayload = (token: string): JWTPayload | null => {
    try {
      return decodeJwt(token) as JWTPayload;
    } catch {
      return null;
    }
  };

  const resolveAccessTokenString = (tokenOrVerbose: unknown): string | null => {
    if (!tokenOrVerbose) return null;

    if (typeof tokenOrVerbose === "string") {
      return tokenOrVerbose;
    }

    if (
      typeof tokenOrVerbose === "object" &&
      tokenOrVerbose !== null &&
      "access_token" in tokenOrVerbose
    ) {
      return (tokenOrVerbose as any).access_token;
    }

    return null;
  };

  const getAccessTokenWithAutoRefresh = async (
    options?: TokenOptions,
  ): Promise<string | null> => {
    const baseOptions = {
      authorizationParams: {
        audience: options?.audience || import.meta.env.AUTH0_AUDIENCE,
        scope: options?.scope || import.meta.env.AUTH0_SCOPE,
      },
      ...options,
    };

    const accessTokenRaw = await getAccessTokenSilently(baseOptions as any);
    const accessToken = resolveAccessTokenString(accessTokenRaw);

    if (!accessToken) return null;

    const payload = parseJwtPayload(accessToken);

    if (!payload?.exp) {
      return accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = payload.exp - now;

    // If the token is about to expire, force a refresh.
    // This avoids using a token that will expire mid-request.
    if (secondsLeft < 60) {
      const refreshOptions = { ...baseOptions, ignoreCache: true } as any;
      const refreshedTokenRaw = await getAccessTokenSilently(refreshOptions);

      return resolveAccessTokenString(refreshedTokenRaw);
    }

    return accessToken;
  };

  const getAccessToken = async (
    options?: TokenOptions,
  ): Promise<string | null> => {
    try {
      return await getAccessTokenWithAutoRefresh(options);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error getting access token:", error);

      return null;
    }
  };

  const login = async (options?: LoginOptions): Promise<void> => {
    return loginWithRedirect(options as RedirectLoginOptions);
  };

  const logout = async (options?: LogoutOptions): Promise<void> => {
    const auth0Options: Auth0LogoutOptions = {
      ...options,
      logoutParams: {
        returnTo:
          options?.logoutParams?.returnTo ||
          new URL(
            import.meta.env.BASE_URL || "/",
            window.location.origin,
          ).toString(),
        ...options?.logoutParams,
      },
    };

    auth0Logout(auth0Options);

    return Promise.resolve();
  };

  // In-memory cache for permission checks keyed by `${permission}:${accessToken}`
  const permissionCheckCache = useMemo(() => new Map<string, boolean>(), []);

  const hasPermission = useCallback(
    async (permission: string): Promise<boolean> => {
      try {
        const accessToken = await getAccessToken();

        if (!accessToken) {
          return false;
        }

        const cacheKey = `${permission}:${accessToken}`;

        if (permissionCheckCache.has(cacheKey)) {
          return permissionCheckCache.get(cacheKey) as boolean;
        }

        const localSet = await getLocalJwkSet(import.meta.env.AUTH0_DOMAIN);

        const joseResult = await jwtVerify(accessToken, localSet, {
          issuer: `https://${import.meta.env.AUTH0_DOMAIN}/`,
          audience: import.meta.env.AUTH0_AUDIENCE,
        });

        const payload = joseResult.payload as JWTPayload;
        const result =
          Array.isArray(payload.permissions) &&
          payload.permissions.includes(permission);

        permissionCheckCache.set(cacheKey, result);

        return result;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error checking permission:", error);

        return false;
      }
    },
    [getAccessToken, permissionCheckCache],
  );

  // Simple in-memory request cache to dedupe identical requests while active
  const requestCacheRef = useRef<Map<string, Promise<any>>>(new Map());

  const getJson = useCallback(
    async (url: string): Promise<any> => {
      try {
        const accessToken = await getAccessTokenWithAutoRefresh();

        if (!accessToken) {
          throw new Error("Unable to retrieve access token");
        }

        const cacheKey = `${accessToken}:${url}`;

        if (requestCacheRef.current.has(cacheKey)) {
          return await requestCacheRef.current.get(cacheKey)!;
        }

        const promise = (async () => {
          const fetchWithRetry = async (token: string): Promise<Response> => {
            const apiResponse = await fetch(url, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (apiResponse.status !== 401) {
              return apiResponse;
            }

            // Try to refresh the token once on 401
            const refreshedToken =
              (await getAccessTokenWithAutoRefresh({
                ignoreCache: true,
              } as any)) || token;

            return fetch(url, {
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
              },
            });
          };

          const apiResponse = await fetchWithRetry(accessToken);

          // If we still get 401, clear the cache so retries can re-run.
          if (apiResponse.status === 401) {
            requestCacheRef.current.delete(cacheKey);
          }

          return await apiResponse.json();
        })();

        // store the in-flight promise to dedupe concurrent calls
        requestCacheRef.current.set(cacheKey, promise);

        try {
          return await promise;
        } finally {
          // remove promise from cache so future requests fetch fresh data
          requestCacheRef.current.delete(cacheKey);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error fetching JSON:", error);
        throw error;
      }
    },
    [getAccessTokenWithAutoRefresh],
  );

  const postJson = useCallback(
    async (url: string, data: any): Promise<any> => {
      try {
        const accessToken = await getAccessTokenWithAutoRefresh();

        if (!accessToken) {
          throw new Error("Unable to retrieve access token");
        }

        const makeRequest = async (token: string): Promise<Response> => {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });

          if (response.status !== 401) {
            return response;
          }

          const refreshedToken =
            (await getAccessTokenWithAutoRefresh({
              ignoreCache: true,
            } as any)) || token;

          return fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });
        };

        const apiResponse = await makeRequest(accessToken);

        return await apiResponse.json();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error posting JSON:", error);
        throw error;
      }
    },
    [getAccessTokenWithAutoRefresh],
  );

  const deleteJson = useCallback(
    async (url: string): Promise<any> => {
      try {
        const accessToken = await getAccessTokenWithAutoRefresh();

        if (!accessToken) {
          throw new Error("Unable to retrieve access token");
        }

        const makeRequest = async (token: string): Promise<Response> => {
          const response = await fetch(url, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (response.status !== 401) {
            return response;
          }

          const refreshedToken =
            (await getAccessTokenWithAutoRefresh({
              ignoreCache: true,
            } as any)) || token;

          return fetch(url, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
              "Content-Type": "application/json",
            },
          });
        };

        const apiResponse = await makeRequest(accessToken);

        return await apiResponse.json();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error deleting JSON:", error);
        throw error;
      }
    },
    [getAccessTokenWithAutoRefresh],
  );

  const putJson = useCallback(
    async (url: string, data: any): Promise<any> => {
      try {
        const accessToken = await getAccessTokenWithAutoRefresh();

        if (!accessToken) {
          throw new Error("Unable to retrieve access token");
        }

        const makeRequest = async (token: string): Promise<Response> => {
          const response = await fetch(url, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });

          if (response.status !== 401) {
            return response;
          }

          const refreshedToken =
            (await getAccessTokenWithAutoRefresh({
              ignoreCache: true,
            } as any)) || token;

          return fetch(url, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });
        };

        const apiResponse = await makeRequest(accessToken);

        return await apiResponse.json();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error putting JSON:", error);
        throw error;
      }
    },
    [getAccessTokenWithAutoRefresh],
  );

  const patchJson = useCallback(
    async (url: string, data: any): Promise<any> => {
      try {
        const accessToken = await getAccessTokenWithAutoRefresh();

        if (!accessToken) {
          throw new Error("Unable to retrieve access token");
        }

        const makeRequest = async (token: string): Promise<Response> => {
          const response = await fetch(url, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });

          if (response.status !== 401) {
            return response;
          }

          const refreshedToken =
            (await getAccessTokenWithAutoRefresh({
              ignoreCache: true,
            } as any)) || token;

          return fetch(url, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });
        };

        const apiResponse = await makeRequest(accessToken);

        return await apiResponse.json();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error patching JSON:", error);
        throw error;
      }
    },
    [getAccessTokenWithAutoRefresh],
  );

  // Memoize the returned API surface so consumers receive stable function identities
  return useMemo(
    () => ({
      isAuthenticated,
      isLoading,
      user: user as AuthUser,
      login,
      logout,
      getAccessToken,
      hasPermission,
      getJson,
      postJson,
      patchJson,
      putJson,
      deleteJson,
    }),
    [
      isAuthenticated,
      isLoading,
      user,
      login,
      logout,
      getAccessToken,
      hasPermission,
      getJson,
      postJson,
      putJson,
      deleteJson,
    ],
  );
};

/**
 * HOC that protects routes requiring authentication with Auth0
 * @param component - The component to protect
 * @param options - Authentication options
 */
export const withAuth0Authentication = (
  component: React.FC,
  options?: { onRedirecting?: () => JSX.Element },
) => {
  return withAuthenticationRequired(component, options);
};

/**
 * Authentication Guard component specific to Auth0
 */
export const Auth0AuthenticationGuard: React.FC<AuthGuardProps> = ({
  component,
  onRedirecting,
}) => {
  const Component = withAuth0Authentication(component, {
    onRedirecting,
  });

  return <Component />;
};
