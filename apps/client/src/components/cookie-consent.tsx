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

import { Button } from "@heroui/react";
import React, { useEffect } from "react";
import { Link } from "@heroui/react";
import { Trans, useTranslation } from "react-i18next";
import {
  Modal,
  useOverlayState,
} from "@heroui/react";

import { useCookieConsent } from "../contexts/cookie-consent-context";

import { buttonGradient } from "./primitives";

import { siteConfig } from "@/config/site";

export const CookieConsent: React.FC = () => {
  const { t } = useTranslation();
  const { cookieConsent, acceptCookies, rejectCookies } = useCookieConsent();
  const modalState = useOverlayState();

  // État pour contrôler la visibilité du modal
  const isOpen = cookieConsent === "pending" && siteConfig().needCookieConsent;

  useEffect(() => {
    if (isOpen) {
      modalState.open();
    } else {
      modalState.close();
    }
  }, [isOpen, modalState]);

  return (
    <Modal
      state={modalState}
    >
      <Modal.Backdrop variant="blur">
      <Modal.Container placement="bottom">
        <Modal.Dialog>
          {({ close }) => (
            <>
              <Modal.Header className="text-lg font-semibold text-default-900">
                {t("cookie-consent-title")}
              </Modal.Header>
              <Modal.Body className="text-small font-normal text-default-700">
                <Trans i18nKey="cookie-consent" t={t} />
                &nbsp;
                <Link className="text-small" href="#">
                  {t("cookie-policy")}
                </Link>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
                <div className="mt-4 flex items-center gap-x-1">
                  <Button
                    className={buttonGradient({ bordered: "violet" })}
                    onPress={() => {
                      console.log("User accepted cookies");
                      acceptCookies();
                      close();
                    }}
                  >
                    {t("accept-all")}
                  </Button>
                  <Button
                    className="rounded-large"
                    variant="outline"
                    onPress={() => {
                      rejectCookies();
                      close();
                    }}
                  >
                    {t("reject")}
                  </Button>
                </div>
              </Modal.Footer>
            </>
          )}
        </Modal.Dialog>
      </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
