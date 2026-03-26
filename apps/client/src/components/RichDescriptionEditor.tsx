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

// apps/client/src/components/RichDescriptionEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@heroui/react';
import { Select, Label, ListBox } from '@heroui/react';
import { Tooltip } from '@heroui/react';
import {
  Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Undo, Redo, Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { availableLanguages } from '@/i18n';
import { useSecuredApi } from '@/authentication';
import {
  getEditorContent,
  mergeLocale,
  parseDescription,
} from '@/utils/description';
import { translateWithAi, type AiParams } from '@/utils/ai-client';

import './RichDescriptionEditor.css';

interface RichDescriptionEditorProps {
  /** Raw value from the DB: plain HTML legacy or LocalizedDesc JSON */
  value: string;
  /** Called every time the user edits or switches locale */
  onChange: (newValue: string) => void;
  /** Optional controlled locale (if provided, hides the internal selector) */
  locale?: string;
  /** Optional callback to change locale (used by parent) */
  onLocaleChange?: (locale: string) => void;
}

export function RichDescriptionEditor({
  value,
  onChange,
  locale,
  onLocaleChange,
}: RichDescriptionEditorProps) {
  const { t } = useTranslation();
  const { getJson, hasPermission } = useSecuredApi();

  // --- Locale state ---------------------------------------------------------
  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? 'en-US';
  const [internalLocale, setInternalLocale] = useState(defaultLocale);
  const selectedLocale = locale ?? internalLocale;
  const [isTranslating, setIsTranslating] = useState(false);

  // --- AI permission state --------------------------------------------------
  const [canUseAi, setCanUseAi] = useState(false);
  const aiPermission = (import.meta as any).env?.AI_PERMISSION || 'ai:api';

  // --- Refs to avoid stale closures in Tiptap callbacks --------------------
  // Tiptap's onUpdate callback captures its dependencies at creation time.
  // Using refs lets us always read the latest values without recreating the editor.
  const valueRef = useRef(value);
  const localeRef = useRef(selectedLocale);
  const onChangeRef = useRef(onChange);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { localeRef.current = selectedLocale; }, [selectedLocale]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // --- Check AI permission on mount -----------------------------------------
  useEffect(() => {
    const checkAiPermission = async () => {
      try {
        const hasAiPermission = await hasPermission(aiPermission);
        setCanUseAi(hasAiPermission);
      } catch (err) {
        console.warn('Failed to check AI permission', err);
        setCanUseAi(false);
      }
    };

    checkAiPermission();
  }, [hasPermission, aiPermission]);

  // --- Tiptap editor --------------------------------------------------------
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: t('admin-products-description-placeholder'),
      }),
    ],
    // Load initial content for the current locale
    content: getEditorContent(value, selectedLocale),
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      const updated = mergeLocale(valueRef.current, localeRef.current, html);
      onChangeRef.current(updated);
    },
  });

  // Sync editor content when the selected locale changes (controlled or internal)
  useEffect(() => {
    if (!editor) return;

    const currentValue = valueRef.current;
    const parsed = parseDescription(currentValue);

    if (typeof parsed === 'string') {
      editor.commands.setContent(parsed);
    } else {
      editor.commands.setContent(getEditorContent(currentValue, selectedLocale));
    }

    localeRef.current = selectedLocale;
  }, [editor, selectedLocale]);

  // Set RTL/LTR direction on the editor wrapper when locale changes
  const isRTL =
    availableLanguages.find((l) => l.code === selectedLocale)?.isRTL ?? false;

  // --- Locale switch --------------------------------------------------------
  const handleLocaleChange = useCallback(
    (newLocale: string) => {
      if (!editor) return;

      if (onLocaleChange) {
        onLocaleChange(newLocale);
      } else {
        setInternalLocale(newLocale);
      }

      // Update ref immediately before changing editor content to avoid stale closure
      localeRef.current = newLocale;
      const currentValue = valueRef.current;
      const parsed = parseDescription(currentValue);

      if (typeof parsed === 'string') {
        // Legacy plain HTML: show it as-is in the editor for any locale.
        // Migration to JSON happens automatically on the next keystroke.
        editor.commands.setContent(parsed);
      } else {
        // JSON: load the content for the new locale (with fallback)
        const content = getEditorContent(currentValue, newLocale);
        editor.commands.setContent(content);
      }
    },
    [editor, onLocaleChange]
  );

  // --- AI translation -------------------------------------------------------
  const handleAiTranslate = useCallback(async () => {
    if (!editor) return;
    setIsTranslating(true);
    try {
      // 1. Fetch AI configuration from the backend
      const params = await getJson(`${import.meta.env.API_BASE_URL}/v1/ai/parameters`) as AiParams;

      // 2. Find the best source content to translate FROM
      //    (first non-empty locale in the fallback chain, excluding current)
      const FALLBACK = ['en-US', 'fr-FR', 'es-ES', 'zh-CN', 'ar-SA', 'he-IL'];
      const currentValue = valueRef.current;
      const parsed = parseDescription(currentValue);

      let sourceHtml = '';
      if (typeof parsed === 'string') {
        sourceHtml = parsed;
      } else {
        const sourceLang = FALLBACK.find(
          (l) => l !== localeRef.current && !!parsed[l]
        );
        sourceHtml = sourceLang ? parsed[sourceLang] : '';
      }

      if (!sourceHtml) {
        alert(t('admin-products-ai-no-source'));
        return;
      }

      // 3. Get target language name
      const targetLangName =
        availableLanguages.find((l) => l.code === localeRef.current)?.nativeName ??
        localeRef.current;

      // 4. Call the AI API through a client-side multi-provider function
      const result = await translateWithAi(sourceHtml, targetLangName, params);

      if (!result.success) {
        throw new Error(result.error || 'Translation failed');
      }

      if (result.content) {
        editor.commands.setContent(result.content);
        // Trigger onChange manually because setContent does not fire onUpdate
        const updated = mergeLocale(valueRef.current, localeRef.current, result.content);
        onChangeRef.current(updated);
      }
    } catch (err) {
      console.error('AI translation failed', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      alert(t('admin-products-ai-error', `Translation failed: ${errorMsg}`));
    } finally {
      setIsTranslating(false);
    }
  }, [editor, getJson, t]);

  if (!editor) return null;

  // Helper: returns "primary" if the format is active, "tertiary" otherwise
  const v = (active: boolean) => (active ? ('primary' as const) : ('tertiary' as const));

  return (
    <div className="border rounded-lg overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-2 border-b bg-default-50 flex-wrap">

        {/* Language selector (hidden when controlled by parent) */}
        {!locale && (
          <Select
            className="w-36"
            aria-label={t('admin-products-description-locale')}
            value={selectedLocale}
            onChange={(value) => handleLocaleChange((value as string) || "")}
          >
            <Label>{t('admin-products-description-locale')}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {availableLanguages.map((lang) => (
                  <ListBox.Item key={lang.code} id={lang.code} textValue={lang.nativeName}>
                    {lang.nativeName}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        )}

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm" variant={v(editor.isActive('bold'))}
              onPress={() => editor.chain().focus().toggleBold().run()}>
              <Bold size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-bold')}
          </Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm" variant={v(editor.isActive('italic'))}
              onPress={() => editor.chain().focus().toggleItalic().run()}>
              <Italic size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-italic')}
          </Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm"
              variant={v(editor.isActive('heading', { level: 2 }))}
              onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-h2')}
          </Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm"
              variant={v(editor.isActive('heading', { level: 3 }))}
              onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-h3')}
          </Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm" variant={v(editor.isActive('bulletList'))}
              onPress={() => editor.chain().focus().toggleBulletList().run()}>
              <List size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-ul')}
          </Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm" variant={v(editor.isActive('orderedList'))}
              onPress={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-ol')}
          </Tooltip.Content>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm" variant="tertiary"
              isDisabled={!editor.can().undo()}
              onPress={() => editor.chain().focus().undo().run()}>
              <Undo size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-undo')}
          </Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm" variant="tertiary"
              isDisabled={!editor.can().redo()}
              onPress={() => editor.chain().focus().redo().run()}>
              <Redo size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-editor-redo')}
          </Tooltip.Content>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        {/* AI translate button - only visible if user has permission */}
        {canUseAi && (
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                size="sm" variant="tertiary"
                onPress={handleAiTranslate}
              >
                {!isTranslating && <Sparkles size={14} />}
                {t('admin-products-editor-ai-btn')}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {t('admin-products-editor-ai')}
            </Tooltip.Content>
          </Tooltip>
        )}
      </div>

      {/* ── Editor content area ────────────────────────────────────────── */}
      <div className="rich-editor-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
