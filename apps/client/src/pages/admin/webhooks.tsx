import { useState } from "react";
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
import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";
import { Modal } from "@heroui/modal";
import clsx from "clsx";

const WEBHOOK_EVENTS = [
  { value: "order.created", label: "Order Created", description: "When a new order is placed" },
  { value: "order.updated", label: "Order Updated", description: "When order status changes" },
  { value: "order.shipped", label: "Order Shipped", description: "When order is marked shipped" },
  { value: "order.refunded", label: "Order Refunded", description: "When order is refunded" },
  {
    value: "inventory.low",
    label: "Low Inventory",
    description: "When stock drops below threshold",
  },
  { value: "order.*", label: "All Order Events", description: "Subscribe to all order events" },
  { value: "*", label: "All Events", description: "Subscribe to everything" },
] as const;

interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: string;
}

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

export default function WebhooksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { getJson, postJson, putJson, deleteJson } = useSecuredApi();
  const [createModal, setCreateModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["order.created"]);

  const apiBase =
    (import.meta as any).env?.API_BASE_URL ? (import.meta as any).env.API_BASE_URL : "";

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => getJson(`${apiBase}/v1/webhooks`),
  });

  const webhooks: Webhook[] = data?.items || [];

  const { data: webhookDetail } = useQuery<WebhookDetail | null>({
    queryKey: ["webhook", selectedWebhook],
    queryFn: () => selectedWebhook ? getJson(`${apiBase}/v1/webhooks/${selectedWebhook}`) : null,
    enabled: !!selectedWebhook,
  });

  const createMutation = useMutation({
    mutationFn: (data: { url: string; events: string[] }) =>
      postJson(`${apiBase}/v1/webhooks`, data),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setCreateModal(false);
      setNewUrl("");
      setNewEvents(["order.created"]);
      setNewSecret(result.secret);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      putJson(`${apiBase}/v1/webhooks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      queryClient.invalidateQueries({ queryKey: ["webhook", selectedWebhook] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJson(`${apiBase}/v1/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setSelectedWebhook(null);
    },
  });

  const rotateSecretMutation = useMutation({
    mutationFn: (id: string) => postJson(`${apiBase}/v1/webhooks/${id}/rotate-secret`, {}),
    onSuccess: (result: any) => {
      setNewSecret(result.secret);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl || newEvents.length === 0) return;
    createMutation.mutate({ url: newUrl, events: newEvents });
  };

  const copySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

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
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            {t("admin-webhooks-title")}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["webhooks"] })}
              disabled={isFetching}
              className="p-2 rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
              style={{ color: "var(--text-muted)" }}
            >
              <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded font-semibold transition-colors"
              style={{ background: "var(--accent)", color: "var(--text-inverse)" }}
            >
              <Plus size={16} />
              {t("admin-webhooks-btn-add")}
            </button>
          </div>
        </div>

        {/* List */}
        <div
          className="rounded overflow-hidden"
          style={{ background: "var(--bg-content)", border: "1px solid var(--border)" }}
        >
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-muted)" }} />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("admin-webhooks-empty")}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {t("admin-webhooks-empty-help")}
              </p>
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead>
                <tr
                  className="text-left text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
                >
                  <th className="px-4 py-3">{t("admin-webhooks-col-url")}</th>
                  <th className="px-4 py-3">{t("admin-webhooks-col-events")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {webhooks.map((webhook) => (
                  <tr
                    key={webhook.id}
                    onClick={() => setSelectedWebhook(webhook.id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <td className="px-4 py-4 font-mono text-sm break-all">{webhook.url}</td>
                    <td className="px-4 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
                      {webhook.events.join(", ")}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={clsx(
                          "text-xs px-2 py-0.5 rounded",
                          webhook.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
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
        <Modal isOpen={createModal} onClose={() => setCreateModal(false)} title={t("admin-webhooks-modal-title")} size="md">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                className="block text-xs font-medium uppercase tracking-wide mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                {t("admin-webhooks-field-endpoint")}
              </label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://your-server.com/webhook"
                required
                className="w-full px-3 py-2 text-sm font-mono rounded-lg focus:outline-none focus:ring-2"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
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
                    className="flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={newEvents.includes(event.value)}
                      onChange={() => toggleEvent(event.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-mono">{event.label}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {event.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div
              className="flex gap-2 justify-end pt-4 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={() => setCreateModal(false)}
                className="px-4 py-2 text-sm font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || newEvents.length === 0}
                className="px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {createMutation.isPending ? t("admin-webhooks-creating") : t("admin-webhooks-btn-create")}
              </button>
            </div>
          </form>
        </Modal>

        {/* Secret Display Modal */}
        <Modal isOpen={!!newSecret} onClose={() => setNewSecret(null)} title={t("admin-webhooks-secret-title")} size="sm">
          <div className="space-y-4">
            <div className="p-3 rounded-lg" style={{ border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                {t("admin-webhooks-secret-savehint")}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs break-all">{newSecret}</code>
                <button
                  onClick={() => copySecret(newSecret!)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-hover)] flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {copiedSecret ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              {t("admin-webhooks-secret-note")}
            </p>
            <button
              onClick={() => setNewSecret(null)}
              className="w-full px-4 py-2 text-sm font-semibold rounded-lg"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {t("done")}
            </button>
          </div>
        </Modal>

        {/* Detail modal */}
        <Modal
          isOpen={!!selectedWebhook}
          onClose={() => setSelectedWebhook(null)}
          title={t("admin-webhooks-detail-title")}
          size="lg"
        >
          {webhookDetail && (
            <div className="space-y-5">
              {/* URL & Status */}
              <div className="p-3 rounded-lg" style={{ border: "1px solid var(--border)" }}>
                <h4
                  className="text-xs font-medium uppercase tracking-wide mb-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("admin-webhooks-field-endpoint")}
                </h4>
                <p className="font-mono text-sm break-all">{webhookDetail.url}</p>
                <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <h4
                    className="text-xs font-medium uppercase tracking-wide mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("status")}
                  </h4>
                  <select
                    value={webhookDetail.status}
                    onChange={(e) =>
                      updateMutation.mutate({
                        id: webhookDetail.id,
                        data: { status: e.target.value },
                      })
                    }
                    disabled={updateMutation.isPending}
                    className="px-3 py-2 text-sm font-mono rounded-lg focus:outline-none focus:ring-2"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  >
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                  </select>
                </div>
              </div>

              {/* Events */}
              <div className="p-3 rounded-lg" style={{ border: "1px solid var(--border)" }}>
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
              <div className="p-3 rounded-lg" style={{ border: "1px solid var(--border)" }}>
                <h4
                  className="text-xs font-medium uppercase tracking-wide mb-3"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("admin-webhooks-recent-deliveries")}
                </h4>
                {webhookDetail.recent_deliveries.length === 0 ? (
                  <p className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                    {t("admin-webhooks-no-deliveries")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {webhookDetail.recent_deliveries.map((delivery: WebhookDetail["recent_deliveries"][number]) => (
                      <div
                        key={delivery.id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <div className="flex items-center gap-2">
                          {delivery.status === "success" && (
                            <CheckCircle size={14} className="text-green-500" />
                          )}
                          {delivery.status === "failed" && (
                            <AlertCircle size={14} className="text-red-500" />
                          )}
                          {delivery.status === "pending" && (
                            <Clock size={14} className="text-amber-500" />
                          )}
                          <span className="font-mono text-sm">{delivery.event_type}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                            {delivery.response_code && `${delivery.response_code} · `}
                            {delivery.attempts} {t("admin-webhooks-attempt", { count: delivery.attempts })}
                          </span>
                          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                            {new Date(delivery.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer: Timestamp + Actions */}
              <div
                className="flex items-center justify-between pt-4 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  {t("admin-webhooks-created")} {new Date(webhookDetail.created_at).toLocaleString()}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (confirm(t("admin-webhooks-confirm-rotate"))) {
                        rotateSecretMutation.mutate(webhookDetail.id);
                      }
                    }}
                    disabled={rotateSecretMutation.isPending}
                    className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <RotateCw size={14} />
                    {rotateSecretMutation.isPending ? t("admin-webhooks-rotating") : t("admin-webhooks-rotate")}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t("admin-webhooks-confirm-delete"))) {
                        deleteMutation.mutate(webhookDetail.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                    {deleteMutation.isPending ? t("admin-webhooks-deleting") : t("delete")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DefaultLayout>
  );
}
