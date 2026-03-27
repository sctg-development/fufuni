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

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";

/**
 * Represents a currency record returned by the API.
 */
interface Currency {
  id: string;
  code: string;
  display_name: string;
  symbol: string;
  decimal_places: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Allowed status values for currencies.
 */
const STATUS_OPTIONS = ["active", "inactive"];

/**
 * Administration page for managing currencies: listing, filtering, creating,
 * editing and deleting. Integrates with Hero UI components and secured API.
 */
export default function CurrenciesPage() {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // List state
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    display_name: "",
    symbol: "",
    decimal_places: 2,
    status: "active" as "active" | "inactive",
  });

  // Load currencies
  /**
   * Fetch a page of currencies from the backend and update component state.
   * Handles setting the loading indicator and catching errors.
   */
  const loadCurrencies = async () => {
    try {
      const resp = await getJson(`${apiBase}/v1/regions/currencies?limit=100`);

      setCurrencies(resp.items || []);
    } catch (err) {
      console.error("Failed to load currencies", err);
    }
  };

  useEffect(() => {
    loadCurrencies();
  }, []);

  // Filtered currencies
  const displayed = useMemo(() => {
    let filtered = currencies;

    if (statusFilter) {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (c) =>
          c.code.toLowerCase().includes(term) ||
          c.display_name.toLowerCase().includes(term) ||
          c.symbol.toLowerCase().includes(term),
      );
    }

    return filtered;
  }, [currencies, statusFilter, globalFilter]);

  /**
   * Reset the form for creating a new currency and show the modal.
   */
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingCurrency(null);
    setFormData({
      code: "",
      display_name: "",
      symbol: "",
      decimal_places: 2,
      status: "active",
    });
    setIsModalOpen(true);
  };

  /**
   * Populate form fields with an existing currency and open modal for editing.
   *
   * @param currency - the currency record being edited
   */
  const handleOpenEdit = (currency: Currency) => {
    setIsEditMode(true);
    setEditingCurrency(currency);
    setFormData({
      code: currency.code,
      display_name: currency.display_name,
      symbol: currency.symbol,
      decimal_places: currency.decimal_places,
      status: currency.status,
    });
    setIsModalOpen(true);
  };

  /**
   * Send form data to backend to create or update a currency. Updates local
   * state with the returned object or reloads list on failure. Closes modal on
   * success.
   */
  const handleSave = async () => {
    try {
      if (isEditMode && editingCurrency) {
        const updateData = {
          display_name: formData.display_name,
          symbol: formData.symbol,
          decimal_places: formData.decimal_places,
          status: formData.status,
        };
        const response = await patchJson(
          `${apiBase}/v1/regions/currencies/${editingCurrency.id}`,
          updateData,
        );

        // Mettre à jour le state local
        if (response) {
          setCurrencies(
            currencies.map((c) => (c.id === editingCurrency.id ? response : c)),
          );
        } else {
          await loadCurrencies();
        }
      } else {
        const response = await postJson(
          `${apiBase}/v1/regions/currencies`,
          formData,
        );

        // Ajouter la nouvelle devise
        if (response) {
          setCurrencies([...currencies, response]);
        } else {
          await loadCurrencies();
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save currency", err);
    }
  };

  /**
   * Remove a currency record after confirmation and refresh the list.
   *
   * @param id - unique identifier of the currency to delete
   */
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this currency?")) {
      try {
        await deleteJson(`${apiBase}/v1/regions/currencies/${id}`);
        await loadCurrencies();
      } catch (err) {
        console.error("Failed to delete currency", err);
      }
    }
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t("admin-currencies-title")}</h1>
          <Button variant="primary" onPress={handleOpenCreate}>
            <Plus className="w-4 h-4" />
            {t("admin-currencies-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <Card.Content className="flex gap-4">
            <TextField className="w-full">
              <Label>{t("admin-currencies-filter-placeholder")}</Label>
              <Input
                placeholder={t("admin-currencies-filter-placeholder")}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </TextField>
            <Select
              value={statusFilter || ""}
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
                  <Table.Column key="symbol">
                    {t("admin-common-symbol")}
                  </Table.Column>
                  <Table.Column key="decimal_places">
                    {t("admin-currencies-decimals")}
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
                  {displayed.map((currency) => (
                    <Table.Row key={currency.id} className="odd:bg-default-50">
                      <Table.Cell className=" font-bold">
                        {currency.code}
                      </Table.Cell>
                      <Table.Cell>{currency.display_name}</Table.Cell>
                      <Table.Cell>{currency.symbol}</Table.Cell>
                      <Table.Cell>{currency.decimal_places}</Table.Cell>
                      <Table.Cell>
                        <span
                          className={
                            currency.status === "active"
                              ? "text-green-600"
                              : "text-gray-600"
                          }
                        >
                          {currency.status}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-2">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="tertiary"
                            onPress={() => handleOpenEdit(currency)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="tertiary"
                            onPress={() => handleDelete(currency.id)}
                          >
                            <Trash2 className="w-4 h-4" />
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
          <Modal.Backdrop>
            <Modal.Container size="lg">
              <Modal.Dialog>
                {({ close }) => (
                  <>
                    <Modal.CloseTrigger onPress={close} />
                    <Modal.Header>
                      {isEditMode
                        ? t("admin-currencies-edit")
                        : t("admin-currencies-create")}
                    </Modal.Header>
                    <Modal.Body>
                      <Tooltip>
                        <Tooltip.Trigger>
                          <TextField>
                            <Label>{t("admin-common-code")}</Label>
                            <Input
                              disabled={isEditMode}
                              maxLength={3}
                              placeholder="USD"
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
                            "admin-currencies-code-help",
                            "ISO 4217 currency code",
                          )}
                        </Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger>
                          <TextField>
                            <Label>{t("admin-common-name")}</Label>
                            <Input
                              placeholder="US Dollar"
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
                            <Label>{t("admin-common-symbol")}</Label>
                            <Input
                              maxLength={5}
                              placeholder="$"
                              value={formData.symbol}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  symbol: e.target.value,
                                })
                              }
                            />
                          </TextField>
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                          {t(
                            "admin-currencies-symbol-help",
                            "Symbol displayed to customers",
                          )}
                        </Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger>
                          <TextField>
                            <Label>{t("admin-currencies-decimals")}</Label>
                            <Input
                              max={8}
                              min={0}
                              placeholder="2"
                              type="number"
                              value={formData.decimal_places.toString()}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  decimal_places: parseInt(e.target.value) || 2,
                                })
                              }
                            />
                          </TextField>
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                          {t(
                            "admin-currencies-decimals-help",
                            "Number of decimal places",
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
                        isDisabled={!formData.display_name}
                        variant="primary"
                        onPress={handleSave}
                      >
                        {t("admin-common-save")}
                      </Button>
                    </Modal.Footer>
                  </>
                )}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
