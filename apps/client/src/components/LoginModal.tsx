/**
 * Copyright (c) 2026 Ronan LE MEILLAT
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

import { useAuth0 } from '@auth0/auth0-react';
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Divider,
  Input,
} from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Trusted hardcoded SVG icons for social auth providers */
const PROVIDER_ICONS: Record<string, string> = {
  'google-oauth2': `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 48 48'><defs><path id='a' d='M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z'/></defs><clipPath id='b'><use xlink:href='#a' overflow='visible'/></clipPath><path clip-path='url(#b)' fill='#FBBC05' d='M0 37V11l17 13z'/><path clip-path='url(#b)' fill='#EA4335' d='M0 11l17 13 7-6.1L48 14V0H0z'/><path clip-path='url(#b)' fill='#34A853' d='M0 37l30-23 7.9 1L48 0v48H0z'/><path clip-path='url(#b)' fill='#4285F4' d='M48 48L17 24l-4-3 35-10z'/></svg>`,
  'apple': `<svg width='170' xmlns='http://www.w3.org/2000/svg' height='170'><path d='M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925s12.793-5.51 19.948-5.629c3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.238 3.599 1.339 0 5.877-1.416 13.57-4.239 7.275-2.618 13.415-3.702 18.445-3.275 13.63 1.1 23.87 6.473 30.68 16.153-12.19 7.386-18.22 17.731-18.1 31.002.11 10.337 3.86 18.939 11.23 25.769 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.102-2.96 15.667-8.86 22.669-7.12 8.324-15.732 13.134-25.071 12.375a25.222 25.222 0 0 1-.188-3.07c0-7.778 3.386-16.102 9.399-22.908 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.083.17 2.166.17 3.24z'/></svg>`,
  'github': `<svg width='20' height='20' xmlns='http://www.w3.org/2000/svg'><path d='M10 0C4.477 0 0 4.36 0 9.74c0 4.304 2.865 7.955 6.839 9.243.5.09.682-.211.682-.47 0-.23-.008-.843-.013-1.656-2.782.588-3.369-1.306-3.369-1.306-.454-1.125-1.11-1.425-1.11-1.425-.908-.604.069-.592.069-.592 1.003.069 1.531 1.004 1.531 1.004.892 1.488 2.341 1.059 2.91.81.092-.63.35-1.06.636-1.303-2.22-.245-4.555-1.081-4.555-4.814 0-1.063.39-1.933 1.029-2.613-.103-.247-.446-1.238.098-2.578 0 0 .84-.262 2.75.998A9.818 9.818 0 0 1 10 4.71c.85.004 1.705.112 2.504.328 1.909-1.26 2.747-.998 2.747-.998.546 1.34.203 2.331.1 2.578.64.68 1.028 1.55 1.028 2.613 0 3.742-2.339 4.566-4.566 4.807.359.3.678.895.678 1.804 0 1.301-.012 2.352-.012 2.671 0 .261.18.564.688.47C17.137 17.69 20 14.042 20 9.74 20 4.36 15.522 0 10 0z' fill='currentColor' fill-rule='evenodd'/></svg>`,
  'microsoftlive': `<svg xmlns='http://www.w3.org/2000/svg' width='21' height='21'><path fill='#f25022' d='M1 1h9v9H1z'/><path fill='#00a4ef' d='M1 11h9v9H1z'/><path fill='#7fba00' d='M11 1h9v9h-9z'/><path fill='#ffb900' d='M11 11h9v9h-9z'/></svg>`,
};

const SOCIAL_PROVIDERS = [
  { id: 'google-oauth2', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'github', label: 'GitHub' },
  { id: 'microsoftlive', label: 'Microsoft Account' },
];

/**
 * Renders a trusted hardcoded SVG string as an inline icon.
 * Only used with internal, compile-time-constant SVG strings — not user input.
 */
