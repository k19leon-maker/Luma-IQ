import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useGeneratedStore, type ProductDraft } from '../../store/generated.store';
import { useMaterialsStore, type ProjectMaterial } from '../../store/materials.store';
import { useProjectsStore } from '../../store/projects.store';
import { buildProductMaterial } from '../../utils/projectMaterials';
import s from './FileProductsEditor.module.css';

type ProductSource = 'material' | 'draft';
type ProductKind = 'product-main' | 'product-mini' | 'lead-magnet';

interface Product extends SplitItem {
  fullText: string;
  source: ProductSource;
  kind: ProductKind;
  material?: ProjectMaterial;
}

const EMPTY_MATERIALS: ProjectMaterial[] = [];

const PRODUCT_KIND_META: Record<ProductKind, { icon: string; title: string; meta: string }> = {
  'product-main': { icon: '🚀', title: 'Основной продукт', meta: 'Флагманская программа' },
  'product-mini': { icon: '⚡', title: 'Мини-продукт', meta: 'Интенсив / недорогой вход' },
  'lead-magnet': { icon: '🎁', title: 'Лид-магнит', meta: 'Бесплатный продукт' },
};

const DEMO_PRODUCT_PATTERNS = [
  /8\s+недель\s+к\s+близости/i,
  /5\s+фраз.*разрушают\s+доверие/i,
  /первый\s+шаг.*пар\s+в\s+кризис/i,
];

