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

import React, { useState, useEffect, useMemo } from "react";
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
} from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { Image as ImageIcon, X, Wand2 } from "lucide-react";

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { SearchIcon } from "@/components/icons";
import { formatMoney } from "@/utils/currency";
import { VariantPrices } from "@/components/VariantPrices";
import { RichDescriptionEditor } from "@/components/RichDescriptionEditor";
import { LocalizedTitleInput } from "@/components/LocalizedTitleInput";
import {
  resolveTitle,
  titleMatchesTerm,
  resolveDescription,
  getVendorForLocale,
  mergeVendorLocale,
  getTagsForLocale,
  mergeTagsLocale,
  getHandleForLocale,
  mergeHandleLocale,
} from "@/utils/description";
import { availableLanguages } from "@/i18n";

// --- Data types ----------------------------------------------------------
/**
 * A product variant with SKU, pricing and optional image.
 */
interface Variant {
  id: string;
  sku: string;
  title: string;
  price_cents: number;
  currency?: string; // ISO 4217 code (e.g., "USD", "EUR")
  image_url?: string;
  weight_g?: number;
  dims_cm?: { l: number; w: number; h: number } | null;
  requires_shipping?: boolean;
  barcode?: string | null;
  compare_at_price_cents?: number | null;
  tax_code?: string | null;
}

/**
 * Represents a product with metadata and its variants.
 */
interface Product {
  id: string;
  title: string;
  description: string;
  status: "active" | "draft";
  variants: Variant[];
  created_at: string;
  vendor?: string | null;
  tags?: string[] | null;
  handle?: string | null;
}

/**
 * Shipping class for products that require specific shipping options.
 */
