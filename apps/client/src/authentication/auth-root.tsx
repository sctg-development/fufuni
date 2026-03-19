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

import React from "react";
import { Auth0Provider } from "@auth0/auth0-react";

import { AuthProviderWrapper } from "./providers/use-auth";
import { AutoPermissionProvisioner } from "./auth-components";

// Provider types we support
export type AuthenticationType = "auth0" | "dex";

interface AuthenticationProviderProps {
  children: React.ReactNode;
  providerType: AuthenticationType;
  config?: any;
}

/**
 * Root authentication provider component that sets up the appropriate
 * authentication provider based on the specified type
 */
export const AuthenticationProvider: React.FC<AuthenticationProviderProps> = ({
  children,
  providerType = "auth0",
}) => {
  // Set up Auth0 provider
  if (providerType === "auth0") {
    // Auth0 uses the following environment variables:
    // AUTH0_DOMAIN
    // AUTH0_CLIENT_ID
    // AUTH0_AUDIENCE
    // AUTH0_SCOPE
    const redirectUri = new URL(
      import.meta.env.BASE_URL || "/",
      window.location.origin,
    ).toString();

    return (
      <Auth0Provider
        authorizationParams={{
          redirect_uri: redirectUri,
          audience: import.meta.env.AUTH0_AUDIENCE,
          scope: import.meta.env.AUTH0_SCOPE,
        }}
        cacheLocation="localstorage"
        clientId={import.meta.env.AUTH0_CLIENT_ID}
        domain={import.meta.env.AUTH0_DOMAIN}
        useCookiesForTransactions={true}
        useRefreshTokens={true}
      >
        <AuthProviderWrapper providerType={providerType}>
          <AutoPermissionProvisioner>{children}</AutoPermissionProvisioner>
        </AuthProviderWrapper>
      </Auth0Provider>
    );
  }

  // For Dex and other providers, we'd need to set up their specific provider
  if (providerType === "dex") {
    // Dex doesn't need an external provider wrapper like Auth0 does
    // Dex use the fowlowing environment variables:
    // DEX_AUTHORITY
    // DEX_CLIENT_ID
    // DEX_REDIRECT_URI
    // DEX_SCOPE
    // DEX_AUDIENCE
    // DEX_TOKEN_ISSUER
    // DEX_JWKS_ENDPOINT
    // DEX_DOMAIN
    return (
      <AuthProviderWrapper providerType={providerType}>
        {children}
      </AuthProviderWrapper>
    );
  }

  // Default fallback - should not happen if proper validation is in place
  return (
    <div>
      <h1>Invalid authentication provider type: {providerType}</h1>
      <p>Please check your configuration.</p>
    </div>
  );
};