function cleanPreview(text: string): string {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max = 130): string {
  const clean = cleanPreview(text);
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function extractSection(content: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`(?:^|\\n)##\\s+${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function productNameFromContent(content: string): string {
  return extractSection(content, 'Название').split('\n').find(Boolean)?.trim() ?? '';
}

function isDemoProduct(content: string): boolean {
  return DEMO_PRODUCT_PATTERNS.some((pattern) => pattern.test(content));
}

function productFromMaterial(material: ProjectMaterial): Product | null {
  if (!['product-main', 'product-mini', 'lead-magnet'].includes(material.kind)) return null;
  if (!material.content.trim()) return null;
  if (isDemoProduct(material.content)) return null;

  const kind = material.kind as ProductKind;
  const meta = PRODUCT_KIND_META[kind];
  const productName = productNameFromContent(material.content);
  return {
    id: `material_${material.id}`,
    icon: meta.icon,
    title: meta.title,
    meta: productName || meta.meta,
    preview: truncate(material.summary || material.content),
    fullText: material.content,
    source: 'material',
    kind,
    material,
  };
}

function productFromDraft(kind: ProductKind, draft?: ProductDraft): Product | null {
  if (!draft) return null;
  const hasContent = [draft.name, draft.price, draft.format, draft.duration, draft.description]
    .some((value) => value.trim());
  if (!draft.generated && !hasContent) return null;

  const meta = PRODUCT_KIND_META[kind];
  const material = buildProductMaterial(kind, meta.title, draft);
  if (!material.content.trim()) return null;
  if (isDemoProduct(material.content)) return null;

  return {
    id: `draft_${kind}`,
    icon: meta.icon,
    title: meta.title,
    meta: draft.name || meta.meta,
    preview: truncate(material.summary || material.content),
    fullText: material.content,
    source: 'draft',
    kind,
  };
}

function linkedMaterialsForKind(kind: ProductKind): string[] {
  if (kind === 'product-main') {
    return ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md', 'product-mini.md', 'lead-magnet.md'];
  }
  if (kind === 'product-mini') {
    return ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md', 'product-main.md', 'lead-magnet.md'];
  }
  return ['expert-profile.md', 'positioning.md', 'audience.md', 'utp.md', 'product-mini.md', 'product-main.md'];
}

function ProductEditor({
  item,
  onSave,
}: {
  item: Product;
  onSave: (item: Product, text: string) => Promise<void>;
}) {
  const [text, setText] = useState(item.fullText);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(item.fullText);
    setCopied(false);
    setSaved(false);
  }, [item.id, item.fullText]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(item, text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [item, onSave, text]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.replace(/[^а-яёa-z0-9\s]/gi, '').trim() || 'product'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [text, item.title]);

  return (
    <div className={s.editor}>
      <div className={s.editorHeader}>
        <span className={s.editorIcon}>{item.icon}</span>
        <div>
          <div className={s.editorTitle}>{item.title}</div>
          <div className={s.editorMeta}>{item.meta}</div>
        </div>
      </div>

      <div className={s.editorBody}>
        <textarea
          className={s.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className={s.editorFooter}>
        <span className={s.charCount}>{text.length} символов</span>
        <div className={s.footerActions}>
          <button
            className={`${s.btn} ${s.btnSecondary}${copied ? ' ' + s.btnSuccess : ''}`}
            onClick={handleCopy}
          >
            {copied ? '✓ Скопировано' : 'Скопировать текст'}
          </button>
          <button
            className={`${s.btn} ${s.btnSecondary}${saved ? ' ' + s.btnSuccess : ''}`}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить изменения'}
          </button>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={handleDownload}>
            Скачать .txt
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FileProducts() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const projectMaterials = useMaterialsStore((s) => activeProjectId ? (s.projects[activeProjectId] ?? EMPTY_MATERIALS) : EMPTY_MATERIALS);
  const loadMaterialsFromDb = useMaterialsStore((s) => s.loadFromDb);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const generatedProject = useGeneratedStore((s) => activeProjectId ? s.projects[activeProjectId] : undefined);
  const loadGeneratedFromDb = useGeneratedStore((s) => s.loadFromDb);
  const saveProductMain = useGeneratedStore((s) => s.setProductMain);
  const saveProductMini = useGeneratedStore((s) => s.setProductMini);
  const saveLeadMagnet = useGeneratedStore((s) => s.setLeadMagnet);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;
    void loadMaterialsFromDb(activeProjectId);
    void loadGeneratedFromDb(activeProjectId);
  }, [activeProjectId, loadGeneratedFromDb, loadMaterialsFromDb]);

  const products = useMemo(() => {
    const materialProducts = projectMaterials
      .map(productFromMaterial)
      .filter((item): item is Product => Boolean(item));
    const materialKinds = new Set(materialProducts.map((item) => item.material?.kind));
    const draftProducts = [
      productFromDraft('product-main', generatedProject?.productMain),
      productFromDraft('product-mini', generatedProject?.productMini),
      productFromDraft('lead-magnet', generatedProject?.leadMagnet),
    ]
      .filter((item): item is Product => Boolean(item))
      .filter((item) => !materialKinds.has(item.kind));
    return [...materialProducts, ...draftProducts];
  }, [generatedProject, projectMaterials]);

  useEffect(() => {
    if (selectedId && products.some((item) => item.id === selectedId)) return;
    setSelectedId(products[0]?.id ?? null);
  }, [products, selectedId]);

  const handleSave = useCallback(async (item: Product, text: string) => {
    if (!activeProjectId) return;

    const meta = PRODUCT_KIND_META[item.kind];
    const currentDraft = item.kind === 'product-main'
      ? generatedProject?.productMain
      : item.kind === 'product-mini'
        ? generatedProject?.productMini
        : generatedProject?.leadMagnet;
    const title = productNameFromContent(text) || item.meta || currentDraft?.name || meta.title;
    const format = extractSection(text, 'Формат') || currentDraft?.format || meta.meta;
    const draft: ProductDraft = {
      ...(currentDraft ?? {
        price: item.kind === 'lead-magnet' ? 'Бесплатно' : '',
        duration: '',
      }),
      name: title,
      format,
      description: text,
      generated: true,
    };

    upsertMaterial(activeProjectId, {
      ...(item.material ?? {}),
      id: item.material?.id ?? `${item.kind}.md`,
      kind: item.kind,
      title: item.material?.title ?? `${item.kind}.md`,
      content: text,
      summary: truncate(text, 1200),
      summaryStatus: 'fresh',
      linkedMaterialIds: item.material?.linkedMaterialIds ?? linkedMaterialsForKind(item.kind),
    });
    if (item.kind === 'product-main') saveProductMain(activeProjectId, draft);
    if (item.kind === 'product-mini') saveProductMini(activeProjectId, draft);
    if (item.kind === 'lead-magnet') saveLeadMagnet(activeProjectId, draft);
    toast.success(`${meta.title} сохранен в материалах`);
  }, [activeProjectId, generatedProject, saveLeadMagnet, saveProductMain, saveProductMini, upsertMaterial]);

  if (products.length === 0) {
    return (
      <div className={s.emptyProducts}>
        <div className={s.emptyProductsTitle}>Продуктов пока нет</div>
        <div className={s.emptyProductsText}>
          Создайте основной продукт, мини-продукт или лид-магнит — после сохранения они появятся здесь.
        </div>
      </div>
    );
  }

  return (
    <SplitEditor
      items={products}
      selectedId={selectedId}
      onSelect={setSelectedId}
      listTitle="Продукты"
      renderEditor={(item) =>
        item ? (
          <ProductEditor item={item as Product} onSave={handleSave} />
        ) : null
      }
    />
  );
}
