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

import { Trans, useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Button, Tooltip } from "@heroui/react";

import { title } from "@/components/primitives";
import DefaultLayout from "@/layouts/default";
import { useAuth, useSecuredApi } from "@/authentication";

export default function ApiPage() {
  const { t } = useTranslation();
  const { getJson } = useSecuredApi();
  const { user, isAuthenticated } = useAuth();
  const [apiResponse, setApiResponse] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (isAuthenticated) {
        try {
          const response = await getJson(
            `${import.meta.env.API_BASE_URL}/v1/__auth0/get/${user?.sub}`,
          );

          setApiResponse(response);
        } catch (error) {
          setApiResponse((error as Error).message);
        }
      }
    };

    fetchData();
  }, [isAuthenticated]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(apiResponse, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DefaultLayout>
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
        <div className="inline-block max-w-lg text-center justify-center">
          <h1 className={title()}>
            <Trans t={t}>api-answer</Trans>
          </h1>
        </div>
        <div className="rounded-lg bg-default-100 px-3 py-2 max-w-2xl">
          <div className="flex items-start justify-between gap-2">
            <pre className="text-sm font-mono overflow-auto max-h-96">
              <code>{JSON.stringify(apiResponse, null, 2)}</code>
            </pre>
            <Tooltip>
              <Button
                isIconOnly
                aria-label="Copy"
                size="sm"
                variant="ghost"
                onPress={handleCopy}
              >
                {copied ? "✓" : "📋"}
              </Button>
              <Tooltip.Content>{copied ? "Copied!" : "Copy to clipboard"}</Tooltip.Content>
            </Tooltip>
          </div>
        </div>
      </section>
    </DefaultLayout>
  );
}
