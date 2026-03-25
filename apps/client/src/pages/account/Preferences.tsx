/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Button,
  Input,
  Select,
  SelectItem,
  Switch,
  Divider,
} from "@heroui/react";

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
        <Spinner label={t("loading")} />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardBody>{t("account-error")}</CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t("account-preferences")}</h1>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("account-profile-info")}</h2>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <Input
            disabled
            description={t(
              "account-email-cannot-change",
              "Email cannot be changed",
            )}
            label={t("account-email")}
            value={profile.email}
          />

          <Input
            label={t("account-name")}
            placeholder={t("account-enter-name")}
            value={formData.name || ""}
            onValueChange={(value) => setFormData({ ...formData, name: value })}
          />

          <Input
            label={t("account-phone")}
            placeholder={t("account-enter-phone")}
            type="tel"
            value={formData.phone || ""}
            onValueChange={(value) =>
              setFormData({ ...formData, phone: value })
            }
          />

          <Select
            label={t("account-language")}
            selectedKeys={formData.locale ? [formData.locale] : ["en-US"]}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;

              setFormData({ ...formData, locale: selected });
            }}
          >
            {availableLanguages.map((locale) => (
              <SelectItem key={locale.code}>{locale.nativeName}</SelectItem>
            ))}
          </Select>
        </CardBody>
      </Card>

      {/* Communication Preferences */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t("account-communication")}
          </h2>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold">{t("account-marketing-emails")}</p>
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
            />
          </div>
        </CardBody>
      </Card>

      {/* Save Button */}
      <div className="flex gap-2">
        <Button
          color="primary"
          disabled={saving}
          isLoading={saving}
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