interface ShippingClass {
  id: string;
  code: string;
  display_name: string;
  description?: string;
  resolution: "exclusive" | "additive";
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Options for filtering products by status, including an empty value for all.
 */
const STATUS_OPTIONS = ["", "active", "draft"];

// -------------------------------------------------------------------------
/**
 * Administrative product management page: list, search, filter and
 * create/edit basic product records.
 */
export default function ProductsPage() {
  const { t, i18n } = useTranslation();
  const { getJson, postJson, patchJson } = useSecuredApi();

  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? 'en-US';
  const [selectedLocale, setSelectedLocale] = useState<string>(() => {
    const current = i18n.language;
    return availableLanguages.some((l) => l.code === current)
      ? current
      : defaultLocale;
  });

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // list state
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [shippingClasses, setShippingClasses] = useState<ShippingClass[]>([]);

  // create / edit modal
  const [createModal, setCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "draft">("active");
  const [formShippingClassId, setFormShippingClassId] = useState<string>("");
  // enrichment fields - stored as JSON (multilingual)
  const [formVendor, setFormVendor] = useState("");
  const [formVendorValue, setFormVendorValue] = useState(""); // display value for current locale
  const [formTags, setFormTags] = useState("");
  const [formTagsValue, setFormTagsValue] = useState(""); // display value for current locale
  const [formHandle, setFormHandle] = useState("");
  const [formHandleValue, setFormHandleValue] = useState(""); // display value for current locale

  // variants modal state
  const [variantModal, setVariantModal] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [variantSku, setVariantSku] = useState("");
  const [variantTitle, setVariantTitle] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [variantImage, setVariantImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submittingVariant, setSubmittingVariant] = useState(false);
  // enrichment fields
  const [variantWeightG, setVariantWeightG] = useState("");
  const [variantDimsL, setVariantDimsL] = useState("");
  const [variantDimsW, setVariantDimsW] = useState("");
  const [variantDimsH, setVariantDimsH] = useState("");
  const [variantRequiresShipping, setVariantRequiresShipping] = useState(true);
  const [variantBarcode, setVariantBarcode] = useState("");
  const [variantCompareAtPrice, setVariantCompareAtPrice] = useState("");
  const [variantTaxCode, setVariantTaxCode] = useState("");

  // fetch products from backend
  /**
   * Load product list from the API, applying current status filter.
   * Updates local `products` state and toggles loading indicator.
   */
  const loadProducts = async () => {
    setLoading(true);
    try {
      let url = `${apiBase}/v1/products?limit=100`;

      if (statusFilter) url += `&status=${statusFilter}`;
      const resp = await getJson(url);

      setProducts(resp.items || []);
    } catch (err) {
      console.error("Failed to load products", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [statusFilter]);

  // load shipping classes for selector
  useEffect(() => {
    const loadShippingClasses = async () => {
      try {
        const resp = await getJson(`${apiBase}/v1/regions/shipping-classes?limit=100`);
        setShippingClasses(resp.items || []);
      } catch (err) {
        console.error("Failed to load shipping classes", err);
      }
    };
    loadShippingClasses();
  }, []);

  // sync display values when locale changes
  useEffect(() => {
    setFormVendorValue(getVendorForLocale(formVendor, selectedLocale));
    setFormTagsValue(getTagsForLocale(formTags, selectedLocale));
    setFormHandleValue(getHandleForLocale(formHandle, selectedLocale));
  }, [selectedLocale, formVendor, formTags, formHandle]);

  // filtered list according to global search
  const displayed = useMemo(() => {
    const term = globalFilter.trim().toLowerCase();

    if (!term) return products;

    return products.filter(
      (p) =>
        titleMatchesTerm(p.title, term) ||
        p.description.toLowerCase().includes(term) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(term)),
    );
  }, [products, globalFilter]);

  /**
   * Prepare and open the modal for creating a new product.
   */
  const openCreate = () => {
    setEditingProduct(null);
    setFormTitle("");
    setFormDescription("");
    setFormStatus("active");
    setFormShippingClassId("");
    setFormVendor("");
    setFormVendorValue("");
    setFormTags("");
    setFormTagsValue("");
    setFormHandle("");
    setFormHandleValue("");
    setCreateModal(true);
  };

  /**
   * Populate modal fields with existing product data and open for editing.
   *
   * @param p - product to edit
   */
  const openEdit = async (p: Product) => {
    setEditingProduct(null);

    // Phase 1: immediate pre-fill from local data (may be stale)
    setFormTitle(p.title);
    setFormDescription(p.description);
    setFormStatus(p.status);
    setFormShippingClassId("");
    setFormVendor(p.vendor || "");
    setFormTags(p.tags ? (typeof p.tags === "string" ? p.tags : (p.tags as string[]).join(", ")) : "");
    setFormHandle(p.handle || "");

    // Open the modal before the network load completes
    setCreateModal(true);

    // Phase 2: fetch authoritative product data from the API
    try {
      const full = await getJson(`${apiBase}/v1/products/${p.id}`);

      setEditingProduct(full);
      setFormTitle(full.title);
      setFormDescription(full.description || "");
      setFormStatus((full as any).status || "active");
      setFormShippingClassId((full as any).shipping_class_id || "");
      setFormVendor((full as any).vendor || "");
      setFormTags((full as any).tags ? ((full as any).tags as string[]).join(", ") : "");
      setFormHandle((full as any).handle || "");
    } catch (err) {
      console.error("Error loading product", err);
      setEditingProduct(p);
    }
  };

  /**
   * Handle form submission for creating or updating a product. Performs the
   * appropriate API call, closes the modal, and reloads the product list.
   *
   * @param e - form submission event
   */
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Merge enrichment fields with current locale
      const mergedVendor = mergeVendorLocale(formVendor, selectedLocale, formVendorValue);
      const mergedTags = mergeTagsLocale(formTags, selectedLocale, formTagsValue);
      const mergedHandle = mergeHandleLocale(formHandle, selectedLocale, formHandleValue);

      const productData = {
        title: formTitle,
        description: formDescription || undefined,
        shipping_class_id: formShippingClassId || null,
        vendor: mergedVendor || undefined,
        tags: mergedTags || undefined,
        handle: mergedHandle || undefined,
      };

      if (editingProduct) {
        await patchJson(`${apiBase}/v1/products/${editingProduct.id}`, productData);

        // Optimistic local update to avoid stale states
        const updatedProduct: Product = {
          ...editingProduct,
          title: productData.title,
          description: productData.description || "",
          status: formStatus,
          vendor: (productData.vendor as string) || null,
          tags: (productData.tags as unknown as string[]) || null,
          handle: (productData.handle as string) || null,
        };

        setProducts((prev) =>
          prev.map((prod) => (prod.id === editingProduct.id ? updatedProduct : prod))
        );
        setEditingProduct(updatedProduct);

        setCreateModal(false);
      } else {
        await postJson(`${apiBase}/v1/products`, productData);
        setCreateModal(false);
        await loadProducts();
      }
    } catch (err) {
      console.error("Error saving product", err);
    }
  };

  /**
   * Translate vendor to selected locale (AI).
   * Placeholder for now — would call an AI translation API.
   */
  const handleTranslateVendor = () => {
    // TODO: Implement AI translation
    console.log("Translate vendor");
  };

  /**
   * Translate tags to selected locale (AI).
   * Placeholder for now — would call an AI translation API.
   */
  const handleTranslateTags = () => {
    // TODO: Implement AI translation
    console.log("Translate tags");
  };

  /**
   * Translate handle to selected locale (AI).
   * Placeholder for now — would call an AI translation API.
   */
  const handleTranslateHandle = () => {
    // TODO: Implement AI translation
    console.log("Translate handle");
  };

  /**
   * Reset variant form fields and close the variant modal.
   */
  const resetVariantForm = () => {
    setEditingVariant(null);
    setVariantSku("");
    setVariantTitle("");
    setVariantPrice("");
    setVariantImage(null);
    setVariantWeightG("");
    setVariantDimsL("");
    setVariantDimsW("");
    setVariantDimsH("");
    setVariantRequiresShipping(true);
    setVariantBarcode("");
    setVariantCompareAtPrice("");
    setVariantTaxCode("");
  };

  /**
   * Open variant creation form with empty fields.
   */
  const openCreateVariant = () => {
    resetVariantForm();
    setVariantModal(true);
  };

  /**
   * Populate variant form with existing data and open for editing.
   *
   * @param v - variant to edit
   */
  const openEditVariant = (v: Variant) => {
    setEditingVariant(v);
    setVariantSku(v.sku);
    setVariantTitle(v.title);
    setVariantPrice(String(v.price_cents));
    setVariantImage(v.image_url || null);
    setVariantWeightG(String(v.weight_g || 0));
    setVariantDimsL(String(v.dims_cm?.l || ""));
    setVariantDimsW(String(v.dims_cm?.w || ""));
    setVariantDimsH(String(v.dims_cm?.h || ""));
    setVariantRequiresShipping(v.requires_shipping !== false);
    setVariantBarcode(v.barcode || "");
    setVariantCompareAtPrice(String(v.compare_at_price_cents || ""));
    setVariantTaxCode(v.tax_code || "");
    setVariantModal(true);
  };

  /**
   * Handle image upload: POST file to /v1/images endpoint.
   *
   * @param e - file input change event
   */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch(`${apiBase}/v1/images`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
        },
      });

      if (!response.ok) throw new Error("Upload failed");
      const result = await response.json();

      setVariantImage(result.url || result.key);
    } catch (err) {
      console.error("Image upload error", err);
      alert(t("admin-products-image-upload-error"));
    } finally {
      setUploadingImage(false);
    }
  };

  /**
   * Submit variant form: create or update variant.
   *
   * @param e - form submission event
   */
  const submitVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setSubmittingVariant(true);
    try {
      const price = parseInt(variantPrice, 10);

      if (isNaN(price)) {
        alert("Invalid price");
        setSubmittingVariant(false);

        return;
      }

      // Build enrichment object
      const variantData: Record<string, any> = {
        sku: variantSku,
        title: variantTitle,
        price_cents: price,
        image_url: variantImage || undefined,
        weight_g: variantWeightG ? parseFloat(variantWeightG) : undefined,
        requires_shipping: variantRequiresShipping,
        barcode: variantBarcode || undefined,
        compare_at_price_cents: variantCompareAtPrice ? parseInt(variantCompareAtPrice, 10) : undefined,
        tax_code: variantTaxCode || undefined,
      };

      // Add dimensions if provided
      if (variantDimsL || variantDimsW || variantDimsH) {
        variantData.dims_cm = {
          l: variantDimsL ? parseFloat(variantDimsL) : 0,
          w: variantDimsW ? parseFloat(variantDimsW) : 0,
          h: variantDimsH ? parseFloat(variantDimsH) : 0,
        };
      }

      if (editingVariant) {
        // Update variant
        await patchJson(
          `${apiBase}/v1/products/${editingProduct.id}/variants/${editingVariant.id}`,
          variantData,
        );
      } else {
        // Create variant
        await postJson(`${apiBase}/v1/products/${editingProduct.id}/variants`, variantData);
      }

      setVariantModal(false);
      resetVariantForm();

      // Reload product to show new/updated variant
      const updated = await getJson(
        `${apiBase}/v1/products/${editingProduct.id}`,
      );

      setEditingProduct(updated);
      setProducts((prev) =>
        prev.map((p) => (p.id === editingProduct.id ? updated : p)),
      );
    } catch (err) {
      console.error("Error saving variant", err);
      alert(t("admin-products-variant-save-error"));
    } finally {
      setSubmittingVariant(false);
    }
  };

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* header bar */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">{t("admin-products-title")}</h1>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("search") + "..."}
              size="sm"
              startContent={<SearchIcon className="text-default-400" />}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
            <select
              className="w-32 border rounded px-2 py-1 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt ? opt : t("all")}
                </option>
              ))}
            </select>
            <Button
              className="min-w-40 whitespace-nowrap"
              color="primary"
              size="md"
              onPress={openCreate}
            >
              {t("admin-products-btn-add")}
            </Button>
          </div>
        </div>

        {/* product list */}
        {loading ? (
          <p className="text-default-500">{t("admin-products-loading")}</p>
        ) : (
          <Table aria-label="Products" selectionMode="none">
            <TableHeader>
              <TableColumn>{t("admin-products-col-title")}</TableColumn>
              <TableColumn>{t("admin-products-col-description")}</TableColumn>
              <TableColumn>{t("admin-products-col-variants")}</TableColumn>
              <TableColumn>{t("admin-products-col-status")}</TableColumn>
              <TableColumn>{t("actions")}</TableColumn>
            </TableHeader>
            <TableBody emptyContent={t("admin-products-empty")}>
              {displayed.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{resolveTitle(p.title, i18n.language)}</TableCell>
                  <TableCell>{resolveDescription(p.description, i18n.language) || "-"}</TableCell>
                  <TableCell>{p.variants.length}</TableCell>
                  <TableCell>{p.status}</TableCell>
                  <TableCell>
                    <Button size="sm" onPress={() => openEdit(p)}>
                      {t("admin-products-btn-edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* create/edit modal */}
      <Modal
        isOpen={createModal}
        size={editingProduct ? "lg" : "md"}
        onClose={() => {
          setCreateModal(false);
          setEditingProduct(null);
        }}
      >
        <ModalContent>
          <ModalHeader>
            {editingProduct
              ? resolveTitle(editingProduct.title, i18n.language)
              : t("admin-products-modal-title")}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <form className="space-y-4" id="product-form" onSubmit={submitForm}>
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium">
                  {t("admin-products-title-locale")}
                </label>
                <Select
                  size="sm"
                  className="w-36"
                  selectedKeys={[selectedLocale]}
                  onSelectionChange={(keys) =>
                    setSelectedLocale(Array.from(keys).join(""))
                  }
                >
                  {availableLanguages.map((lang) => (
                    <SelectItem key={lang.code}>{lang.nativeName}</SelectItem>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("admin-products-modal-field-title")}
                </label>
                <LocalizedTitleInput
                  value={formTitle}
                  onChange={setFormTitle}
                  required
                  locale={selectedLocale}
                  onLocaleChange={setSelectedLocale}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("admin-products-modal-field-description")}
                </label>
                <RichDescriptionEditor
                  value={formDescription}
                  onChange={setFormDescription}
                  locale={selectedLocale}
                  onLocaleChange={setSelectedLocale}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("status")}
                </label>
                <select
                  className="border rounded px-2 py-1 w-full"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                >
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("admin-products-shipping-class-label")}
                </label>
                <Select
                  label={t("admin-products-shipping-class-select-label")}
                  description={t("admin-products-shipping-class-select-description")}
                  selectedKeys={formShippingClassId ? [formShippingClassId] : []}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys).join("");
                    setFormShippingClassId(val);
                  }}
                >
                  <SelectItem key="">{t("admin-products-shipping-class-default")}</SelectItem>
                  <>
                    {shippingClasses.map((cls) => {
                      const resolutionLabel =
                        cls.resolution === "exclusive"
                          ? t("admin-products-shipping-class-resolution-exclusive")
                          : t("admin-products-shipping-class-resolution-additive");

                      const displayLabel = `${resolutionLabel} ${cls.display_name}`;
                      const fullLabel = cls.description
                        ? `${displayLabel} — ${cls.description}`
                        : displayLabel;

                      return (
                        <SelectItem key={cls.id} textValue={displayLabel}>
                          {fullLabel}
                        </SelectItem>
                      );
                    })}
                  </>
                </Select>
              </div>

              {/* Enrichment Fields - Simple values (not localized) */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-sm mb-3">
                  {t("admin-products-enrichment-heading")}
                </h3>

                {/* Vendor */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium">
                      {t("admin-products-field-vendor")} <span className="text-xs text-default-500">(optional)</span>
                    </label>
                    <div className="flex gap-2">
                      <p className="text-xs text-default-500">
                        {selectedLocale}
                      </p>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={handleTranslateVendor}
                      >
                        <Wand2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder={t("admin-products-field-vendor-placeholder")}
                    value={formVendorValue}
                    onChange={(e) => setFormVendorValue(e.target.value)}
                  />
                </div>

                {/* Tags */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium">
                      {t("admin-products-field-tags")} <span className="text-xs text-default-500">(comma-separated)</span>
                    </label>
                    <div className="flex gap-2">
                      <p className="text-xs text-default-500">
                        {selectedLocale}
                      </p>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={handleTranslateTags}
                      >
                        <Wand2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder={t("admin-products-field-tags-placeholder")}
                    value={formTagsValue}
                    onChange={(e) => setFormTagsValue(e.target.value)}
                  />
                </div>

                {/* Handle */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium">
                      {t("admin-products-field-handle")} <span className="text-xs text-default-500">(URL slug - optional, auto-generated if empty)</span>
                    </label>
                    <div className="flex gap-2">
                      <p className="text-xs text-default-500">
                        {selectedLocale}
                      </p>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={handleTranslateHandle}
                      >
                        <Wand2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder={t("admin-products-field-handle-placeholder")}
                    value={formHandleValue}
                    onChange={(e) => setFormHandleValue(e.target.value)}
                  />
                </div>
              </div>
            </form>

            {/* Variants section */}
            {editingProduct && (
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {t("admin-products-variants")} (
                      {editingProduct.variants.length})
                    </h3>
                    <Button
                      color="primary"
                      size="sm"
                      onPress={openCreateVariant}
                    >
                      {t("admin-products-btn-add-variant")}
                    </Button>
                  </div>

                  {editingProduct.variants.length === 0 ? (
                    <p className="text-sm text-default-500">
                      {t("admin-products-no-variants")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editingProduct.variants.map((v) => (
                        <VariantCard
                          key={v.id}
                          variant={v}
                          onEdit={() => openEditVariant(v)}
                        />
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              onPress={() => {
                setCreateModal(false);
                setEditingProduct(null);
              }}
            >
              {t("admin-products-btn-cancel")}
            </Button>
            <Button color="primary" form="product-form" type="submit">
              {editingProduct ? t("save") : t("admin-products-btn-create")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Variant modal */}
      <Modal
        isOpen={variantModal}
        size="xl"
        onClose={() => {
          setVariantModal(false);
          resetVariantForm();
        }}
      >
        <ModalContent>
          <ModalHeader>
            {editingVariant
              ? t("admin-products-edit-variant")
              : t("admin-products-add-variant")}
          </ModalHeader>
          <ModalBody>
            <form
              className="space-y-4"
              id="variant-form"
              onSubmit={submitVariant}
            >
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-sku")}
                </label>
                <Input
                  required
                  placeholder={t("admin-products-field-sku-placeholder")}
                  value={variantSku}
                  onChange={(e) => setVariantSku(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-variant-title")}
                </label>
                <Input
                  required
                  placeholder={t("admin-products-field-variant-title-placeholder")}
                  value={variantTitle}
                  onChange={(e) => setVariantTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-price")}
                </label>
                <Input
                  required
                  placeholder={t("admin-products-field-price-placeholder")}
                  type="number"
                  value={variantPrice}
                  onChange={(e) => setVariantPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-image")}
                </label>
                {variantImage ? (
                  <div className="relative inline-block mt-2">
                    <img
                      alt="Preview"
                      className="w-20 h-20 object-cover rounded border"
                      src={variantImage}
                    />
                    <button
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      type="button"
                      onClick={() => setVariantImage(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Input
                      accept="image/*"
                      disabled={uploadingImage}
                      type="file"
                      onChange={handleImageUpload}
                    />
                  </div>
                )}
              </div>

              {/* Enrichment Fields */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-sm mb-3">
                  {t("admin-products-enrichment-heading")}
                </h3>

                {/* Weight */}
                <div className="mb-3">
                  <label className="block text-sm font-medium">
                    {t("admin-products-field-weight")}
                  </label>
                  <Input
                    placeholder={t("admin-products-field-weight-placeholder")}
                    type="number"
                    value={variantWeightG}
                    onChange={(e) => setVariantWeightG(e.target.value)}
                  />
                </div>

                {/* Dimensions */}
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-2">
                    {t("admin-products-field-dimensions")}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder={t("admin-products-field-dimension-length")}
                      type="number"
                      size="sm"
                      value={variantDimsL}
                      onChange={(e) => setVariantDimsL(e.target.value)}
                    />
                    <Input
                      placeholder={t("admin-products-field-dimension-width")}
                      type="number"
                      size="sm"
                      value={variantDimsW}
                      onChange={(e) => setVariantDimsW(e.target.value)}
                    />
                    <Input
                      placeholder={t("admin-products-field-dimension-height")}
                      type="number"
                      size="sm"
                      value={variantDimsH}
                      onChange={(e) => setVariantDimsH(e.target.value)}
                    />
                  </div>
                </div>

                {/* Requires Shipping Toggle */}
                <div className="mb-3 flex items-center">
                  <label className="block text-sm font-medium mr-2">
                    {t("admin-products-field-requires-shipping")}
                  </label>
                  <input
                    type="checkbox"
                    checked={variantRequiresShipping}
                    onChange={(e) => setVariantRequiresShipping(e.target.checked)}
                  />
                </div>

                {/* Barcode */}
                <div className="mb-3">
                  <label className="block text-sm font-medium">
                    {t("admin-products-field-barcode")}
                  </label>
                  <Input
                    placeholder={t("admin-products-field-barcode-placeholder")}
                    value={variantBarcode}
                    onChange={(e) => setVariantBarcode(e.target.value)}
                  />
                </div>

                {/* Compare at Price */}
                <div className="mb-3">
                  <label className="block text-sm font-medium">
                    {t("admin-products-field-compare-at-price")}
                  </label>
                  <Input
                    placeholder={t("admin-products-field-compare-at-price-placeholder")}
                    type="number"
                    value={variantCompareAtPrice}
                    onChange={(e) => setVariantCompareAtPrice(e.target.value)}
                  />
                </div>

                {/* Tax Code */}
                <div>
                  <label className="block text-sm font-medium">
                    {t("admin-products-field-tax-code")}
                  </label>
                  <Input
                    placeholder={t("admin-products-field-tax-code-placeholder")}
                    value={variantTaxCode}
                    onChange={(e) => setVariantTaxCode(e.target.value)}
                  />
                </div>
              </div>
            </form>

            {/* Multi-currency pricing section */}
            {editingProduct && editingVariant && (
              <div className="border-t pt-6">
                <VariantPrices
                  basePriceCents={editingVariant.price_cents}
                  currency={editingVariant.currency || "USD"}
                  productId={editingProduct.id}
                  variantId={editingVariant.id}
                  variantTitle={editingVariant.title}
                />
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              onPress={() => {
                setVariantModal(false);
                resetVariantForm();
              }}
            >
              {t("admin-products-btn-cancel")}
            </Button>
            <Button
              color="primary"
              disabled={uploadingImage}
              form="variant-form"
              isLoading={submittingVariant}
              type="submit"
            >
              {editingVariant ? t("save") : t("admin-products-btn-add-variant")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </DefaultLayout>
  );
}

/**
 * Display a single variant with image thumbnail and pricing.
 * Clickable to edit the variant.
 */
function VariantCard({
  variant,
  onEdit,
}: {
  variant: Variant;
  onEdit: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-default-100 transition-colors"
      onClick={onEdit}
    >
      {variant.image_url ? (
        <img
          alt={variant.title}
          className="w-12 h-12 object-cover rounded border"
          src={variant.image_url}
        />
      ) : (
        <div className="w-12 h-12 flex items-center justify-center rounded border bg-default-100">
          <ImageIcon className="text-default-400" size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm">{variant.title}</p>
        <p className="text-xs text-default-500">{variant.sku}</p>
      </div>
      <p className="font-mono text-sm font-semibold">
        {formatMoney(variant.price_cents, variant.currency || "USD")}
      </p>
    </div>
  );
}
