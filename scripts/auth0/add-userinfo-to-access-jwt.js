/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

exports.onExecutePostLogin = async (event, api) => {

  if (!event.user.email_verified) {
      return api.access.deny('Please verify your email before logging in.');
  }

  const namespace = `extra_user_info`;
    // Standard OIDC claims (cf. /userinfo spec)
  const {
    sub, name, given_name, family_name, middle_name, nickname,
    preferred_username, profile, picture, website,
    email, email_verified, gender, birthdate,
    zoneinfo, locale, phone_number, phone_number_verified,
    address, updated_at, app_metadata, user_metadata
  } = event.user;

  const userinfo = Object.fromEntries(
    Object.entries({
      sub, name, given_name, family_name, middle_name, nickname,
      preferred_username, profile, picture, website,
      email, email_verified, gender, birthdate,
      zoneinfo, locale, phone_number, phone_number_verified,
      address, updated_at, app_metadata, user_metadata
    }).filter(([_, v]) => v !== undefined && v !== null)
  );

  if (event.authorization) {
    // Set claims 
    api.accessToken.setCustomClaim(`${namespace}/ip`, event.request.ip);
    api.accessToken.setCustomClaim(`${namespace}/hostname`, event.request.hostname);
    api.accessToken.setCustomClaim(`${namespace}/geoip`, event.request.geoip);
    api.accessToken.setCustomClaim(`${namespace}/user_agent`, event.request.user_agent);
    api.accessToken.setCustomClaim(`${namespace}/user_metadata`,event.user.user_metadata);
    api.accessToken.setCustomClaim(`${namespace}/app_metadata`,event.user.app_metadata);
    api.accessToken.setCustomClaim(`${namespace}/email_verified`,event.user.email_verified);
  }
  
  api.accessToken.setCustomClaim(namespace, userinfo);
};