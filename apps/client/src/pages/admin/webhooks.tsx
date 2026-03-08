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
import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  CheckCircle,
  Clock,
  RotateCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/modal";
import clsx from "clsx";

import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";

/**
 * Predefined events that can be subscribed to when creating or editing a
 * webhook. The `value` is sent to the backend, while `label` and
 * `description` are shown in the UI.
 */
const WEBHOOK_EVENTS = [
  {
    value: "order.created",
    label: "Order Created",
    description: "When a new order is placed",
  },
  {
    value: "order.updated",
    label: "Order Updated",
    description: "When order status changes",
  },
  {
    value: "order.shipped",
    label: "Order Shipped",
    description: "When order is marked shipped",
  },
  {
    value: "order.refunded",
    label: "Order Refunded",
    description: "When order is refunded",
  },
  {
    value: "inventory.low",
    label: "Low Inventory",
    description: "When stock drops below threshold",
  },
  {
    value: "order.*",
    label: "All Order Events",
    description: "Subscribe to all order events",
  },
  { value: "*", label: "All Events", description: "Subscribe to everything" },
] as const;

/**
 * Basic webhook record returned in the list endpoint.
 */
interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: string;
}

/**
 * Detailed webhook record used in the detail view. Includes recent delivery
 * attempts and the signing secret (rotated on demand).
 */
interface WebhookDetail extends Webhook {
  secret?: string;
  recent_deliveries: Array<{
    id: string;
    status: string;
    event_type: string;
    response_code?: number;
    attempts: number;
    created_at: string;
  }>;
  created_at: string;
}

/**
 * Page for managing webhooks: listing existing hooks, viewing details,
 * creating new subscriptions, rotating secrets, and deleting hooks.
 *
 * Utilizes react-query for data fetching and mutations, and Hero UI for the
 * modal dialogs.
 */
