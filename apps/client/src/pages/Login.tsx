/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../authentication/providers/use-auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TextField, Label, Input, Card, Button } from '@heroui/react';
import { X } from 'lucide-react';

/**
 * Customer login page using Auth0 Passwordless (email magic link).
 * No password required — Auth0 sends a one-click link to the customer's inbox.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const auth = useAuth() as any;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already authenticated
  const isAuth = (auth as any)?.isAuthenticated;
  useEffect(() => {
    if (isAuth) {
      const returnTo = searchParams.get('returnTo') || '/account';
      navigate(returnTo);
    }
  }, [isAuth, navigate, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError(t('login-email-required'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call Auth0 loginWithRedirect with passwordless Email connection
      // The loginWithRedirect method handles the redirect flow automatically
      await auth.login({
        authorizationParams: {
          connection: 'email', // Use the Auth0 Email passwordless connection
          login_hint: email,   // Pre-fill the email field
          scope: 'openid profile email',
        },
      });
      
      setSent(true);
    } catch (err) {
      console.error('Login error:', err);
      setError(
        t('login-error')
      );
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <Card.Header className="flex gap-3 justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold">{t('login-check-email')}</h1>
            </div>
          </Card.Header>
          <Card.Content className="gap-4">
            <div className="text-center space-y-4">
              <p className="text-gray-600">
                {t('login-sent-link')}
              </p>
              <p className="font-semibold text-lg">{email}</p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  {t('login-instructions')}
                </p>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-gray-500 mb-4">
                  {t('login-didnt-receive')}
                </p>
                <Button
                  variant="tertiary"
                  onClick={() => {
                    setSent(false);
                    setEmail('');
                  }}
                  className="w-full"
                >
                  {t('login-try-another-email')}
                </Button>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <Card.Header className="flex gap-3 flex-col justify-center">
          <div className="text-center">
            <h1 className="text-3xl font-bold">{t('login-title')}</h1>
            <p className="text-gray-500 mt-2">
              {t('login-subtitle')}
            </p>
          </div>
        </Card.Header>

        <Card.Content className="gap-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <TextField 
              name="email" 
              type="email"
              isRequired
              isInvalid={!!error}
              className="w-full"
            >
              <Label>{t('login-email')}</Label>
              <div className="flex items-center">
                <Input 
                  placeholder={t('login-enter-email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  fullWidth
                />
                {email && (
                  <button
                    type="button"
                    onClick={() => setEmail('')}
                    className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                    aria-label="Clear email"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </TextField>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full font-semibold"
              isDisabled={loading || !email}
              isPending={loading}
            >
              {loading
                ? t('login-sending')
                : t('login-send-link')}
            </Button>
          </form>

          <div className="text-center text-sm text-gray-600">
            <p>
              {t('login-passwordless-info')}
            </p>
          </div>

          <div className="pt-4 border-t text-center text-sm">
            <p className="text-gray-600 mb-2">
              {t('login-new-customer')}
            </p>
            <p className="text-gray-500">
              {t('login-signup-auto')}
            </p>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