function SvgIcon({ svg }: { svg: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 shrink-0 [&>svg]:w-full [&>svg]:h-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * LoginModal provides a centered Auth0 login experience matching the Fufuni design:
 * - Email passwordless login (magic link) as primary flow
 * - Social login providers (Google, Apple, GitHub, Microsoft) below a divider
 *
 * Usage:
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * <LoginModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
 * ```
 */
export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { loginWithRedirect } = useAuth0();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePasswordlessLogin = async () => {
    if (!email) return;
    try {
      setIsLoading(true);
      await loginWithRedirect({
        authorizationParams: {
          connection: 'email',
          login_hint: email,
          redirect_uri: window.location.origin,
        },
      });
    } catch (error) {
      console.error('Error with passwordless login:', error);
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: string) => {
    try {
      setIsLoading(true);
      await loginWithRedirect({
        authorizationParams: {
          connection: provider,
          redirect_uri: window.location.origin,
        },
      });
    } catch (error) {
      console.error(`Error logging in with ${provider}:`, error);
      setIsLoading(false);
    }
  };

  const handleSignUp = () => {
    loginWithRedirect({
      authorizationParams: {
        screen_hint: 'signup',
        redirect_uri: window.location.origin,
      } as NonNullable<Parameters<typeof loginWithRedirect>[0]>['authorizationParams'] & { screen_hint: string },
    }).catch(console.error);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      backdrop="blur"
      placement="center"
      classNames={{
        base: 'bg-white dark:bg-zinc-900',
        closeButton: 'top-3 right-3 z-10',
      }}
    >
      <ModalContent>
        <ModalBody className="flex flex-col items-center gap-4 px-6 pt-8 pb-7">

          {/* Fufuni logo + name */}
          <div className="flex flex-col items-center gap-1.5 mb-1">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white shadow-sm">
              <img
                src="/img/fufuni_logo_02.svg"
                alt="Fufuni"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs text-default-400 font-medium tracking-wide">
              {import.meta.env.STORE_NAME || 'fufuni'}
            </span>
          </div>

          {/* Title & subtitle */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <h2 className="text-2xl font-bold text-foreground">
              {t('login-modal-title', { defaultValue: 'Bienvenue' })}
            </h2>
            <p className="text-sm text-default-500 leading-snug max-w-67.5">
              {t('login-modal-subtitle', {
                storeName: import.meta.env.STORE_NAME || 'Fufuni',
                defaultValue: 'Connectez-vous à {{storeName}} pour continuer vers {{storeName}} e-platform.',
              })}
            </p>
          </div>

          {/* Email input */}
          <Input
            type="email"
            label={`${t('email', { defaultValue: 'Adresse e-mail' })} *`}
            placeholder=" "
            value={email}
            onValueChange={setEmail}
            onKeyDown={(e) => e.key === 'Enter' && handlePasswordlessLogin()}
            variant="bordered"
            className="w-full"
            isDisabled={isLoading}
          />

          {/* Primary CTA */}
          <Button
            color="primary"
            className="w-full"
            isLoading={isLoading}
            onPress={handlePasswordlessLogin}
            isDisabled={!email}
          >
            {t('login-continue', { defaultValue: 'Continuer' })}
          </Button>

          {/* Sign-up link */}
          <p className="text-sm text-default-500">
            {t('login-new-customer', { defaultValue: "Vous n'avez pas de compte ?" })}{' '}
            <button
              type="button"
              className="text-primary font-semibold hover:underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleSignUp}
              disabled={isLoading}
            >
              {t('login-signup', { defaultValue: 'Inscription' })}
            </button>
          </p>

          {/* Divider with "ou" */}
          <div className="flex w-full items-center gap-3">
            <Divider className="flex-1" />
            <span className="text-xs text-default-400 shrink-0">
              {t('or', { defaultValue: 'ou' })}
            </span>
            <Divider className="flex-1" />
          </div>

          {/* Social provider buttons */}
          <div className="flex flex-col gap-2 w-full">
            {SOCIAL_PROVIDERS.map(({ id, label }) => (
              <Button
                key={id}
                variant="bordered"
                className="w-full justify-start gap-3"
                isLoading={isLoading}
                onPress={() => handleSocialLogin(id)}
                startContent={<SvgIcon svg={PROVIDER_ICONS[id]} />}
              >
                {t('login-with', {
                  provider: label,
                  defaultValue: `Continuer avec ${label}`,
                })}
              </Button>
            ))}
          </div>

        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
