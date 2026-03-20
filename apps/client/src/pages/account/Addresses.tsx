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
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Input,
  Select,
  SelectItem,
  Divider,
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
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
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
    onOpen();
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
      onOpenChange();
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
        <Spinner label={t("loading")} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t("account-addresses")}</h1>
        <Button color="primary" onClick={() => handleOpenForm()}>
          {t("account-add-address")}
        </Button>
      </div>

      {addresses.length === 0 ? (
        <Card>
          <CardBody>{t("account-no-addresses")}</CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <Card key={address.id}>
              <CardHeader>
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
              </CardHeader>
              <Divider />
              <CardBody className="gap-2 text-sm">
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
              </CardBody>
              <Divider />
              <CardBody className="flex-row justify-end gap-2 py-2">
                <Button
                  size="sm"
                  variant="light"
                  onClick={() => handleOpenForm(address)}
                >
                  {t("account-edit")}
                </Button>
                <Button
                  color="danger"
                  size="sm"
                  variant="light"
                  onClick={() => handleDeleteAddress(address.id)}
                >
                  {t("account-delete")}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Address Form Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            {editingAddress
              ? t("account-edit-address")
              : t("account-add-address")}
          </ModalHeader>
          <ModalBody className="gap-4">
            <Input
              label={t("account-name")}
              value={formData.name || ""}
              onValueChange={(value) =>
                setFormData({ ...formData, name: value })
              }
            />
            <Input
              label={t("account-address-line1")}
              value={formData.line1 || ""}
              onValueChange={(value) =>
                setFormData({ ...formData, line1: value })
              }
            />
            <Input
              label={t("account-address-line2")}
              value={formData.line2 || ""}
              onValueChange={(value) =>
                setFormData({ ...formData, line2: value })
              }
            />
            <Input
              label={t("account-city")}
              value={formData.city || ""}
              onValueChange={(value) =>
                setFormData({ ...formData, city: value })
              }
            />
            <Input
              label={t("account-state")}
              value={formData.state || ""}
              onValueChange={(value) =>
                setFormData({ ...formData, state: value })
              }
            />
            <Input
              label={t("account-postal-code")}
              value={formData.postal_code || ""}
              onValueChange={(value) =>
                setFormData({ ...formData, postal_code: value })
              }
            />
            <Select
              label={t("account-country")}
              selectedKeys={formData.country ? [formData.country] : ["US"]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;

                setFormData({ ...formData, country: selected });
              }}
            >
              {countries.map((country) => (
                <SelectItem key={country.code}>
                  {country[localeKey] || country.en_US}
                </SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button
              color="danger"
              variant="light"
              onPress={() => onOpenChange()}
            >
              {t("account-cancel")}
            </Button>
            <Button color="primary" onPress={handleSaveAddress}>
              {t("account-save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