export default function WebhooksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getJson, postJson, putJson, deleteJson } = useSecuredApi();
  const [createModal, setCreateModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // bumping this counter causes the query key to change, forcing a fresh network
  // request (provider caching is keyed by URL so we also append a cache-busting
  // query parameter when we call `getJson`).
  const [refreshIndex, setRefreshIndex] = useState(0);

  // debug: track when the create modal state changes
  /* eslint-disable no-console */
  useEffect(() => {
    console.log("[WebhooksPage] createModal =>", createModal);
  }, [createModal]);
  /* eslint-enable no-console */

  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["order.created"]);

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  /**
   * Query for retrieving the list of webhooks. `refreshIndex` is a simple
   * counter used to bust cache when mutations change the data.
   */
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["webhooks", refreshIndex],
    queryFn: () => getJson(`${apiBase}/v1/webhooks?cb=${Date.now()}`),
  });

  const webhooks: Webhook[] = data?.items || [];

  /**
   * Query for fetching the details of a single webhook when one is selected.
   * Disabled when `selectedWebhook` is null.
   */
  const { data: webhookDetail } = useQuery<WebhookDetail | null>({
    queryKey: ["webhook", selectedWebhook],
    queryFn: () =>
      selectedWebhook
        ? getJson(`${apiBase}/v1/webhooks/${selectedWebhook}`)
        : null,
    enabled: !!selectedWebhook,
  });

  /**
   * Mutation used to create a new webhook. On success it resets the creation
   * form, closes the modal, and displays the new secret if one was returned.
   */
  const createMutation = useMutation({
    mutationFn: (data: { url: string; events: string[] }) =>
      postJson(`${apiBase}/v1/webhooks`, data),
    onSuccess: (result: any) => {
      // bump the counter rather than relying solely on invalidateQueries so that
      // the url used by getJson is unique and bypasses the provider cache.
      setRefreshIndex((i) => i + 1);
      setCreateModal(false);
      setNewUrl("");
      setNewEvents(["order.created"]);
      setNewSecret(result.secret);
    },
  });

  /**
   * Mutation for updating an existing webhook record (status, etc.). After
   * success it invalidates both the list and detail queries.
   */
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      putJson(`${apiBase}/v1/webhooks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      queryClient.invalidateQueries({ queryKey: ["webhook", selectedWebhook] });
    },
  });

  /**
   * Mutation for deleting a webhook. Clears the selected webhook and refreshes
   * the list on success.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJson(`${apiBase}/v1/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setSelectedWebhook(null);
    },
  });

  /**
   * Mutation that rotates a webhook's signing secret and shows the new value
   * in the secret modal.
   */
  const rotateSecretMutation = useMutation({
    mutationFn: (id: string) =>
      postJson(`${apiBase}/v1/webhooks/${id}/rotate-secret`, {}),
    onSuccess: (result: any) => {
      setNewSecret(result.secret);
    },
  });

  /**
   * Form submit handler for creating a webhook. Validates required fields and
   * triggers the creation mutation.
   *
   * @param e - form event
   */
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl || newEvents.length === 0) return;
    createMutation.mutate({ url: newUrl, events: newEvents });
  };

  /**
   * Copy a webhook secret to the clipboard and show a temporary confirmation
   * indicator.
   *
   * @param secret - text to copy
   */
  const copySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  /**
   * Add or remove an event from the set of events selected in the create form.
   *
   * @param event - event value to toggle
   */
  const toggleEvent = (event: string) => {
    if (newEvents.includes(event)) {
      setNewEvents(newEvents.filter((e) => e !== event));
    } else {
      setNewEvents([...newEvents, event]);
    }
  };

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 h-9">
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--text)" }}
          >
            {t("admin-webhooks-title")}
          </h1>
          <div className="flex items-center gap-2">
            <button
              className="p-2 rounded hover:bg-(--bg-hover) transition-colors disabled:opacity-50"
              disabled={isFetching}
              style={{ color: "var(--text-muted)" }}
              onClick={() => setRefreshIndex((i) => i + 1)}
            >
              <RefreshCw
                className={isFetching ? "animate-spin" : ""}
                size={16}
              />
            </button>
            <Button
              className="inline-flex items-center gap-1.5"
              color="primary"
              size="sm"
              onPress={() => setCreateModal(true)}
            >
              <Plus size={16} />
              {t("admin-webhooks-btn-add")}
            </Button>
          </div>
        </div>

        {/* List */}
        <div
          className="rounded overflow-hidden"
          style={{
            background: "var(--bg-content)",
            border: "1px solid var(--border)",
          }}
        >
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2
                className="animate-spin"
                size={20}
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("admin-webhooks-empty")}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {t("admin-webhooks-empty-help")}
              </p>
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead>
                <tr
                  className="text-left text-xs font-medium uppercase tracking-wide"
                  style={{
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th className="px-4 py-3">{t("admin-webhooks-col-url")}</th>
                  <th className="px-4 py-3">
                    {t("admin-webhooks-col-events")}
                  </th>
                  <th className="px-4 py-3">{t("status")}</th>
                </tr>
              </thead>
              <tbody
                className="divide-y"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {webhooks.map((webhook) => (
                  <tr
                    key={webhook.id}
                    className="cursor-pointer transition-colors hover:bg-(--bg-hover)"
                    onClick={() => setSelectedWebhook(webhook.id)}
                  >
                    <td className="px-4 py-4 font-mono text-sm break-all">
                      {webhook.url}
                    </td>
                    <td
                      className="px-4 py-4 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {webhook.events.join(", ")}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={clsx(
                          "text-xs px-2 py-0.5 rounded",
                          webhook.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                        )}
                      >
                        {webhook.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create Modal */}
        <Modal
          isOpen={createModal}
          size="md"
          onClose={() => setCreateModal(false)}
        >
          <ModalContent>
            <ModalHeader>{t("admin-webhooks-modal-title")}</ModalHeader>
            <ModalBody>
              <form className="space-y-4" onSubmit={handleCreate}>
                <div>
                  <label
                    className="block text-xs font-medium uppercase tracking-wide mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("admin-webhooks-field-endpoint")}
                  </label>
                  <input
                    required
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg focus:outline-none focus:ring-2"
                    placeholder="https://your-server.com/webhook"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-medium uppercase tracking-wide mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("admin-webhooks-field-events")}
                  </label>
                  <div
                    className="space-y-2 max-h-48 overflow-y-auto p-3 rounded-lg"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {WEBHOOK_EVENTS.map((event) => (
                      <label
                        key={event.value}
                        className="flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors hover:bg-(--bg-hover)"
                      >
                        <input
                          checked={newEvents.includes(event.value)}
                          className="mt-0.5"
                          type="checkbox"
                          onChange={() => toggleEvent(event.value)}
                        />
                        <div>
                          <p className="text-sm font-mono">{event.label}</p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {event.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button onPress={() => setCreateModal(false)}>
                    {t("cancel")}
                  </Button>
                  <Button
                    color="primary"
                    disabled={
                      createMutation.isPending || newEvents.length === 0
                    }
                    type="submit"
                  >
                    {createMutation.isPending
                      ? t("admin-webhooks-creating")
                      : t("admin-webhooks-btn-create")}
                  </Button>
                </div>
              </form>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Secret Display Modal */}
        <Modal
          isOpen={!!newSecret}
          size="sm"
          onClose={() => setNewSecret(null)}
        >
          <ModalContent>
            <ModalHeader>{t("admin-webhooks-secret-title")}</ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div
                  className="p-3 rounded-lg"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <p
                    className="text-xs font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("admin-webhooks-secret-savehint")}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs break-all">
                      {newSecret}
                    </code>
                    <button
                      className="p-2 rounded-lg hover:bg-(--bg-hover) shrink-0"
                      style={{ color: "var(--text-muted)" }}
                      onClick={() => copySecret(newSecret!)}
                    >
                      {copiedSecret ? (
                        <Check className="text-green-500" size={16} />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>
                <p
                  className="text-xs font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("admin-webhooks-secret-note")}
                </p>
                <Button
                  className="w-full"
                  color="primary"
                  onPress={() => setNewSecret(null)}
                >
                  {t("done")}
                </Button>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Detail modal */}
        <Modal
          isOpen={!!selectedWebhook}
          size="lg"
          onClose={() => setSelectedWebhook(null)}
        >
          <ModalContent>
            <ModalHeader>{t("admin-webhooks-detail-title")}</ModalHeader>
            <ModalBody>
              {webhookDetail && (
                <div className="space-y-5">
                  {/* URL & Status */}
                  <div
                    className="p-3 rounded-lg"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <h4
                      className="text-xs font-medium uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t("admin-webhooks-field-endpoint")}
                    </h4>
                    <p className="font-mono text-sm break-all">
                      {webhookDetail.url}
                    </p>
                    <div
                      className="mt-3 pt-3 border-t"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <h4
                        className="text-xs font-medium uppercase tracking-wide mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("status")}
                      </h4>
                      <select
                        className="px-3 py-2 text-sm font-mono rounded-lg focus:outline-none focus:ring-2"
                        disabled={updateMutation.isPending}
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                        }}
                        value={webhookDetail.status}
                        onChange={(e) =>
                          updateMutation.mutate({
                            id: webhookDetail.id,
                            data: { status: e.target.value },
                          })
                        }
                      >
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </div>
                  </div>

                  {/* Events */}
                  <div
                    className="p-3 rounded-lg"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <h4
                      className="text-xs font-medium uppercase tracking-wide mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t("admin-webhooks-subscribed-events")}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {webhookDetail.events.map((event: string) => (
                        <span
                          key={event}
                          className="px-2 py-1 text-xs font-mono rounded-lg"
                          style={{
                            background: "var(--bg-subtle)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          {event}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Recent Deliveries */}
                  <div
                    className="p-3 rounded-lg"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <h4
                      className="text-xs font-medium uppercase tracking-wide mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {t("admin-webhooks-recent-deliveries")}
                    </h4>
                    {webhookDetail.recent_deliveries.length === 0 ? (
                      <p
                        className="text-sm font-mono"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("admin-webhooks-no-deliveries")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {webhookDetail.recent_deliveries.map(
                          (
                            delivery: WebhookDetail["recent_deliveries"][number],
                          ) => (
                            <div
                              key={delivery.id}
                              className="flex items-center justify-between py-2 border-b last:border-0"
                              style={{ borderColor: "var(--border-subtle)" }}
                            >
                              <div className="flex items-center gap-2">
                                {delivery.status === "success" && (
                                  <CheckCircle
                                    className="text-green-500"
                                    size={14}
                                  />
                                )}
                                {delivery.status === "failed" && (
                                  <AlertCircle
                                    className="text-red-500"
                                    size={14}
                                  />
                                )}
                                {delivery.status === "pending" && (
                                  <Clock className="text-amber-500" size={14} />
                                )}
                                <span className="font-mono text-sm">
                                  {delivery.event_type}
                                </span>
                              </div>
                              <div className="text-right">
                                <span
                                  className="text-xs font-mono"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {delivery.response_code &&
                                    `${delivery.response_code} · `}
                                  {delivery.attempts}{" "}
                                  {t("admin-webhooks-attempt", {
                                    count: delivery.attempts,
                                  })}
                                </span>
                                <p
                                  className="text-xs font-mono"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {new Date(
                                    delivery.created_at,
                                  ).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer: Timestamp + Actions */}
                  <div
                    className="flex items-center justify-between pt-4 border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p
                      className="text-xs font-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("admin-webhooks-created")}{" "}
                      {new Date(webhookDetail.created_at).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                        disabled={rotateSecretMutation.isPending}
                        style={{ color: "var(--text-muted)" }}
                        onClick={() => {
                          if (confirm(t("admin-webhooks-confirm-rotate"))) {
                            rotateSecretMutation.mutate(webhookDetail.id);
                          }
                        }}
                      >
                        <RotateCw size={14} />
                        {rotateSecretMutation.isPending
                          ? t("admin-webhooks-rotating")
                          : t("admin-webhooks-rotate")}
                      </button>
                      <button
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-600"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(t("admin-webhooks-confirm-delete"))) {
                            deleteMutation.mutate(webhookDetail.id);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                        {deleteMutation.isPending
                          ? t("admin-webhooks-deleting")
                          : t("delete")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
