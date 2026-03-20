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

// apps/client/src/components/LocalizedTitleInput.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@heroui/input';
import { Button } from '@heroui/button';
import { Select, SelectItem } from '@heroui/select';
import { Tooltip } from '@heroui/tooltip';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { availableLanguages } from '@/i18n';
import { useSecuredApi } from '@/authentication';
import {
  getTitleForLocale,
  mergeTitleLocale,
  parseTitle,
} from '@/utils/description';
import { translateWithAi, type AiParams } from '@/utils/ai-client';

interface LocalizedTitleInputProps {
  /** Raw value from the DB: plain string (legacy) or LocalizedDesc JSON */
  value: string;
  /** Called every time the content changes */
  onChange: (newValue: string) => void;
  /** Whether the field is required */
  required?: boolean;
  /** Optional controlled locale (if provided, hides the internal selector) */
  locale?: string;
  /** Optional callback to change locale (used by parent) */
  onLocaleChange?: (locale: string) => void;
}

export function LocalizedTitleInput({
  value,
  onChange,
  required = false,
  locale,
  onLocaleChange,
}: LocalizedTitleInputProps) {
  const { t } = useTranslation();
  const { getJson, hasPermission } = useSecuredApi();

  // --- Locale state ---------------------------------------------------------
  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? 'en-US';
  const [internalLocale, setInternalLocale] = useState(defaultLocale);
  const selectedLocale = locale ?? internalLocale;
  const [inputValue, setInputValue] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [canUseAi, setCanUseAi] = useState(false);

  // --- Refs to avoid stale closures -----------------------------------------
  const valueRef = useRef(value);
  const localeRef = useRef(selectedLocale);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { localeRef.current = selectedLocale; }, [selectedLocale]);

  // --- Sync inputValue when value or locale changes -------------------------
  // This covers two cases:
  //   1. Parent resets value (openEdit called) → reload input
  //   2. Locale switch → load the correct translation
  useEffect(() => {
    setInputValue(getTitleForLocale(value, selectedLocale));
  }, [value, selectedLocale]);

  // --- Auto-migrate to JSON when locale changes on a legacy title -----------
  // When user switches locale on a plain-text title, we should migrate it to JSON
  // format immediately to preserve the current content in the new locale.
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return; // Skip on initial mount
    }

    // If we have content and the title is still plain text, migrate it
    const parsed = parseTitle(value);
    if (typeof parsed === 'string' && inputValue.trim()) {
      const updated = mergeTitleLocale(value, selectedLocale, inputValue);
      onChange(updated);
    }
  }, [selectedLocale, value, inputValue, onChange]);

  // --- Check AI permission on mount ----------------------------------------
  const aiPermission = (import.meta as any).env?.AI_PERMISSION ?? 'ai:api';
  useEffect(() => {
    hasPermission(aiPermission)
      .then(setCanUseAi)
      .catch(() => setCanUseAi(false));
  }, [hasPermission, aiPermission]);

  // RTL support
  const isRTL =
    availableLanguages.find((l) => l.code === selectedLocale)?.isRTL ?? false;

  // --- Input change ---------------------------------------------------------
  const handleInputChange = useCallback(
    (text: string) => {
      setInputValue(text);
      const updated = mergeTitleLocale(valueRef.current, localeRef.current, text);
      onChange(updated);
    },
    [onChange]
  );

  // --- Locale switch --------------------------------------------------------
  // When locale changes, just update the UI.
  // Migration to JSON will happen on save via the parent component.
  const handleLocaleChange = useCallback((newLocale: string) => {
    if (onLocaleChange) {
      onLocaleChange(newLocale);
    } else {
      setInternalLocale(newLocale);
    }
  }, [onLocaleChange]);

  // --- AI translation -------------------------------------------------------
  const handleAiTranslate = useCallback(async () => {
    setIsTranslating(true);
    try {
      // 1. Fetch AI configuration
      const params = await getJson(`${import.meta.env.API_BASE_URL}/v1/ai/parameters`) as AiParams;

      // 2. Find best source to translate from
      const FALLBACK = ['en-US', 'fr-FR', 'es-ES', 'zh-CN', 'ar-SA', 'he-IL'];
      const currentValue = valueRef.current;
      const parsed = parseTitle(currentValue);

      let sourceText = '';
      if (typeof parsed === 'string') {
        sourceText = parsed;
      } else {
        const sourceLang = FALLBACK.find(
          (l) => l !== localeRef.current && !!parsed[l]
        );
        sourceText = sourceLang ? parsed[sourceLang] : '';
      }

      if (!sourceText) {
        alert(t('admin-products-ai-no-source'));
        return;
      }

      // 3. Target language name
      const targetLangName =
        availableLanguages.find((l) => l.code === localeRef.current)?.nativeName ??
        localeRef.current;

      // 4. Translate — plain text mode (isHtml = false)
      const result = await translateWithAi(sourceText, targetLangName, params, false);
      if (!result.success) throw new Error(result.error ?? 'Translation failed');

      if (result.content) {
        const translated = result.content.trim();
        setInputValue(translated);
        const updated = mergeTitleLocale(valueRef.current, localeRef.current, translated);
        onChange(updated);
      }
    } catch (err) {
      console.error('AI title translation failed', err);
      alert(t('admin-products-ai-error'));
    } finally {
      setIsTranslating(false);
    }
  }, [getJson, onChange, t]);

  return (
    <div className="flex items-center gap-2" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Language selector (hidden when controlled by parent) */}
      {!locale && (
        <Select
          size="sm"
          className="w-36 shrink-0"
          aria-label={t('admin-products-title-locale')}
          selectedKeys={[selectedLocale]}
          onSelectionChange={(keys) =>
            handleLocaleChange(Array.from(keys).join(''))
          }
        >
          {availableLanguages.map((lang) => (
            <SelectItem key={lang.code}>{lang.nativeName}</SelectItem>
          ))}
        </Select>
      )}

      {/* Title input */}
      <Input
        className="flex-1"
        required={required}
        value={inputValue}
        onValueChange={handleInputChange}
        placeholder={t('admin-products-title-placeholder')}
        dir={isRTL ? 'rtl' : 'ltr'}
      />

      {/* AI translate — only shown if user has the AI permission */}
      {canUseAi && (
        <Tooltip content={t('admin-products-title-ai')}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="secondary"
            isLoading={isTranslating}
            onPress={handleAiTranslate}
          >
            {!isTranslating && <Sparkles size={14} />}
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
