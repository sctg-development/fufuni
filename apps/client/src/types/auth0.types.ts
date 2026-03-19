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

export interface Auth0User {
  user_id: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  nickname: string;
  created_at: string;
  updated_at: string;
  last_login: string;
  logins_count: number;
}

export interface Auth0Role {
  id: string;
  name: string;
  description: string;
}

export interface Auth0Permission {
  permission_name: string;
  description: string;
  resource_server_identifier: string;
  resource_server_name: string;
}

/**
 * Response on success returned by the worker route /api/__auth0/token
 */
export interface Auth0ManagementTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  /** true si le token provient du cache KV (pas d'appel Auth0 fait) */
  from_cache?: boolean;
}

/** Error returned by the worker route /api/__auth0/token */
export interface Auth0ManagementTokenError {
  success: false;
  error: string;
}

/** Union type for /api/__auth0/token */
export type Auth0ManagementTokenApiResponse =
  | Auth0ManagementTokenResponse
  | Auth0ManagementTokenError;
