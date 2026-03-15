# Plan d'action — Description riche multilingue + IA
### Projet Fufuni · Mars 2026

---

## Vue d'ensemble

Ce plan transforme le champ `description` (TEXT simple) de la table `products` en un éditeur
riche multilingue, sans aucune migration de schéma SQL.

**Principe de cohabitation :**
- Valeur existante `<p>…</p>` → conservée comme HTML legacy
- Dès la première édition → migre automatiquement vers `{"fr-FR":"<p>…</p>"}`
- Le backend stocke toujours un `TEXT` — seul le contenu change de format

**Flux complet :**

```
Admin ouvre produit
  → RichDescriptionEditor reçoit value (plain HTML ou JSON)
  → Dropdown langue → getEditorContent() charge le bon contenu
  → Édition → onUpdate → mergeLocale() → onChange(newValue)
  → Clic Sauvegarder → PATCH /v1/products/:id (existant, inchangé)

Visiteur storefront
  → i18n.language synchronisé par LanguageSwitch
  → resolveDescription(product.description, locale) → HTML
  → dangerouslySetInnerHTML
```

---

## Étape 1 — Utilitaire partagé

**Fichier à créer :** `apps/client/src/utils/description.ts`

```typescript
// apps/client/src/utils/description.ts

/** Map locale → HTML content, stored as JSON string in the DB */
export type LocalizedDesc = Record<string, string>;

// Fallback chain: order in which locales are tried when the requested
// locale is missing from the stored JSON.
export const DESCRIPTION_FALLBACK = [
  'en-US', 'fr-FR', 'es-ES', 'zh-CN', 'ar-SA', 'he-IL',
] as const;

/**
 * Detects whether a raw DB string is a LocalizedDesc JSON or plain HTML.
 * Returns the parsed object or the original string.
 */
export function parseDescription(raw: string): LocalizedDesc | string {
  if (!raw) return '';
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(raw) as LocalizedDesc;
    } catch {
      // Malformed JSON: treat as plain HTML
    }
  }
  return raw;
}

/**
 * Resolves the best description string for a given locale.
 * - If raw is plain HTML: returns it as-is (legacy).
 * - If raw is JSON: returns the value for `locale`, or walks the fallback
 *   chain to find the first non-empty value.
 */
export function resolveDescription(raw: string, locale: string): string {
  const parsed = parseDescription(raw);
  if (typeof parsed === 'string') return parsed;

  // Exact match first, then fallback chain
  for (const lang of [locale, ...DESCRIPTION_FALLBACK]) {
    if (parsed[lang]) return parsed[lang];
  }
  return '';
}

/**
 * Merges a new HTML string for a specific locale into the existing raw value.
 * - If raw is plain HTML: migrates it to JSON using the provided locale as key.
 * - If raw is already JSON: updates or adds the locale key.
 */
export function mergeLocale(
  raw: string,
  locale: string,
  html: string
): string {
  const parsed = parseDescription(raw);
  if (typeof parsed === 'string') {
    // First call ever: migrate from plain HTML.
    // The plain HTML becomes the content for the current locale.
    return JSON.stringify({ [locale]: html });
  }
  return JSON.stringify({ ...parsed, [locale]: html });
}

/**
 * Returns the content that should fill the editor when the admin opens
 * a product or switches locale.
 *
 * Rule:
 * - Plain HTML → always show the plain HTML regardless of locale.
 * - JSON + locale exists → show that locale's content.
 * - JSON + locale missing → show the first non-empty fallback locale.
 */
export function getEditorContent(raw: string, locale: string): string {
  const parsed = parseDescription(raw);
  if (typeof parsed === 'string') return parsed;
  return resolveDescription(raw, locale);
}

/**
 * Returns true if the raw value is already a LocalizedDesc JSON object.
 */
export function isLocalized(raw: string): boolean {
  return typeof parseDescription(raw) === 'object';
}
```

---

## Étape 2 — CSS de l'éditeur

