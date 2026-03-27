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
import { Button } from "@heroui/react";
import { Input, TextField, Label } from "@heroui/react";
import { Select,  ListBox } from "@heroui/react";
import {
  Table,
} from "@heroui/react";
import {
  Modal,
} from "@heroui/react";
import { Card, Tooltip } from "@heroui/react";
import { Chip } from "@heroui/react";
import { Plus, Edit2, Trash2, Package } from "lucide-react";
import DefaultLayout from "@/layouts/default";
import {
  ShippingClass,
  getShippingClasses,
  createShippingClass,
  updateShippingClass,
  deleteShippingClass,
} from "@/lib/store-api";

// ─── Component ───────────────────────────────────────────────────────────

export default function ShippingClassesPage() {
  const { t } = useTranslation();

  // List state
  const [classes, setClasses] = useState<ShippingClass[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingClass, setEditingClass] = useState<ShippingClass | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    display_name: "",
    description: "",
    resolution: "exclusive" as "exclusive" | "additive",
    status: "active" as "active" | "inactive",
  });

  // ─── Load data ─────────────────────────────────────────────────────────

  const loadData = async () => {
    try {
      const resp = await getShippingClasses(100);

      setClasses(resp.items ?? []);
    } catch (err) {
      console.error("Failed to load shipping classes", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Filtered list ─────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    let filtered = classes;

    if (statusFilter)
      filtered = filtered.filter((c) => c.status === statusFilter);
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (c) =>
          c.display_name.toLowerCase().includes(term) ||
          c.code.toLowerCase().includes(term),
      );
    }

    return filtered;
  }, [classes, statusFilter, globalFilter]);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingClass(null);
    setFormData({
      code: "",
      display_name: "",
      description: "",
      resolution: "exclusive",
      status: "active",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cls: ShippingClass) => {
    setIsEditMode(true);
    setEditingClass(cls);
    setFormData({
      code: cls.code,
      display_name: cls.display_name,
      description: cls.description ?? "",
      resolution: cls.resolution,
      status: cls.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (isEditMode && editingClass) {
        const updated = await updateShippingClass(editingClass.id, {
          display_name: formData.display_name,
          description: formData.description || null,
          resolution: formData.resolution,
          status: formData.status,
        });

        if (updated) {
          setClasses((prev) =>
            prev.map((c) => (c.id === editingClass.id ? updated : c)),
          );
        } else {
          await loadData();
        }
      } else {
        const created = await createShippingClass({
          code: formData.code,
          display_name: formData.display_name,
          description: formData.description || undefined,
          resolution: formData.resolution,
        });

        if (created) {
          setClasses((prev) => [...prev, created]);
        } else {
          await loadData();
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save shipping class", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin-shipping-classes-confirm-delete"))) return;
    try {
      await deleteShippingClass(id);
      await loadData();
    } catch (err) {
      console.error("Failed to delete shipping class", err);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <DefaultLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">
                {t("admin-shipping-classes-title")}
              </h1>
              <p className="text-sm text-default-500 mt-1">
                {t("admin-shipping-classes-subtitle")}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            onPress={handleOpenCreate}
          >
            <Plus className="w-4 h-4" />
            {t("admin-shipping-classes-btn-new")}
          </Button>
        </div>

        {/* Info banner explaining resolution modes */}
        <Card className="mb-6 border-l-4 border-blue-400">
          <Card.Content className="py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold text-orange-600">
                  {t("admin-shipping-classes-exclusive-help-title")}
                </span>
                <p className="text-default-500 mt-1">
                  {t("admin-shipping-classes-exclusive-help-desc")}
                </p>
              </div>
              <div>
                <span className="font-semibold text-green-600">
                  {t("admin-shipping-classes-additive-help-title")}
                </span>
                <p className="text-default-500 mt-1">
                  {t("admin-shipping-classes-additive-help-desc")}
                </p>
              </div>
            </div>
          </Card.Content>
        </Card>

        {/* Filters */}
        <Card className="mb-6">
          <Card.Content className="flex gap-4">
            <TextField className="w-full">
              <Label>{t("admin-shipping-classes-filter-placeholder")}</Label>
              <Input
                placeholder={t("admin-shipping-classes-filter-placeholder")}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </TextField>
            <Select
              value={statusFilter || ""}
              onChange={(value) => setStatusFilter((value as string) || "")}
            >
              <Label>{t("admin-shipping-classes-status")}</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="" textValue={t("admin-shipping-classes-filter-status")}>
                    {t("admin-shipping-classes-filter-status")}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="active" textValue={t("admin-shipping-classes-active")}>
                    {t("admin-shipping-classes-active")}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="inactive" textValue={t("admin-shipping-classes-inactive")}>
                    {t("admin-shipping-classes-inactive")}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </Card.Content>
        </Card>

        {/* Table */}
        <Card>
          <Card.Content>
            <Table>
              <Table.Content>
                <Table.Header>
                  <Table.Column key="code" isRowHeader>
                    {t("admin-shipping-classes-col-code")}
                  </Table.Column>
                <Table.Column key="display_name">
                  {t("admin-shipping-classes-col-name")}
                </Table.Column>
                <Table.Column key="resolution">
                  {t("admin-shipping-classes-col-resolution")}
                </Table.Column>
                <Table.Column key="description">
                  {t("admin-shipping-classes-col-description")}
                </Table.Column>
                <Table.Column key="status">
                  {t("admin-shipping-classes-col-status")}
                </Table.Column>
                <Table.Column key="actions">
                  {t("admin-shipping-classes-col-actions")}
                </Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => <div>{t("admin-shipping-classes-empty")}</div>}
              >
                {displayed.map((cls) => (
                  <Table.Row key={cls.id} className="odd:bg-default-50">
                    <Table.Cell>
                      <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                        {cls.code}
                      </code>
                    </Table.Cell>
                    <Table.Cell className="font-medium">
                      {cls.display_name}
                    </Table.Cell>
                    <Table.Cell>
                      {cls.resolution === "exclusive" ? (
                        <Chip size="sm" variant="tertiary">
                          {t("admin-shipping-classes-exclusive")}
                        </Chip>
                      ) : (
                        <Chip size="sm" variant="tertiary">
                          {t("admin-shipping-classes-additive")}
                        </Chip>
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-default-500 text-sm">
                      {cls.description ?? "—"}
                    </Table.Cell>
                    <Table.Cell>
                      <span
                        className={
                          cls.status === "active"
                            ? "text-green-600"
                            : "text-gray-400"
                        }
                      >
                        {cls.status}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Tooltip>
                          <Tooltip.Trigger>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="tertiary"
                              onPress={() => handleOpenEdit(cls)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          </Tooltip.Trigger>
                          <Tooltip.Content>
                            {t("admin-shipping-classes-btn-edit")}
                          </Tooltip.Content>
                        </Tooltip>
                        <Tooltip>
                          <Tooltip.Trigger>
                            <Button
                              isIconOnly

                              size="sm"
                              variant="tertiary"
                              onPress={() => handleDelete(cls.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </Tooltip.Trigger>
                          <Tooltip.Content>
                            {t("admin-shipping-classes-btn-delete")}
                          </Tooltip.Content>
                        </Tooltip>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table>
        </Card.Content>
      </Card>

      {/* Create / Edit Modal */}
        <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
          <Modal.Backdrop />
          <Modal.Container size="lg">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger onPress={close} />
                  <Modal.Header>
                      {isEditMode
                        ? t("admin-shipping-classes-modal-title-edit")
                        : t("admin-shipping-classes-modal-title-create")}
                  </Modal.Header>
                  <Modal.Body className="gap-4">
              {/* Code — only editable on creation */}
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField isRequired isDisabled={isEditMode}>
                    <Label>{t("admin-shipping-classes-code")}</Label>
                    <Input
                      placeholder={t("admin-shipping-classes-code-placeholder")}
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value.toLowerCase() })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t("admin-shipping-classes-code-help")}
                </Tooltip.Content>
              </Tooltip>
              <TextField isRequired>
                <Label>{t("admin-shipping-classes-display-name")}</Label>
                <Input
                  placeholder={t(
                    "admin-shipping-classes-display-name-placeholder",
                  )}
                  value={formData.display_name}
                  onChange={(e) =>
                    setFormData({ ...formData, display_name: e.target.value })
                  }
                />
              </TextField>
              <TextField>
                <Label>{t("admin-shipping-classes-description")}</Label>
                <Input
                  placeholder={t(
                    "admin-shipping-classes-description-placeholder",
                  )}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </TextField>
              <Select
                isRequired
                value={formData.resolution}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    resolution: value as any,
                  })
                }
              >
                <Label>{t("admin-shipping-classes-resolution-mode")}</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="exclusive" id="exclusive" textValue={t("admin-shipping-classes-resolution-exclusive-label")}>
                      {t("admin-shipping-classes-resolution-exclusive-label")}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item key="additive" id="additive" textValue={t("admin-shipping-classes-resolution-additive-label")}>
                      {t("admin-shipping-classes-resolution-additive-label")}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              {isEditMode && (
                <Select
                  value={formData.status}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      status: value as any,
                    })
                  }
                >
                  <Label>{t("admin-shipping-classes-status")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item key="active" id="active" textValue={t("admin-shipping-classes-active")}>
                        {t("admin-shipping-classes-active")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item key="inactive" id="inactive" textValue={t("admin-shipping-classes-inactive")}>
                        {t("admin-shipping-classes-inactive")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              )}
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="tertiary" onPress={close}>
                      {t("admin-shipping-classes-modal-cancel")}
                    </Button>
                    <Button
                      variant="primary"
                      isDisabled={!formData.code || !formData.display_name}
                      onPress={handleSave}
                    >
                      {t("admin-shipping-classes-modal-save")}
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
