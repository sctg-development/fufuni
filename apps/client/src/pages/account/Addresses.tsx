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
  Modal,
  useOverlayState,
  TextField,
  Input,
  Label,
  Select,
  ListBox,
  Separator,
} from "@heroui/react";

import { useAuth } from "../../authentication/providers/use-auth";

import countries from "@/config/countries.json";

interface Address {
  id: string;
  label: string | null;
  is_default: number;
  name: string | null;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
}

/**
 * Allows customers to view and manage saved delivery addresses.
 */
export default function Addresses() {
  const { t, i18n } = useTranslation();
  const auth = useAuth() as any;
  const localeKey = i18n.language.replace("-", "_") as
    | "en_US"
    | "fr_FR"
    | "es_ES"
    | "ar_SA"
    | "zh_CN"
    | "he_IL"; // Extend this union type based on the languages you support
  const modalState = useOverlayState();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formData, setFormData] = useState<Partial<Address>>({});
  const apiBase =
    import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL;

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      const result: { items: Address[] } = await auth.getJson(
        `${apiBase}/v1/me/addresses`,
      );

      setAddresses(result.items);
    } catch (error) {
      console.error("Error fetching addresses:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth?.getJson) {
      fetchAddresses();
    }
  }, [auth]);

  const handleOpenForm = (address?: Address) => {
    if (address) {
      setEditingAddress(address);
      setFormData(address);
    } else {
      setEditingAddress(null);
      setFormData({
        name: "",
        line1: "",
        city: "",
        postal_code: "",
        country: "US",
      });
    }
    modalState.open();
  };

  const handleSaveAddress = async () => {
    try {
      if (editingAddress) {
        // Update existing address
        // Note: Full PUT/PATCH implementation would be in the backend
      } else {
        // Create new address
        await auth.postJson(`${apiBase}/v1/me/addresses`, formData);
      }
      await fetchAddresses();
      modalState.close();
    } catch (error) {
      console.error("Error saving address:", error);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await auth.deleteJson(`${apiBase}/v1/me/addresses/${id}`);
      await fetchAddresses();
    } catch (error) {
      console.error("Error deleting address:", error);
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t("account-addresses")}</h1>
        <Button onPress={() => handleOpenForm()}>
          {t("account-add-address")}
        </Button>
      </div>

      {addresses.length === 0 ? (
        <Card>
          <Card.Content>{t("account-no-addresses")}</Card.Content>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <Card key={address.id}>
              <Card.Header>
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {address.label || address.name}
                  </h3>
                  {address.is_default === 1 && (
                    <span className="text-xs text-blue-600">
                      {t("account-default")}
                    </span>
                  )}
                </div>
              </Card.Header>
              <Separator />
              <Card.Content className="gap-2 text-sm">
                <p>{address.line1}</p>
                {address.line2 && <p>{address.line2}</p>}
                <p>
                  {address.city}, {address.state} {address.postal_code}
                </p>
                <p>{address.country}</p>
                {address.phone && (
                  <p>
                    {t("account-phone")}: {address.phone}
                  </p>
                )}
              </Card.Content>
              <Separator />
              <Card.Content className="flex-row justify-end gap-2 py-2">
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => handleOpenForm(address)}
                >
                  {t("account-edit")}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => handleDeleteAddress(address.id)}
                >
                  {t("account-delete")}
                </Button>
              </Card.Content>
            </Card>
          ))}
        </div>
      )}

      {/* Address Form Modal */}
      <Modal state={modalState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header>
                    {editingAddress
                      ? t("account-edit-address")
                      : t("account-add-address")}
                  </Modal.Header>
                  <Modal.Body className="gap-4">
                    <TextField>
                      <Label>{t("account-name")}</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                      />
                    </TextField>
                    <TextField>
                      <Label>{t("account-address-line1")}</Label>
                      <Input
                        value={formData.line1 || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, line1: e.target.value })
                        }
                      />
                    </TextField>
                    <TextField>
                      <Label>{t("account-address-line2")}</Label>
                      <Input
                        value={formData.line2 || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, line2: e.target.value })
                        }
                      />
                    </TextField>
                    <TextField>
                      <Label>{t("account-city")}</Label>
                      <Input
                        value={formData.city || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, city: e.target.value })
                        }
                      />
                    </TextField>
                    <TextField>
                      <Label>{t("account-state")}</Label>
                      <Input
                        value={formData.state || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, state: e.target.value })
                        }
                      />
                    </TextField>
                    <TextField>
                      <Label>{t("account-postal-code")}</Label>
                      <Input
                        value={formData.postal_code || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            postal_code: e.target.value,
                          })
                        }
                      />
                    </TextField>
                    <Select
                      value={formData.country || "US"}
                      onChange={(value) => {
                        setFormData({
                          ...formData,
                          country: (value as string) || "US",
                        });
                      }}
                    >
                      <Label>{t("account-country")}</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {countries.map((country) => (
                            <ListBox.Item
                              key={country.code}
                              id={country.code}
                              textValue={country[localeKey] || country.en_US}
                            >
                              {country[localeKey] || country.en_US}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="tertiary" onPress={close}>
                      {t("account-cancel")}
                    </Button>
                    <Button onPress={handleSaveAddress}>
                      {t("account-save")}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
