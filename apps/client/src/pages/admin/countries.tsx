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

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Input,
  TextField,
  Label,
  Select,
  ListBox,
  Table,
  Modal,
  Card,
  Tooltip,
} from "@heroui/react";
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
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    try {
      const resp = await getJson(`${apiBase}/v1/regions/countries?limit=100`);

      setCountries(resp.items || []);
    } catch (err) {
      console.error("Failed to load countries", err);
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
    setIsModalOpen(true);
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
    setIsModalOpen(true);
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
      setIsModalOpen(false);
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
          <Button onPress={handleOpenCreate}>
            <Plus className="w-4 h-4" />
            {t("admin-countries-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <Card.Content className="flex gap-4">
            <div className="relative flex-1">
              <TextField
                className="w-full"
                value={globalFilter}
                onChange={(value) => setGlobalFilter(value)}
              >
                <Label>{t("admin-common-search")}</Label>
                <Input
                  className="pl-8"
                  placeholder={t("admin-common-search")}
                />
              </TextField>
              <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-default-400 w-4 h-4" />
            </div>
            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter((value as string) || "")}
            >
              <Label>{t("admin-common-status")}</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="" textValue="All">
                    All
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="active" textValue="Active">
                    Active
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="inactive" textValue="Inactive">
                    Inactive
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content>
            <Table>
              <Table.Content>
                <Table.Header>
                  <Table.Column key="code" isRowHeader>
                    {t("admin-common-code")}
                  </Table.Column>
                  <Table.Column key="display_name">
                    {t("admin-common-name")}
                  </Table.Column>
                  <Table.Column key="country_name">
                    {t("admin-countries-fullname")}
                  </Table.Column>
                  <Table.Column key="language_code">
                    {t("admin-common-language")}
                  </Table.Column>
                  <Table.Column key="status">
                    {t("admin-common-status")}
                  </Table.Column>
                  <Table.Column key="actions">
                    {t("admin-common-actions")}
                  </Table.Column>
                </Table.Header>
                <Table.Body
                  renderEmptyState={() => <div>{t("admin-common-empty")}</div>}
                >
                  {displayed.map((country) => (
                    <Table.Row key={country.id} className="odd:bg-default-50">
                      <Table.Cell className=" font-bold">
                        {country.code}
                      </Table.Cell>
                      <Table.Cell>{country.display_name}</Table.Cell>
                      <Table.Cell>{country.country_name}</Table.Cell>
                      <Table.Cell>{country.language_code}</Table.Cell>
                      <Table.Cell>
                        <span
                          className={
                            country.status === "active"
                              ? "text-green-600"
                              : "text-gray-600"
                          }
                        >
                          {country.status}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-2">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="tertiary"
                            onPress={() => handleOpenEdit(country)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="tertiary"
                            onPress={() => handleDelete(country.id)}
                          >
                            <Trash2 className="w-4 h-4 text-danger" />
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table>
          </Card.Content>
        </Card>

        <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
          <Modal.Backdrop />
          <Modal.Container size="lg">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger onPress={close} />
                  <Modal.Header>
                    {isEditMode
                      ? t("admin-countries-edit")
                      : t("admin-countries-create")}
                  </Modal.Header>
                  <Modal.Body>
                    <Tooltip>
                      <Tooltip.Trigger>
                        <TextField>
                          <Label>{t("admin-common-code")}</Label>
                          <Input
                            disabled={isEditMode}
                            maxLength={2}
                            placeholder="US"
                            value={formData.code}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                code: e.target.value.toUpperCase(),
                              })
                            }
                          />
                        </TextField>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {t(
                          "admin-countries-code-help",
                          "ISO 3166-1 alpha-2 country code",
                        )}
                      </Tooltip.Content>
                    </Tooltip>
                    <Tooltip>
                      <Tooltip.Trigger>
                        <TextField>
                          <Label>{t("admin-common-name")}</Label>
                          <Input
                            placeholder="United States"
                            value={formData.display_name}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                display_name: e.target.value,
                              })
                            }
                          />
                        </TextField>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {t("admin-common-name")}
                      </Tooltip.Content>
                    </Tooltip>
                    <Tooltip>
                      <Tooltip.Trigger>
                        <TextField>
                          <Label>{t("admin-countries-fullname")}</Label>
                          <Input
                            placeholder="United States of America"
                            value={formData.country_name}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                country_name: e.target.value,
                              })
                            }
                          />
                        </TextField>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {t("admin-countries-code-help")}
                      </Tooltip.Content>
                    </Tooltip>
                    <Tooltip>
                      <Tooltip.Trigger>
                        <Select
                          value={formData.language_code}
                          onChange={(value) =>
                            setFormData({
                              ...formData,
                              language_code: (value as string) || "en",
                            })
                          }
                        >
                          <Label>{t("admin-common-language")}</Label>
                          <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox>
                              {LANGUAGE_OPTIONS.map((lang) => (
                                <ListBox.Item
                                  key={lang.code}
                                  id={lang.code}
                                  textValue={lang.name}
                                >
                                  {lang.name}
                                  <ListBox.ItemIndicator />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Select.Popover>
                        </Select>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {t(
                          "admin-countries-languages-help",
                          "Languages available for customers in this country",
                        )}
                      </Tooltip.Content>
                    </Tooltip>
                    <Tooltip>
                      <Tooltip.Trigger>
                        <Select
                          value={formData.status}
                          onChange={(value) =>
                            setFormData({
                              ...formData,
                              status: value as "active" | "inactive",
                            })
                          }
                        >
                          <Label>{t("admin-common-status")}</Label>
                          <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox>
                              {STATUS_OPTIONS.map((opt) => (
                                <ListBox.Item
                                  key={opt}
                                  id={opt}
                                  textValue={opt}
                                >
                                  {opt}
                                  <ListBox.ItemIndicator />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Select.Popover>
                        </Select>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {t("admin-common-status")}
                      </Tooltip.Content>
                    </Tooltip>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="tertiary" onPress={close}>
                      {t("admin-common-cancel")}
                    </Button>
                    <Button
                      isDisabled={
                        !formData.display_name || !formData.country_name
                      }
                      onPress={handleSave}
                    >
                      {t("admin-common-save")}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
