/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
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
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { Tooltip } from "@heroui/tooltip";
import { Plus, Edit2, Trash2 } from "lucide-react";

import { SearchIcon } from "@/components/icons";
import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";

/**
 * Represents a country as returned by the API.
 */
interface Country {
  id: string;
  code: string;
  display_name: string;
  country_name: string;
  language_code: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Permissible status values for a country.
 */
const STATUS_OPTIONS = ["active", "inactive"];

/**
 * A list of language options shown in the country form.
 */
const LANGUAGE_OPTIONS = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ar", name: "العربية" },
];

/**
 * Admin page component for managing countries (list, filter, create, edit, delete).
 *
 * Utilizes the Hero UI library components and communicates with a secured API.
 */
export default function CountriesPage() {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // List state
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    display_name: "",
    country_name: "",
    language_code: "en",
    status: "active" as "active" | "inactive",
  });

  // Load countries
  /**
   * Fetches the list of countries from the backend and stores them in state.
   * Handles loading indicator and errors.
   */
  const loadCountries = async () => {
    setLoading(true);
    try {
      const resp = await getJson(`${apiBase}/v1/regions/countries?limit=100`);

      setCountries(resp.items || []);
    } catch (err) {
      console.error("Failed to load countries", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCountries();
  }, []);

  // Filtered countries
  const displayed = useMemo(() => {
    let filtered = countries;

    if (statusFilter) {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (c) =>
          c.code.toLowerCase().includes(term) ||
          c.display_name.toLowerCase().includes(term) ||
          c.country_name.toLowerCase().includes(term),
      );
    }

    return filtered;
  }, [countries, statusFilter, globalFilter]);

  /**
   * Prepare form for creating a new country and open the modal.
   */
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingCountry(null);
    setFormData({
      code: "",
      display_name: "",
      country_name: "",
      language_code: "en",
      status: "active",
    });
    onOpen();
  };

  /**
   * Populate form with an existing country's data and open the modal for editing.
   *
   * @param country - the country object being edited
   */
  const handleOpenEdit = (country: Country) => {
    setIsEditMode(true);
    setEditingCountry(country);
    setFormData({
      code: country.code,
      display_name: country.display_name,
      country_name: country.country_name,
      language_code: country.language_code,
      status: country.status,
    });
    onOpen();
  };

  /**
   * Submit the form data to the API. If editing, patch the existing country;
   * otherwise create a new one. Handles updating local state and closing the
   * modal.
   */
  const handleSave = async () => {
    try {
      if (isEditMode && editingCountry) {
        const updateData = {
          display_name: formData.display_name,
          country_name: formData.country_name,
          language_code: formData.language_code,
          status: formData.status,
        };
        const response = await patchJson(
          `${apiBase}/v1/regions/countries/${editingCountry.id}`,
          updateData,
        );

        // Mettre à jour le state local avec les données retournées par l'API
        if (response) {
          setCountries(
            countries.map((c) => (c.id === editingCountry.id ? response : c)),
          );
        } else {
          // Fallback: recharger les données si pas de réponse
          await loadCountries();
        }
      } else {
        const response = await postJson(
          `${apiBase}/v1/regions/countries`,
          formData,
        );

        // Ajouter le nouveau pays au tableau
        if (response) {
          setCountries([...countries, response]);
        } else {
          // Fallback: recharger les données
          await loadCountries();
        }
      }
      onOpenChange();
    } catch (err) {
      console.error("Failed to save country", err);
    }
  };

  /**
   * Delete a country after user confirmation and refresh the list.
   *
   * @param id - identifier of the country to remove
   */
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this country?")) {
      try {
        await deleteJson(`${apiBase}/v1/regions/countries/${id}`);
        await loadCountries();
      } catch (err) {
        console.error("Failed to delete country", err);
      }
    }
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t("admin-countries-title")}</h1>
          <Button
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t("admin-countries-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <CardBody className="flex gap-4">
            <Input
              isClearable
              className="w-full"
              placeholder={t("admin-common-search", "Search...")}
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
            <Select
              label={t("admin-common-status", "Status")}
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(key) =>
                setStatusFilter(Array.from(key).join(""))
              }
            >
              <SelectItem key="">All</SelectItem>
              <SelectItem key="active">Active</SelectItem>
              <SelectItem key="inactive">Inactive</SelectItem>
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Table isStriped>
              <TableHeader>
                <TableColumn key="code">
                  {t("admin-common-code", "Code")}
                </TableColumn>
                <TableColumn key="display_name">
                  {t("admin-common-name", "Display Name")}
                </TableColumn>
                <TableColumn key="country_name">
                  {t("admin-countries-fullname", "Full Name")}
                </TableColumn>
                <TableColumn key="language_code">
                  {t("admin-common-language", "Language")}
                </TableColumn>
                <TableColumn key="status">
                  {t("admin-common-status", "Status")}
                </TableColumn>
                <TableColumn key="actions">
                  {t("admin-common-actions", "Actions")}
                </TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={<div>{t("admin-common-empty", "No data")}</div>}
                isLoading={loading}
                items={displayed}
                loadingContent={
                  <div>{t("admin-common-loading", "Loading...")}</div>
                }
              >
                {(country) => (
                  <TableRow key={country.id}>
                    <TableCell className="font-mono font-bold">
                      {country.code}
                    </TableCell>
                    <TableCell>{country.display_name}</TableCell>
                    <TableCell>{country.country_name}</TableCell>
                    <TableCell>{country.language_code}</TableCell>
                    <TableCell>
                      <span
                        className={
                          country.status === "active"
                            ? "text-green-600"
                            : "text-gray-600"
                        }
                      >
                        {country.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleOpenEdit(country)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          color="danger"
                          size="sm"
                          variant="light"
                          onPress={() => handleDelete(country.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        <Modal isOpen={isOpen} size="lg" onOpenChange={onOpenChange}>
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              {isEditMode
                ? t("admin-countries-edit", "Edit Country")
                : t("admin-countries-create", "Create Country")}
            </ModalHeader>
            <ModalBody>
              <Tooltip
                content={t(
                  "admin-countries-code-help",
                  "ISO 3166-1 alpha-2 country code",
                )}
              >
                <Input
                  isDisabled={isEditMode}
                  label={t("admin-common-code", "Code")}
                  maxLength={2}
                  placeholder="US"
                  value={formData.code}
                  onValueChange={(value) =>
                    setFormData({ ...formData, code: value.toUpperCase() })
                  }
                />
              </Tooltip>
              <Tooltip content={t("admin-common-name", "Display Name")}>
                <Input
                  label={t("admin-common-name", "Display Name")}
                  placeholder="United States"
                  value={formData.display_name}
                  onValueChange={(value) =>
                    setFormData({ ...formData, display_name: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t("admin-countries-code-help", "Full country name")}
              >
                <Input
                  label={t("admin-countries-fullname", "Full Name")}
                  placeholder="United States of America"
                  value={formData.country_name}
                  onValueChange={(value) =>
                    setFormData({ ...formData, country_name: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-countries-languages-help",
                  "Languages available for customers in this country",
                )}
              >
                <Select
                  label={t("admin-common-language", "Language")}
                  selectedKeys={[formData.language_code]}
                  onSelectionChange={(key) =>
                    setFormData({
                      ...formData,
                      language_code: Array.from(key).join(""),
                    })
                  }
                >
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <SelectItem key={lang.code}>{lang.name}</SelectItem>
                  ))}
                </Select>
              </Tooltip>
              <Tooltip content={t("admin-common-status", "Status")}>
                <Select
                  label={t("admin-common-status", "Status")}
                  selectedKeys={[formData.status]}
                  onSelectionChange={(key) =>
                    setFormData({
                      ...formData,
                      status: Array.from(key).join("") as "active" | "inactive",
                    })
                  }
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt}>{opt}</SelectItem>
                  ))}
                </Select>
              </Tooltip>
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                variant="light"
                onPress={() => onOpenChange()}
              >
                {t("admin-common-cancel", "Cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={!formData.display_name || !formData.country_name}
                onPress={handleSave}
              >
                {t("admin-common-save", "Save")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
