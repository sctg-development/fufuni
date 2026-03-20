/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../authentication/providers/use-auth';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Spinner } from '@heroui/spinner';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { Switch } from '@heroui/switch';
import { Divider } from '@heroui/divider';

interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
  locale: string | null;
  accepts_marketing: number;
  email: string;
}

/**
 * Allows customers to update their profile and preferences.
 */
export default function Preferences() {
  const { t } = useTranslation();
  const auth = useAuth() as any;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Profile>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const apiBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL;

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const result: Profile = await auth.getJson(`${apiBase}/v1/me/profile`);
        setProfile(result);
        setFormData(result);
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };

    if (auth?.getJson) {
      fetchProfile();
    }
  }, [auth]);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updates = {
        name: formData.name,
        phone: formData.phone,
        locale: formData.locale,
        accepts_marketing: formData.accepts_marketing === 1,
      };
      await auth.patchJson(`${apiBase}/v1/me/profile`, updates);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label={t('loading', 'Loading...')} />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardBody>{t('account-error', 'Failed to load profile')}</CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t('account-preferences', 'Preferences & Settings')}</h1>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('account-profile-info', 'Profile Information')}</h2>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <Input
            label={t('account-email', 'Email')}
            value={profile.email}
            disabled
            description={t('account-email-cannot-change', 'Email cannot be changed')}
          />

          <Input
            label={t('account-name', 'Name')}
            placeholder={t('account-enter-name', 'Enter your name')}
            value={formData.name || ''}
            onValueChange={(value) => setFormData({ ...formData, name: value })}
          />

          <Input
            label={t('account-phone', 'Phone Number')}
            type="tel"
            placeholder={t('account-enter-phone', 'Enter your phone number')}
            value={formData.phone || ''}
            onValueChange={(value) => setFormData({ ...formData, phone: value })}
          />

          <Select
            label={t('account-language', 'Language')}
            selectedKeys={formData.locale ? [formData.locale] : ['en-US']}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              setFormData({ ...formData, locale: selected });
            }}
          >
            <SelectItem key="en-US">English (US)</SelectItem>
            <SelectItem key="fr-FR">Français</SelectItem>
            <SelectItem key="de-DE">Deutsch</SelectItem>
            <SelectItem key="es-ES">Español</SelectItem>
            {/* Add more locales as needed */}
          </Select>
        </CardBody>
      </Card>

      {/* Communication Preferences */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('account-communication', 'Communication Preferences')}</h2>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold">{t('account-marketing-emails', 'Marketing Emails')}</p>
              <p className="text-sm text-gray-500">{t('account-marketing-emails-desc', 'Receive updates about new products and special offers')}</p>
            </div>
            <Switch
              checked={formData.accepts_marketing === 1}
              onChange={(e) => setFormData({ ...formData, accepts_marketing: e.target.checked ? 1 : 0 })}
            />
          </div>
        </CardBody>
      </Card>

      {/* Save Button */}
      <div className="flex gap-2">
        <Button
          color="primary"
          onClick={handleSave}
          disabled={saving}
          isLoading={saving}
        >
          {t('account-save-changes', 'Save Changes')}
        </Button>
        {saveSuccess && (
          <span className="text-green-600 flex items-center">
            {t('account-saved-successfully', 'Saved successfully!')}
          </span>
        )}
      </div>
    </div>
  );
}