**Fichier à créer :** `apps/client/src/components/RichDescriptionEditor.css`

```css
/* apps/client/src/components/RichDescriptionEditor.css */

.rich-editor-content .ProseMirror {
  outline: none;
  min-height: 8rem;
  padding: 0.75rem;
  line-height: 1.6;
  font-size: 0.875rem;
}

.rich-editor-content .ProseMirror h2 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 1rem 0 0.5rem;
}

.rich-editor-content .ProseMirror h3 {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0.75rem 0 0.25rem;
}

.rich-editor-content .ProseMirror ul {
  list-style: disc;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

.rich-editor-content .ProseMirror ol {
  list-style: decimal;
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

.rich-editor-content .ProseMirror strong { font-weight: 700; }
.rich-editor-content .ProseMirror em    { font-style: italic; }

/* Placeholder shown when editor is empty */
.rich-editor-content .ProseMirror p.is-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--heroui-default-400, #a1a1aa);
  pointer-events: none;
  height: 0;
}
```

---

## Étape 3 — Composant éditeur

**Fichier à créer :** `apps/client/src/components/RichDescriptionEditor.tsx`

```tsx
// apps/client/src/components/RichDescriptionEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Select, SelectItem } from '@heroui/select';
import { Tooltip } from '@heroui/tooltip';
import {
  Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Undo, Redo, Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { availableLanguages } from 'i18n';
import { useSecuredApi } from 'authentication';
import {
  getEditorContent,
  mergeLocale,
  parseDescription,
} from 'utils/description';

import './RichDescriptionEditor.css';

// Shape of the response from GET /v1/ai/parameters
interface AiParams {
  apiKey: string;
  model:  string;
  url:    string;
}

interface RichDescriptionEditorProps {
  /** Raw value from the DB: plain HTML legacy or LocalizedDesc JSON */
  value: string;
  /** Called every time the user edits or switches locale */
  onChange: (newValue: string) => void;
  /** Base URL of the merchant API, e.g. "https://api.example.com/" */
  apiBase: string;
}

export function RichDescriptionEditor({
  value,
  onChange,
  apiBase,
}: RichDescriptionEditorProps) {
  const { t } = useTranslation();
  const { getJson } = useSecuredApi();

  // --- Locale state ---------------------------------------------------------
  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? 'en-US';
  const [selectedLocale, setSelectedLocale] = useState(defaultLocale);
  const [isTranslating, setIsTranslating] = useState(false);

  // --- Refs to avoid stale closures in Tiptap callbacks --------------------
  // Tiptap's onUpdate callback captures its dependencies at creation time.
  // Using refs lets us always read the latest values without recreating the editor.
  const valueRef    = useRef(value);
  const localeRef   = useRef(selectedLocale);
  const onChangeRef = useRef(onChange);

  useEffect(() => { valueRef.current    = value;          }, [value]);
  useEffect(() => { localeRef.current   = selectedLocale; }, [selectedLocale]);
  useEffect(() => { onChangeRef.current = onChange;       }, [onChange]);

  // --- Tiptap editor --------------------------------------------------------
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: t(
          'admin-products-description-placeholder',
          'Enter product description…'
        ),
      }),
    ],
    // Load initial content for the default locale
    content: getEditorContent(value, defaultLocale),
    onUpdate: ({ editor: e }) => {
      const html    = e.getHTML();
      const updated = mergeLocale(valueRef.current, localeRef.current, html);
      onChangeRef.current(updated);
    },
  });

  // Set RTL/LTR direction on the editor wrapper when locale changes
  const isRTL =
    availableLanguages.find((l) => l.code === selectedLocale)?.isRTL ?? false;

  // --- Locale switch --------------------------------------------------------
  const handleLocaleChange = useCallback(
    (locale: string) => {
      if (!editor) return;
      setSelectedLocale(locale);
      const currentValue = valueRef.current;
      const parsed       = parseDescription(currentValue);

      if (typeof parsed === 'string') {
        // Legacy plain HTML: show it as-is in the editor for any locale.
        // Migration to JSON happens automatically on the next keystroke.
        editor.commands.setContent(parsed, false);
      } else {
        // JSON: load the content for the new locale (with fallback)
        const content = getEditorContent(currentValue, locale);
        editor.commands.setContent(content, false);
      }
    },
    [editor]
  );

  // --- AI translation -------------------------------------------------------
  const handleAiTranslate = useCallback(async () => {
    if (!editor) return;
    setIsTranslating(true);
    try {
      // 1. Fetch AI configuration from the backend
      const params = await getJson<AiParams>(`${apiBase}v1/ai/parameters`);

      // 2. Find the best source content to translate FROM
      //    (first non-empty locale in the fallback chain, excluding current)
      const FALLBACK = ['en-US', 'fr-FR', 'es-ES', 'zh-CN', 'ar-SA', 'he-IL'];
      const currentValue = valueRef.current;
      const parsed       = parseDescription(currentValue);

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
        alert(t('admin-products-ai-no-source', 'No source content to translate from.'));
        return;
      }

      // 3. Call the AI API (OpenAI-compatible: Groq, OpenAI, etc.)
      const targetLangName =
        availableLanguages.find((l) => l.code === localeRef.current)?.nativeName ??
        localeRef.current;

      const resp = await fetch(`${params.url}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          messages: [
            {
              role: 'system',
              content:
                `You are a professional e-commerce copywriter. ` +
                `Translate the following HTML product description to ${targetLangName}. ` +
                `Preserve all HTML tags exactly. Return only the translated HTML, no extra text.`,
            },
            { role: 'user', content: sourceHtml },
          ],
        }),
      });

      if (!resp.ok) throw new Error(`AI API error: ${resp.status}`);

      const data        = await resp.json();
      const translated  = (data.choices?.[0]?.message?.content ?? '') as string;

      if (translated) {
        editor.commands.setContent(translated);
        // Trigger onChange manually because setContent does not fire onUpdate
        const updated = mergeLocale(valueRef.current, localeRef.current, translated);
        onChangeRef.current(updated);
      }
    } catch (err) {
      console.error('AI translation failed', err);
      alert(t('admin-products-ai-error', 'AI translation failed. Please try again.'));
    } finally {
      setIsTranslating(false);
    }
  }, [editor, apiBase, getJson, t]);

  if (!editor) return null;

  // Helper: returns "solid" if the format is active, "light" otherwise
  const v = (active: boolean) => (active ? 'solid' : 'light') as const;

  return (
    <div className="border rounded-lg overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-2 border-b bg-default-50 flex-wrap">

        {/* Language selector */}
        <Select
          size="sm"
          className="w-36"
          aria-label={t('admin-products-description-locale', 'Language')}
          selectedKeys={[selectedLocale]}
          onSelectionChange={(keys) =>
            handleLocaleChange(Array.from(keys).join(''))
          }
        >
          {availableLanguages.map((lang) => (
            <SelectItem key={lang.code}>{lang.nativeName}</SelectItem>
          ))}
        </Select>

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip content={t('admin-products-editor-bold', 'Bold')}>
          <Button isIconOnly size="sm" variant={v(editor.isActive('bold'))}
            onPress={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={t('admin-products-editor-italic', 'Italic')}>
          <Button isIconOnly size="sm" variant={v(editor.isActive('italic'))}
            onPress={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={t('admin-products-editor-h2', 'Heading 2')}>
          <Button isIconOnly size="sm"
            variant={v(editor.isActive('heading', { level: 2 }))}
            onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={t('admin-products-editor-h3', 'Heading 3')}>
          <Button isIconOnly size="sm"
            variant={v(editor.isActive('heading', { level: 3 }))}
            onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={t('admin-products-editor-ul', 'Bullet list')}>
          <Button isIconOnly size="sm" variant={v(editor.isActive('bulletList'))}
            onPress={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={t('admin-products-editor-ol', 'Ordered list')}>
          <Button isIconOnly size="sm" variant={v(editor.isActive('orderedList'))}
            onPress={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={14} />
          </Button>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip content={t('admin-products-editor-undo', 'Undo')}>
          <Button isIconOnly size="sm" variant="light"
            isDisabled={!editor.can().undo()}
            onPress={() => editor.chain().focus().undo().run()}>
            <Undo size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={t('admin-products-editor-redo', 'Redo')}>
          <Button isIconOnly size="sm" variant="light"
            isDisabled={!editor.can().redo()}
            onPress={() => editor.chain().focus().redo().run()}>
            <Redo size={14} />
          </Button>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        {/* AI translate button */}
        <Tooltip content={t('admin-products-editor-ai', 'Translate with AI')}>
          <Button
            size="sm" variant="light" color="secondary"
            isLoading={isTranslating}
            onPress={handleAiTranslate}
            startContent={!isTranslating ? <Sparkles size={14} /> : undefined}
          >
            {t('admin-products-editor-ai-btn', 'AI')}
          </Button>
        </Tooltip>
      </div>

      {/* ── Editor content area ────────────────────────────────────────── */}
      <div className="rich-editor-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

---

## Étape 4 — Mise à jour de `products.tsx`

**Fichier existant :** `apps/client/src/pages/admin/products.tsx`

### 4a — Ajouter l'import (après les imports existants)

```typescript
import { RichDescriptionEditor } from 'components/RichDescriptionEditor';
```

### 4b — Remplacer le textarea de description dans le modal

```tsx
// BEFORE
<div>
  <label className="block text-sm font-medium">
    {t('admin-products-modal-field-description')}
  </label>
  <textarea
    className="w-full px-3 py-2 border rounded"
    value={formDescription}
    onChange={(e) => setFormDescription(e.target.value)}
  />
</div>

// AFTER
<div>
  <label className="block text-sm font-medium mb-1">
    {t('admin-products-modal-field-description')}
  </label>
  <RichDescriptionEditor
    value={formDescription}
    onChange={setFormDescription}
    apiBase={apiBase}
  />
</div>
```

> `submitForm` et `openEdit` n'ont **pas besoin d'être modifiés** : ils utilisent déjà
> `formDescription` qui contient maintenant le JSON multilingue.

---

## Étape 5 — Types backend

**Fichier existant :** `apps/merchant/src/types.ts`

Ajouter à la fin du type `Env` existant, après `DATABASEPERMISSION` :

```typescript
/** Groq / OpenAI-compatible API key for product description AI translation. */
AI_API_KEY?: string;

/** Model name, e.g. "llama-3.3-70b-versatile" (Groq) or "gpt-4o-mini" (OpenAI). */
AI_MODEL?: string;

/** Base URL of the AI API — must NOT include a trailing slash.
 *  e.g. "https://api.groq.com/openai/v1"                        */
AI_API_URL?: string;

/* Permissions required to access the AI parameters route. */
AI_PERMISSION?: string; // e.g. "ai:api"
```

---

## Étape 6 — Nouvelle route backend

**Fichier à créer :** `apps/merchant/src/routes/ai.ts`

```typescript
// apps/merchant/src/routes/ai.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { ApiError, type HonoEnv } from '../types';

const app = new OpenAPIHono<HonoEnv>();
app.use('*', authMiddleware);

// Response schema
const AiParamsResponse = z.object({
  apiKey: z.string(),
  model:  z.string(),
  url:    z.string(),
});

const aiParamsRoute = createRoute({
  method:  'get',
  path:    '/parameters',
  tags:    ['AI'],
  summary: 'Retrieve AI configuration for the client',
  description:
    'Returns the API key, model and base URL for the AI provider. ' +
    'Requires adminstore permission. ' +
    'Values are set via GitHub secrets at deploy time.',
  security: [{ bearerAuth: ['ai:api'] }],
  middleware: [aiaccessOnly] as const,
  responses: {
    200: {
      content: { 'application/json': { schema: AiParamsResponse } },
      description: 'AI parameters',
    },
    503: {
      description: 'AI not configured on this instance',
    },
  },
});

app.openapi(aiParamsRoute, async (c) => {
  const apiKey = c.env.AI_API_KEY;
  const model  = c.env.AI_MODEL;
  const url    = c.env.AI_API_URL;

  // If any required value is missing, return 503 so the client can
  // hide the AI button gracefully instead of showing a cryptic error.
  if (!apiKey || !model || !url) {
    throw new ApiError(
      'not_configured',
      503,
      'AI is not configured. Set AI_API_KEY, AI_MODEL and AI_API_URL.'
    );
  }

  return c.json({ apiKey, model, url }, 200);
});

export { app as ai };
```

---

## Étape 7 — Enregistrement de la route

**Fichier existant :** `apps/merchant/src/index.ts`

### 7a — Ajouter l'import après les imports existants

```typescript
import { ai } from './routes/ai';
```

### 7b — Monter la route (après `app.route('v1/auth0', auth0Routes)`)

```typescript
app.route('v1/ai', ai);
```

---

## Étape 9 — Affichage storefront

Dans chaque composant qui affiche `product.description`
(ex. page produit, `ProductCard`) :

```tsx
// Add at the top of the file
import { resolveDescription } from 'utils/description';
import { useTranslation } from 'react-i18next';

// Inside the component function
const { i18n } = useTranslation();
const descriptionHtml = resolveDescription(
  product.description ?? '',
  i18n.language  // e.g. "fr-FR" — kept in sync by LanguageSwitch
);

// In the JSX
<div
  className="prose text-sm"
  dangerouslySetInnerHTML={{ __html: descriptionHtml }}
/>
```

> `i18n.language` est automatiquement synchronisé par le composant
> `LanguageSwitch` existant (via `i18n.changeLanguage()`).
> Aucune prop supplémentaire n'est nécessaire.

---

## Étape 10 — Clés i18n

**Fichier existant :** `apps/client/src/locales/base/en-US.json`

Ajouter dans l'objet JSON :

```json
"admin-products-description-locale":       "Language",
"admin-products-description-placeholder":  "Enter product description…",
"admin-products-editor-bold":              "Bold",
"admin-products-editor-italic":            "Italic",
"admin-products-editor-h2":               "Heading 2",
"admin-products-editor-h3":               "Heading 3",
"admin-products-editor-ul":               "Bullet list",
"admin-products-editor-ol":               "Ordered list",
"admin-products-editor-undo":             "Undo",
"admin-products-editor-redo":             "Redo",
"admin-products-editor-ai":               "Translate with AI",
"admin-products-editor-ai-btn":           "AI",
"admin-products-ai-no-source":            "No source content to translate from.",
"admin-products-ai-error":                "AI translation failed. Please try again."
```

Répliquer les mêmes clés dans `fr-FR.json`, `ar-SA.json`, etc. avec les traductions correspondantes.

---

## Récapitulatif des fichiers touchés

| Fichier | Action |
|---------|--------|
| `apps/client/src/utils/description.ts` | 🆕 Créer |
| `apps/client/src/components/RichDescriptionEditor.css` | 🆕 Créer |
| `apps/client/src/components/RichDescriptionEditor.tsx` | 🆕 Créer |
| `apps/client/src/pages/admin/products.tsx` | ✏️ 2 modifications |
| `apps/merchant/src/types.ts` | ✏️ 3 lignes ajoutées |
| `apps/merchant/src/routes/ai.ts` | 🆕 Créer |
| `apps/merchant/src/index.ts` | ✏️ 2 lignes ajoutées |
| `.github/workflows/deploy-cloudflare-worker.yaml` | ✏️ 3 steps ajoutés |
| `apps/client/src/locales/base/en-US.json` | ✏️ 14 clés ajoutées |
