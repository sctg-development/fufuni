/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Spinner,
  Button,
  Input,
  TextField,
  Label,
  Select,
  ListBox,
  Switch,
  Separator} from "@heroui/react";

import { useAuth } from "../../authentication/providers/use-auth";

import { availableLanguages } from "@/i18n";

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
  const [formData, setFormData] = useState<Partial<Profile>>({
    accepts_marketing: 0,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const apiBase =
    import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL;

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const result: Profile = await auth.getJson(`${apiBase}/v1/me/profile`);

        setProfile(result);
        setFormData(result);
      } catch (error) {
        console.error("Error fetching profile:", error);
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
      // Save profile fields (name, phone, locale) to /profile
      const profileUpdates = {
        name: formData.name,
        phone: formData.phone,
        locale: formData.locale,
      };

      await auth.patchJson(`${apiBase}/v1/me/profile`, profileUpdates);

      // Save preferences (accepts_marketing) to /preferences
      const preferencesUpdates = {
        locale: formData.locale,
        accepts_marketing: formData.accepts_marketing === 1,
      };

      await auth.patchJson(`${apiBase}/v1/me/preferences`, preferencesUpdates);

      // Refetch profile to ensure UI has latest data
      const result: Profile = await auth.getJson(`${apiBase}/v1/me/profile`);

      setProfile(result);
      setFormData(result);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving preferences:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="flex flex-col items-center gap-2">
          <Spinner />
          <span className="text-default-500">{t("loading")}</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <Card.Content>{t("account-error")}</Card.Content>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t("account-preferences")}</h1>

      {/* Profile Section */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold">{t("account-profile-info")}</h2>
        </Card.Header>
        <Separator />
        <Card.Content className="gap-4">
          <TextField isDisabled>
            <Label>{t("account-email")}</Label>
            <Input value={profile.email} />
          </TextField>

          <TextField>
            <Label>{t("account-name")}</Label>
            <Input
              placeholder={t("account-enter-name")}
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </TextField>

          <TextField>
            <Label>{t("account-phone")}</Label>
            <Input
              placeholder={t("account-enter-phone")}
              type="tel"
              value={formData.phone || ""}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
            />
          </TextField>

          <Select
            value={formData.locale || "en-US"}
            onChange={(value) => {
              setFormData({ ...formData, locale: (value as string) || "en-US" });
            }}
          >
            <Label>{t("account-language")}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {availableLanguages.map((locale) => (
                  <ListBox.Item key={locale.code} id={locale.code} textValue={locale.nativeName}>
                    {locale.nativeName}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </Card.Content>
      </Card>

      {/* Communication Preferences */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold">
            {t("account-communication")}
          </h2>
        </Card.Header>
        <Separator />
        <Card.Content className="gap-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">
                {t(
                  "account-marketing-emails-desc",
                  "Receive updates about new products and special offers",
                )}
              </p>
            </div>
            <Switch
              isSelected={formData.accepts_marketing === 1}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  accepts_marketing: e ? 1 : 0,
                })
              }
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <Label>{t("account-marketing-emails")}</Label>
              </Switch.Content>
            </Switch>
          </div>
        </Card.Content>
      </Card>

      {/* Save Button */}
      <div className="flex gap-2">
        <Button
          isDisabled={saving}
          isPending={saving}
          onClick={handleSave}
        >
          {t("account-save-changes")}
        </Button>
        {saveSuccess && (
          <span className="text-green-600 flex items-center">
            {t("account-saved-successfully")}
          </span>
        )}
      </div>
    </div>
  );
}
