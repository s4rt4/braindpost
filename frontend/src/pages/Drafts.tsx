import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Grid,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  TypographyStylesProvider,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  IconAlertTriangle,
  IconCheck,
  IconCloud,
  IconCloudCheck,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconLayoutColumns,
  IconLink,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconRocket,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconStar,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';

type DraftStatus = 'draft' | 'revisi' | 'siap_publish' | 'published';

type FeaturedImageMeta = {
  url?: string;
  alt?: string;
  photographer?: string;
  provider?: string;
  credit?: string;
};

type PublishingMeta = {
  category?: string;
  tags?: string[];
  keywords?: string[];
  slug?: string;
  meta_title?: string;
  meta_description?: string;
  featured_image?: FeaturedImageMeta;
};

type DraftListItem = {
  id: number;
  title: string;
  content_type: string;
  tone: string;
  status: DraftStatus;
  published_at: string | null;
  updated_at: string;
  published_url: string | null;
};

type Draft = DraftListItem & {
  content_md: string;
  notes: string;
  created_at: string;
  publishing_meta: PublishingMeta | null;
  laravel_post_id: number | null;
  published_at_blog: string | null;
};

type LaravelPublishStatus =
  | 'processing'
  | 'draft'
  | 'processing_failed'
  | 'scheduled'
  | 'published';

type PublishStatusResp = {
  laravel_post_id: number;
  status: LaravelPublishStatus;
  processing_error: string | null;
  admin_url: string | null;
  public_url: string | null;
  downloaded_images: number;
  total_images: number;
  updated_at: string | null;
};

const CONTENT_TYPES = [
  { value: 'panduan', label: 'Panduan / Step-by-step' },
  { value: 'tutorial', label: 'Tutorial Teknis' },
  { value: 'review', label: 'Review' },
  { value: 'tips', label: 'Tips & Trik' },
  { value: 'sejarah', label: 'Sejarah / Konteks' },
  { value: 'perbandingan', label: 'Perbandingan' },
  { value: 'listicle', label: 'Listicle' },
  { value: 'opini', label: 'Opini / Esai' },
  { value: 'studi-kasus', label: 'Studi Kasus' },
];

const TONES = [
  { value: 'hangat dan personal', label: 'Hangat & Personal' },
  { value: 'informatif dan edukatif', label: 'Informatif & Edukatif' },
  { value: 'casual dan santai', label: 'Casual & Santai' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'storytelling', label: 'Storytelling / Naratif' },
];

const STATUS_OPTIONS: { value: DraftStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'revisi', label: 'Revisi' },
  { value: 'siap_publish', label: 'Siap Publish' },
  { value: 'published', label: 'Published' },
];

const STATUS_COLOR: Record<DraftStatus, string> = {
  draft: 'gray',
  revisi: 'yellow',
  siap_publish: 'blue',
  published: 'green',
};

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: 'Draft',
  revisi: 'Revisi',
  siap_publish: 'Siap Publish',
  published: 'Published',
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'Semua' },
  ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
];

// === E-E-A-T Checklist (M1) ===
type EeeatItem = {
  key: string;
  label: string;
  hint: string;
  auto: boolean;
};

const EEEAT_ITEMS: EeeatItem[] = [
  {
    key: 'personal_story',
    label: 'Ada cerita / pengalaman personal',
    hint: 'Pastikan placeholder ⭐ "Dari Pengalaman Pribadi" sudah diisi cerita asli.',
    auto: false,
  },
  {
    key: 'external_sources',
    label: 'Ada sumber referensi eksternal',
    hint: 'Auto-detect dari pola [text](http...). Minimal 1 link otoritatif.',
    auto: true,
  },
  {
    key: 'author_byline',
    label: 'Author byline jelas',
    hint: 'Nama penulis muncul konsisten di artikel atau header blog.',
    auto: false,
  },
  {
    key: 'pub_date',
    label: 'Tanggal publikasi terlihat',
    hint: 'Pembaca harus bisa lihat tanggal — bukan cuma di metadata.',
    auto: false,
  },
  {
    key: 'human_readable',
    label: 'Ditulis untuk manusia, bukan SEO stuffing',
    hint: 'Baca keras-keras. Kalau kaku/repetitif, simplifikasi.',
    auto: false,
  },
];

function countExternalLinks(md: string): number {
  return (md.match(/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/g) || []).length;
}

const EEEAT_STORAGE_PREFIX = 'braindpost.eeeat.';

function loadEeeatState(draftId: number): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EEEAT_STORAGE_PREFIX + draftId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEeeatState(draftId: number, state: Record<string, boolean>) {
  try {
    localStorage.setItem(EEEAT_STORAGE_PREFIX + draftId, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

// === Editor metrics (M5 + #4) ===
type Metrics = {
  words: number;
  chars: number;
  sentences: number;
  avgWordsPerSentence: number;
  readingMinutes: number;
  flesch: number;
  fleschLabel: 'Mudah' | 'Cukup' | 'Sulit' | 'Kosong';
  fleschColor: string;
};

const EMPTY_METRICS: Metrics = {
  words: 0,
  chars: 0,
  sentences: 0,
  avgWordsPerSentence: 0,
  readingMinutes: 0,
  flesch: 0,
  fleschLabel: 'Kosong',
  fleschColor: 'gray',
};

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[.*?\]\(.*?\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ');
}

function countSyllables(word: string): number {
  // Approx: 1 syllable per vowel-group (a/i/u/e/o cluster).
  // Cukup akurat untuk tren, bukan exact untuk Bahasa Indonesia.
  const matches = word.toLowerCase().match(/[aiueo]+/g);
  return Math.max(1, matches?.length || 0);
}

function computeMetrics(md: string): Metrics {
  const text = stripMarkdown(md).trim();
  if (!text) return EMPTY_METRICS;

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  if (wordCount === 0) return EMPTY_METRICS;

  const chars = text.length;
  const sentences =
    text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length || 1;
  const avgWPS = wordCount / sentences;

  const totalSyllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const flesch = Math.round(
    206.835 - 1.015 * avgWPS - 84.6 * (totalSyllables / wordCount),
  );

  let label: Metrics['fleschLabel'];
  let color: string;
  if (flesch >= 60) {
    label = 'Mudah';
    color = 'green';
  } else if (flesch >= 30) {
    label = 'Cukup';
    color = 'yellow';
  } else {
    label = 'Sulit';
    color = 'red';
  }

  return {
    words: wordCount,
    chars,
    sentences,
    avgWordsPerSentence: Math.round(avgWPS * 10) / 10,
    readingMinutes: Math.max(1, Math.round(wordCount / 200)),
    flesch,
    fleschLabel: label,
    fleschColor: color,
  };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Drafts() {
  const [list, setList] = useState<DraftListItem[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [mode, setMode] = useState<'new' | 'edit'>('new');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // form fields (used in both 'new' and 'edit' for metadata)
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState(CONTENT_TYPES[0].value);
  const [tone, setTone] = useState(TONES[0].value);
  const [notes, setNotes] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [status, setStatus] = useState<DraftStatus>('draft');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eeeatState, setEeeatState] = useState<Record<string, boolean>>({});
  const [publishingMeta, setPublishingMeta] = useState<PublishingMeta>({});

  function patchPublishingMeta(patch: Partial<PublishingMeta>) {
    setPublishingMeta((prev) => ({ ...prev, ...patch }));
  }

  // Auto-save (M6)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const lastSavedSigRef = useRef<string>('');

  // Markdown preview view mode (#3)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');

  // M2 — YMYL policy check
  const [policyOpened, { open: openPolicy, close: closePolicy }] = useDisclosure(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyResult, setPolicyResult] = useState<{
    patterns: Array<{
      category: string;
      excerpt: string;
      note: string;
      suggested_disclaimer: string;
    }>;
    summary: string;
  } | null>(null);

  // M4 — Internal link suggestions
  const [linksOpened, { open: openLinks, close: closeLinks }] = useDisclosure(false);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState<
    Array<{
      draft_id: number;
      title: string;
      score: number;
      suggested_anchor: string;
      slug: string;
    }>
  >([]);

  // #8 — SEO snippet
  const [seoOpened, { open: openSeo, close: closeSeo }] = useDisclosure(false);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoResult, setSeoResult] = useState<{
    meta_title: string;
    meta_description: string;
    slug: string;
    keywords: string[];
  } | null>(null);

  // Bonus — Featured image picker
  const [imgPickerOpened, { open: openImgPicker, close: closeImgPicker }] = useDisclosure(false);
  const [imgQuery, setImgQuery] = useState('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgResults, setImgResults] = useState<
    Array<{
      id: string;
      provider: string;
      url: string;
      thumb: string;
      photographer: string;
      alt: string;
    }>
  >([]);

  // Publishing — Laravel autopost
  const [publishOpened, { open: openPublish, close: closePublish }] = useDisclosure(false);
  const [publishStage, setPublishStage] = useState<'preflight' | 'progress'>('preflight');
  const [publishForceFlag, setPublishForceFlag] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatusResp | null>(null);
  const [publishFieldsInfo, setPublishFieldsInfo] = useState<{
    updated: string[];
    preserved: string[];
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [forceConfirmOpened, { open: openForceConfirm, close: closeForceConfirm }] =
    useDisclosure(false);
  const [forceConfirmAdminUrl, setForceConfirmAdminUrl] = useState<string | null>(null);
  const pollAbortRef = useRef<boolean>(false);

  // ===== Handlers =====

  async function runPolicyCheck() {
    if (!selected) return;
    openPolicy();
    setPolicyLoading(true);
    setPolicyResult(null);
    try {
      const data = await apiPost<typeof policyResult>(
        `/drafts/${selected.id}/policy-check`,
        {},
      );
      setPolicyResult(data);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Policy check gagal',
        message: e instanceof Error ? e.message : 'unknown',
      });
      closePolicy();
    } finally {
      setPolicyLoading(false);
    }
  }

  async function runLinkSuggestions() {
    if (!selected) return;
    openLinks();
    setLinksLoading(true);
    try {
      const data = await apiGet<{ suggestions: typeof linkSuggestions }>(
        `/drafts/${selected.id}/link-suggestions?limit=8`,
      );
      setLinkSuggestions(data.suggestions);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Saran link gagal',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setLinksLoading(false);
    }
  }

  async function runSeoGen() {
    if (!selected) return;
    openSeo();
    setSeoLoading(true);
    setSeoResult(null);
    try {
      const data = await apiPost<typeof seoResult>(
        `/drafts/${selected.id}/seo`,
        {},
      );
      setSeoResult(data);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Generate SEO gagal',
        message: e instanceof Error ? e.message : 'unknown',
      });
      closeSeo();
    } finally {
      setSeoLoading(false);
    }
  }

  function exportMarkdown() {
    if (!contentMd.trim()) {
      notifications.show({ color: 'yellow', message: 'Konten kosong.' });
      return;
    }
    const front = `---\ntitle: ${title}\nstatus: ${status}\ncontent_type: ${contentType}\ntone: ${tone}\nupdated_at: ${
      selected?.updated_at ?? new Date().toISOString()
    }\n---\n\n# ${title}\n\n`;
    const body = front + contentMd;
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const slug =
      title
        .replace(/[^a-z0-9]+/gi, '-')
        .toLowerCase()
        .replace(/^-+|-+$/g, '') || `draft-${selected?.id ?? 'baru'}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notifications.show({ color: 'teal', message: `Exported: ${slug}.md` });
  }

  async function searchImages(query?: string) {
    const q = (query ?? imgQuery).trim();
    if (!q) {
      notifications.show({ color: 'yellow', message: 'Ketik kata kunci dulu.' });
      return;
    }
    setImgLoading(true);
    try {
      const data = await apiGet<{ results: typeof imgResults }>(
        `/images/search?q=${encodeURIComponent(q)}&provider=all&page=1&per_page=12`,
      );
      setImgResults(data.results);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Cari gambar gagal',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setImgLoading(false);
    }
  }

  function insertImage(item: (typeof imgResults)[number]) {
    const altText = item.alt || `Foto oleh ${item.photographer} via ${item.provider}`;
    const imgMd = `\n\n![${altText}](${item.url})\n*Foto: ${item.photographer} via ${item.provider}*\n\n`;
    setContentMd(contentMd + imgMd);
    notifications.show({
      color: 'teal',
      message: `Gambar dari ${item.photographer} disisipkan di akhir konten.`,
    });
    closeImgPicker();
  }

  function setAsFeatured(item: (typeof imgResults)[number]) {
    const providerLabel =
      item.provider.charAt(0).toUpperCase() + item.provider.slice(1);
    const credit = `Foto: ${item.photographer || 'Unknown'} via ${providerLabel}`;
    patchPublishingMeta({
      featured_image: {
        url: item.url,
        alt: item.alt || `Foto oleh ${item.photographer || 'Unknown'}`,
        photographer: item.photographer,
        provider: item.provider,
        credit,
      },
    });
    notifications.show({
      color: 'orange',
      icon: <IconStar size={16} />,
      message: `Featured image diset: foto oleh ${item.photographer || 'Unknown'}.`,
    });
    closeImgPicker();
  }

  function removeFeatured() {
    patchPublishingMeta({ featured_image: undefined });
    notifications.show({
      color: 'gray',
      message: 'Featured image dilepas.',
    });
  }

  function insertLinkAtEnd(suggestion: (typeof linkSuggestions)[number]) {
    const linkMd = ` [${suggestion.suggested_anchor}](/${suggestion.slug})`;
    setContentMd(contentMd + linkMd);
    notifications.show({
      color: 'teal',
      message: `Link "${suggestion.title}" disisipkan di akhir konten.`,
    });
  }

  function saveSeoToMeta() {
    if (!seoResult) return;
    patchPublishingMeta({
      meta_title: seoResult.meta_title,
      meta_description: seoResult.meta_description,
      slug: seoResult.slug,
      keywords: seoResult.keywords,
    });
    notifications.show({
      color: 'teal',
      icon: <IconCheck size={16} />,
      message: 'SEO snippet tersimpan ke draft. Akan dipakai saat publish.',
    });
    closeSeo();
  }

  // ===== Publishing — Laravel autopost =====

  async function pollPublishStatus(draftId: number) {
    // Exponential backoff: 3s, 5s, 8s, 13s, 20s, 30s — max ~80s total
    const intervals = [3000, 5000, 8000, 13000, 20000, 30000];
    pollAbortRef.current = false;
    for (const ms of intervals) {
      if (pollAbortRef.current) return;
      await new Promise((r) => setTimeout(r, ms));
      if (pollAbortRef.current) return;
      try {
        const data = await apiGet<PublishStatusResp>(
          `/drafts/${draftId}/publish-status`,
        );
        setPublishStatus(data);
        if (data.status !== 'processing') {
          // refresh draft list & current draft (kalau status published, BE sudah set published_url)
          await fetchList();
          if (selected?.id === draftId) {
            try {
              const refreshed = await apiGet<Draft>(`/drafts/${draftId}`);
              setSelected(refreshed);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      } catch (e) {
        setPublishError(e instanceof Error ? e.message : 'Polling gagal');
        return;
      }
    }
    // Timeout — biarin user lihat last status
  }

  function startPublishFlow(force = false) {
    if (!selected) return;
    setPublishForceFlag(force);
    setPublishStage('preflight');
    setPublishStatus(null);
    setPublishFieldsInfo(null);
    setPublishError(null);
    openPublish();
  }

  async function confirmPublish() {
    setPublishStage('progress');
    return publishToBlog(publishForceFlag);
  }

  async function publishToBlog(force = false) {
    if (!selected) return;
    setPublishLoading(true);
    setPublishStatus(null);
    setPublishFieldsInfo(null);
    setPublishError(null);
    try {
      const resp = await apiPost<{
        laravel_post_id: number;
        status: LaravelPublishStatus;
        admin_url: string;
        public_url: string | null;
        updated_fields: string[];
        preserved_fields: string[];
      }>(`/drafts/${selected.id}/publish`, { force });

      setPublishStatus({
        laravel_post_id: resp.laravel_post_id,
        status: resp.status,
        processing_error: null,
        admin_url: resp.admin_url,
        public_url: resp.public_url,
        downloaded_images: 0,
        total_images: 0,
        updated_at: null,
      });
      setPublishFieldsInfo({
        updated: resp.updated_fields ?? [],
        preserved: resp.preserved_fields ?? [],
      });

      // Refresh draft (BE sudah simpan laravel_post_id)
      try {
        const refreshed = await apiGet<Draft>(`/drafts/${selected.id}`);
        setSelected(refreshed);
      } catch {
        /* ignore */
      }

      // Selalu polling — even kalau status awal sudah draft (sync queue mode)
      // sesuai BLOG_INTEGRATION.md section 13.4
      if (resp.status === 'processing') {
        pollPublishStatus(selected.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish gagal';
      // Detect 409 conflict — extract admin_url
      if (msg.includes('409')) {
        // detail comes back as JSON-stringified dict from FastAPI HTTPException
        try {
          const match = msg.match(/admin_url[^a-zA-Z]+([^"',}]+)/);
          if (match) setForceConfirmAdminUrl(match[1]);
        } catch {
          /* ignore */
        }
        closePublish();
        openForceConfirm();
      } else {
        setPublishError(msg);
      }
    } finally {
      setPublishLoading(false);
    }
  }

  function cancelPolling() {
    pollAbortRef.current = true;
  }

  function computeSig(values: {
    title: string;
    content_md: string;
    content_type: string;
    tone: string;
    notes: string;
    status: string;
    publishing_meta: PublishingMeta;
  }): string {
    return JSON.stringify({
      t: values.title,
      c: values.content_md,
      ct: values.content_type,
      tn: values.tone,
      n: values.notes,
      s: values.status,
      pm: values.publishing_meta,
    });
  }

  /** Catat baseline setelah save sukses (manual / auto / generate / open). */
  function recordSaveBaseline(d: Draft) {
    lastSavedSigRef.current = computeSig({
      title: d.title,
      content_md: d.content_md,
      content_type: d.content_type,
      tone: d.tone,
      notes: d.notes,
      status: d.status,
      publishing_meta: d.publishing_meta ?? {},
    });
    setLastSavedAt(new Date(d.updated_at));
  }

  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  async function fetchList() {
    setLoadingList(true);
    try {
      const data = await apiGet<DraftListItem[]>('/drafts');
      setList(data);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal load draft',
        message: e instanceof Error ? e.message : 'unknown error',
      });
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  // Receive incoming title from /ideas (handoff via React Router state)
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const incomingTitle = (location.state as { title?: string } | null)?.title;
    if (incomingTitle) {
      setMode('new');
      setSelected(null);
      setTitle(incomingTitle);
      setContentType(CONTENT_TYPES[0].value);
      setTone(TONES[0].value);
      setNotes('');
      setContentMd('');
      setStatus('draft');
      setEeeatState({});
      // Clear state supaya refresh tidak re-trigger
      navigate(location.pathname, { replace: true });
      notifications.show({
        color: 'teal',
        message: `Judul terisi: "${incomingTitle.slice(0, 60)}${
          incomingTitle.length > 60 ? '…' : ''
        }"`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function newDraft() {
    setMode('new');
    setSelected(null);
    setTitle('');
    setContentType(CONTENT_TYPES[0].value);
    setTone(TONES[0].value);
    setNotes('');
    setContentMd('');
    setStatus('draft');
    setEeeatState({});
    setPublishingMeta({});
    lastSavedSigRef.current = '';
    setLastSavedAt(null);
  }

  // Debounced auto-save: trigger PUT silent kalau ada perubahan stuttert > 3s
  const currentSig = computeSig({
    title,
    content_md: contentMd,
    content_type: contentType,
    tone,
    notes,
    status,
    publishing_meta: publishingMeta,
  });
  const [debouncedSig] = useDebouncedValue(currentSig, 3000);

  useEffect(() => {
    if (mode !== 'edit' || !selected) return;
    if (!lastSavedSigRef.current) return; // belum ada baseline
    if (debouncedSig === lastSavedSigRef.current) return; // unchanged
    if (saving || autoSaving) return; // skip kalau ada save lain in-flight

    const draftId = selected.id;
    setAutoSaving(true);
    apiPut<Draft>(`/drafts/${draftId}`, {
      title,
      content_md: contentMd,
      content_type: contentType,
      tone,
      notes,
      status,
      publishing_meta: publishingMeta,
    })
      .then((d) => {
        // Pastikan masih di draft yang sama (user bisa pindah selama in-flight)
        if (selected?.id !== draftId) return;
        setSelected(d);
        recordSaveBaseline(d);
        fetchList();
      })
      .catch(() => {
        /* silent fail — manual save tetap available */
      })
      .finally(() => {
        setAutoSaving(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSig]);

  function toggleEeeat(key: string) {
    if (!selected) return;
    const next = { ...eeeatState, [key]: !eeeatState[key] };
    setEeeatState(next);
    saveEeeatState(selected.id, next);
  }

  async function openDraft(id: number) {
    setLoadingDraft(true);
    try {
      const d = await apiGet<Draft>(`/drafts/${id}`);
      setSelected(d);
      setMode('edit');
      setTitle(d.title);
      setContentType(d.content_type);
      setTone(d.tone);
      setNotes(d.notes);
      setContentMd(d.content_md);
      setStatus(d.status);
      setEeeatState(loadEeeatState(d.id));
      setPublishingMeta(d.publishing_meta ?? {});
      recordSaveBaseline(d);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal buka draft',
        message: e instanceof Error ? e.message : 'unknown error',
      });
    } finally {
      setLoadingDraft(false);
    }
  }

  async function generateDraft() {
    if (!title.trim()) {
      notifications.show({ color: 'yellow', message: 'Isi judul dulu.' });
      return;
    }
    setGenerating(true);
    try {
      const d = await apiPost<Draft>('/drafts/generate', {
        title,
        content_type: contentType,
        tone,
        notes,
      });
      setSelected(d);
      setMode('edit');
      setContentMd(d.content_md);
      setStatus(d.status);
      setEeeatState(loadEeeatState(d.id));
      setPublishingMeta(d.publishing_meta ?? {});
      recordSaveBaseline(d);
      await fetchList();
      notifications.show({
        color: 'teal',
        icon: <IconCheck size={16} />,
        message: 'Draft berhasil dibuat.',
      });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal generate',
        message: e instanceof Error ? e.message : 'unknown error',
      });
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    if (!selected) return;
    setSaving(true);
    try {
      const d = await apiPut<Draft>(`/drafts/${selected.id}`, {
        title,
        content_md: contentMd,
        content_type: contentType,
        tone,
        notes,
        status,
        publishing_meta: publishingMeta,
      });
      setSelected(d);
      recordSaveBaseline(d);
      await fetchList();
      notifications.show({
        color: 'teal',
        icon: <IconCheck size={16} />,
        message: 'Draft tersimpan.',
      });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal simpan',
        message: e instanceof Error ? e.message : 'unknown error',
      });
    } finally {
      setSaving(false);
    }
  }

  function askDelete(id: number) {
    setPendingDeleteId(id);
    openDelete();
  }

  async function confirmDelete() {
    if (pendingDeleteId == null) return;
    try {
      await apiDelete(`/drafts/${pendingDeleteId}`);
      try {
        localStorage.removeItem(EEEAT_STORAGE_PREFIX + pendingDeleteId);
      } catch {
        /* ignore */
      }
      if (selected?.id === pendingDeleteId) newDraft();
      await fetchList();
      notifications.show({ color: 'teal', message: 'Draft dihapus.' });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal hapus',
        message: e instanceof Error ? e.message : 'unknown error',
      });
    } finally {
      closeDelete();
      setPendingDeleteId(null);
    }
  }

  const filteredList =
    statusFilter === 'all'
      ? list
      : list.filter((d) => d.status === statusFilter);

  const metrics = useMemo(() => computeMetrics(contentMd), [contentMd]);

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Draft</Title>
        <Text c="dimmed" size="sm">
          AI bantu draft awal — kamu poles dengan cerita dan pengalaman nyata.
        </Text>
      </div>

      <Grid gutter="md">
        {/* LIST PANEL */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder shadow="xs" radius="md" p="sm">
            <Group justify="space-between" mb="sm">
              <Text fw={600} size="sm">
                Tersimpan ({list.length})
              </Text>
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={newDraft}
                variant={mode === 'new' ? 'filled' : 'light'}
              >
                Baru
              </Button>
            </Group>

            <SegmentedControl
              fullWidth
              size="xs"
              value={statusFilter}
              onChange={setStatusFilter}
              data={FILTER_OPTIONS}
              mb="sm"
            />

            <ScrollArea h={490} type="auto">
              {loadingList ? (
                <Group justify="center" p="md">
                  <Loader size="sm" />
                </Group>
              ) : list.length === 0 ? (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  Belum ada draft.
                </Text>
              ) : filteredList.length === 0 ? (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  Tidak ada draft dengan status &quot;{STATUS_LABEL[statusFilter as DraftStatus]}&quot;.
                </Text>
              ) : (
                <Stack gap="xs">
                  {filteredList.map((d) => (
                    <Card
                      key={d.id}
                      withBorder
                      padding="xs"
                      radius="sm"
                      style={{
                        cursor: 'pointer',
                        borderColor:
                          selected?.id === d.id
                            ? 'var(--mantine-color-orange-filled)'
                            : undefined,
                        background:
                          selected?.id === d.id
                            ? 'var(--mantine-color-orange-light)'
                            : undefined,
                      }}
                      onClick={() => openDraft(d.id)}
                    >
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={500} lineClamp={2}>
                            {d.title}
                          </Text>
                          <Group gap={6} mt={4}>
                            <Badge
                              size="xs"
                              variant="light"
                              color={STATUS_COLOR[d.status]}
                            >
                              {STATUS_LABEL[d.status]}
                            </Badge>
                            <Badge size="xs" variant="light" color="orange">
                              {d.content_type}
                            </Badge>
                            <Text size="xs" c="dimmed">
                              {formatDate(d.updated_at)}
                            </Text>
                          </Group>
                        </div>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            askDelete(d.id);
                          }}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              )}
            </ScrollArea>
          </Card>
        </Grid.Col>

        {/* EDITOR PANEL */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card withBorder shadow="xs" radius="md">
            {loadingDraft ? (
              <Group justify="center" p="xl">
                <Loader />
              </Group>
            ) : (
              <Stack gap="md">
                <Group justify="space-between">
                  <Text fw={600} size="sm" c="dimmed">
                    {mode === 'new' ? 'DRAFT BARU' : `EDIT DRAFT #${selected?.id}`}
                  </Text>
                  {mode === 'edit' && selected && (
                    <Group gap="xs">
                      {autoSaving ? (
                        <Group gap={4}>
                          <Loader size={12} />
                          <Text size="xs" c="dimmed">
                            Menyimpan...
                          </Text>
                        </Group>
                      ) : lastSavedAt ? (
                        <Tooltip
                          label={`Auto-save aktif (debounced 3 detik). Manual save: tombol "Simpan" di bawah.`}
                        >
                          <Group gap={4} style={{ cursor: 'help' }}>
                            <IconCloudCheck
                              size={14}
                              color="var(--mantine-color-green-6)"
                            />
                            <Text size="xs" c="dimmed">
                              Tersimpan{' '}
                              {lastSavedAt.toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          </Group>
                        </Tooltip>
                      ) : (
                        <Group gap={4}>
                          <IconCloud size={14} color="var(--mantine-color-gray-5)" />
                          <Text size="xs" c="dimmed">
                            Belum ada perubahan
                          </Text>
                        </Group>
                      )}
                    </Group>
                  )}
                </Group>

                <TextInput
                  label="Judul"
                  placeholder="Judul artikel..."
                  value={title}
                  onChange={(e) => setTitle(e.currentTarget.value)}
                />

                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label="Jenis Konten"
                      data={CONTENT_TYPES}
                      value={contentType}
                      onChange={(v) => setContentType(v ?? CONTENT_TYPES[0].value)}
                      allowDeselect={false}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label="Tone"
                      data={TONES}
                      value={tone}
                      onChange={(v) => setTone(v ?? TONES[0].value)}
                      allowDeselect={false}
                    />
                  </Grid.Col>
                </Grid>

                <Textarea
                  label="Catatan / poin khusus (opsional)"
                  placeholder="mis: fokus untuk pemula, sertakan contoh kasus nyata..."
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                  autosize
                  minRows={2}
                  maxRows={4}
                />

                {mode === 'edit' && (
                  <Select
                    label="Status"
                    data={STATUS_OPTIONS}
                    value={status}
                    onChange={(v) => v && setStatus(v as DraftStatus)}
                    allowDeselect={false}
                    leftSection={
                      <Badge
                        size="xs"
                        variant="filled"
                        color={STATUS_COLOR[status]}
                        circle
                      >
                        {' '}
                      </Badge>
                    }
                  />
                )}

                {/* Publishing metadata: category + tags + featured image (untuk Laravel autopost) */}
                {mode === 'edit' && (
                  <Card
                    withBorder
                    radius="md"
                    p="sm"
                    bg="var(--mantine-color-default-hover)"
                  >
                    <Group gap="xs" mb="sm">
                      <IconRocket size={14} />
                      <Text size="sm" fw={600}>
                        Publishing Metadata
                      </Text>
                      <Text size="xs" c="dimmed">
                        (untuk autopost ke Laravel blog)
                      </Text>
                    </Group>

                    <Stack gap="sm">
                      <Grid>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <TextInput
                            label="Kategori"
                            placeholder="mis: Tech, Lifestyle, Bisnis"
                            value={publishingMeta.category ?? ''}
                            onChange={(e) =>
                              patchPublishingMeta({ category: e.currentTarget.value })
                            }
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <TagsInput
                            label="Tags"
                            placeholder="Ketik tag, Enter untuk tambah"
                            value={publishingMeta.tags ?? []}
                            onChange={(v) => patchPublishingMeta({ tags: v })}
                            clearable
                          />
                        </Grid.Col>
                      </Grid>

                      {/* Featured image preview */}
                      <div>
                        <Text size="xs" fw={500} mb={4}>
                          Featured Image
                        </Text>
                        {publishingMeta.featured_image?.url ? (
                          <Card withBorder p="xs">
                            <Group gap="md" wrap="nowrap" align="flex-start">
                              <img
                                src={publishingMeta.featured_image.url}
                                alt={publishingMeta.featured_image.alt}
                                style={{
                                  width: 80,
                                  height: 60,
                                  objectFit: 'cover',
                                  borderRadius: 4,
                                  flexShrink: 0,
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Group gap={4} mb={2}>
                                  <IconStar size={12} color="var(--mantine-color-orange-6)" />
                                  <Badge size="xs" variant="filled" color="orange">
                                    FEATURED
                                  </Badge>
                                </Group>
                                <Text size="xs" lineClamp={1}>
                                  {publishingMeta.featured_image.alt || '(no alt)'}
                                </Text>
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {publishingMeta.featured_image.credit}
                                </Text>
                              </div>
                              <Tooltip label="Lepas featured image">
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  size="sm"
                                  onClick={removeFeatured}
                                >
                                  <IconX size={14} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Card>
                        ) : (
                          <Text size="xs" c="dimmed" fs="italic">
                            Belum ada — pakai tombol{' '}
                            <Badge
                              size="xs"
                              color="orange"
                              variant="light"
                              leftSection={<IconStar size={10} />}
                            >
                              Featured
                            </Badge>{' '}
                            di Image Picker (Pre-publish Toolkit) untuk set.
                          </Text>
                        )}
                      </div>

                      {/* SEO snippet status */}
                      {(publishingMeta.meta_title || publishingMeta.slug) && (
                        <Card withBorder p="xs">
                          <Group gap="xs" mb={4}>
                            <IconSearch size={12} />
                            <Text size="xs" fw={600}>
                              SEO Snippet tersimpan
                            </Text>
                          </Group>
                          {publishingMeta.meta_title && (
                            <Text size="xs" lineClamp={1}>
                              <b>Title:</b> {publishingMeta.meta_title}
                            </Text>
                          )}
                          {publishingMeta.meta_description && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {publishingMeta.meta_description}
                            </Text>
                          )}
                          {publishingMeta.slug && (
                            <Text size="xs" c="dimmed">
                              <b>Slug:</b> /{publishingMeta.slug}
                            </Text>
                          )}
                        </Card>
                      )}
                    </Stack>
                  </Card>
                )}

                {mode === 'new' ? (
                  <>
                    <Alert color="yellow" variant="light">
                      Draft ini titik awal. Tambahkan cerita pribadi & pengalaman nyata
                      sebelum publish.
                    </Alert>
                    <Button
                      onClick={generateDraft}
                      loading={generating}
                      leftSection={<IconSparkles size={16} />}
                      maw={220}
                    >
                      Generate Draft
                    </Button>
                  </>
                ) : (
                  <>
                    <Group justify="space-between" wrap="wrap" gap="xs">
                      <Group gap="md" wrap="wrap">
                        <Text size="sm" fw={500}>
                          Konten (Markdown)
                        </Text>
                        <SegmentedControl
                          size="xs"
                          value={viewMode}
                          onChange={(v) => setViewMode(v as typeof viewMode)}
                          data={[
                            {
                              value: 'edit',
                              label: (
                                <Group gap={4} wrap="nowrap">
                                  <IconPencil size={12} />
                                  <span>Edit</span>
                                </Group>
                              ),
                            },
                            {
                              value: 'preview',
                              label: (
                                <Group gap={4} wrap="nowrap">
                                  <IconEye size={12} />
                                  <span>Preview</span>
                                </Group>
                              ),
                            },
                            {
                              value: 'split',
                              label: (
                                <Group gap={4} wrap="nowrap">
                                  <IconLayoutColumns size={12} />
                                  <span>Split</span>
                                </Group>
                              ),
                            },
                          ]}
                        />
                      </Group>
                      <CopyButton value={contentMd} timeout={1500}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Tersalin!' : 'Copy markdown'}>
                            <ActionIcon variant="subtle" onClick={copy}>
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>

                    {/* Editor metrics toolbar (M5 + #4) */}
                    <Group gap="xs" wrap="wrap">
                      <Tooltip label="Jumlah kata (markdown markup distrip)">
                        <Badge variant="light" color="gray" size="sm">
                          📝 {metrics.words.toLocaleString('id-ID')} kata
                        </Badge>
                      </Tooltip>
                      <Tooltip label={`${metrics.chars.toLocaleString('id-ID')} karakter total`}>
                        <Badge variant="light" color="gray" size="sm">
                          {metrics.chars.toLocaleString('id-ID')} chr
                        </Badge>
                      </Tooltip>
                      <Tooltip label="Estimasi waktu baca (200 kata/menit)">
                        <Badge variant="light" color="gray" size="sm">
                          ⏱️ {metrics.readingMinutes} mnt
                        </Badge>
                      </Tooltip>
                      <Tooltip label="Rata-rata kata per kalimat (target < 20 untuk readability)">
                        <Badge
                          variant="light"
                          color={
                            metrics.avgWordsPerSentence === 0
                              ? 'gray'
                              : metrics.avgWordsPerSentence <= 20
                                ? 'green'
                                : metrics.avgWordsPerSentence <= 28
                                  ? 'yellow'
                                  : 'red'
                          }
                          size="sm"
                        >
                          📏 {metrics.avgWordsPerSentence} kata/kalimat
                        </Badge>
                      </Tooltip>
                      <Tooltip
                        label={`Flesch Reading Ease: ${metrics.flesch}. ≥60 mudah · 30-60 cukup · <30 sulit. (Heuristik approx untuk Bahasa Indonesia)`}
                      >
                        <Badge
                          variant="light"
                          color={metrics.fleschColor}
                          size="sm"
                        >
                          📊 {metrics.flesch} {metrics.fleschLabel}
                        </Badge>
                      </Tooltip>
                    </Group>

                    {(() => {
                      const editorPane = (
                        <Textarea
                          value={contentMd}
                          onChange={(e) => setContentMd(e.currentTarget.value)}
                          autosize
                          minRows={18}
                          maxRows={40}
                          styles={{
                            input: {
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              fontSize: 13,
                              lineHeight: 1.6,
                            },
                          }}
                        />
                      );
                      const previewPane = (
                        <Paper
                          withBorder
                          p="md"
                          radius="sm"
                          mih={420}
                          style={{ overflowY: 'auto', maxHeight: 720 }}
                        >
                          {contentMd.trim() ? (
                            <TypographyStylesProvider>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {contentMd}
                              </ReactMarkdown>
                            </TypographyStylesProvider>
                          ) : (
                            <Text c="dimmed" size="sm" ta="center" py="xl">
                              Konten kosong — tulis di mode Edit atau Split.
                            </Text>
                          )}
                        </Paper>
                      );

                      if (viewMode === 'edit') return editorPane;
                      if (viewMode === 'preview') return previewPane;
                      return (
                        <Grid gutter="sm">
                          <Grid.Col span={{ base: 12, md: 6 }}>{editorPane}</Grid.Col>
                          <Grid.Col span={{ base: 12, md: 6 }}>{previewPane}</Grid.Col>
                        </Grid>
                      );
                    })()}

                    {/* E-E-A-T Checklist (M1) */}
                    {(() => {
                      const externalLinkCount = countExternalLinks(contentMd);
                      const effectiveState: Record<string, boolean> = {
                        ...eeeatState,
                        external_sources: externalLinkCount > 0,
                      };
                      const checkedCount = EEEAT_ITEMS.filter(
                        (i) => effectiveState[i.key],
                      ).length;
                      const allChecked = checkedCount === EEEAT_ITEMS.length;
                      return (
                        <Card
                          withBorder
                          radius="md"
                          p="md"
                          bg={
                            allChecked
                              ? 'var(--mantine-color-green-light)'
                              : 'var(--mantine-color-default-hover)'
                          }
                        >
                          <Group justify="space-between" mb="xs">
                            <Group gap="xs">
                              <Text fw={600} size="sm">
                                E-E-A-T Checklist
                              </Text>
                              <Text size="xs" c="dimmed">
                                (Experience · Expertise · Authoritativeness · Trust)
                              </Text>
                            </Group>
                            <Badge
                              color={allChecked ? 'green' : 'gray'}
                              variant={allChecked ? 'filled' : 'light'}
                            >
                              {checkedCount} / {EEEAT_ITEMS.length}
                            </Badge>
                          </Group>
                          <Stack gap="xs">
                            {EEEAT_ITEMS.map((item) => {
                              const isChecked = effectiveState[item.key] ?? false;
                              const hint =
                                item.auto && item.key === 'external_sources'
                                  ? `Auto-detect: ${externalLinkCount} link eksternal terdeteksi.`
                                  : item.hint;
                              return (
                                <Group
                                  key={item.key}
                                  justify="space-between"
                                  wrap="nowrap"
                                  align="flex-start"
                                  gap="md"
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <Group gap={6}>
                                      <Text size="sm" fw={500}>
                                        {item.label}
                                      </Text>
                                      {item.auto && (
                                        <Badge size="xs" color="blue" variant="light">
                                          auto
                                        </Badge>
                                      )}
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                      {hint}
                                    </Text>
                                  </div>
                                  <Switch
                                    checked={isChecked}
                                    onChange={() => !item.auto && toggleEeeat(item.key)}
                                    color="green"
                                    disabled={item.auto}
                                    onLabel={<IconCheck size={12} />}
                                  />
                                </Group>
                              );
                            })}
                          </Stack>
                          {allChecked && (
                            <Alert color="green" variant="light" mt="md" p="xs">
                              ✅ Semua sinyal E-E-A-T terpenuhi. Aman untuk publish.
                            </Alert>
                          )}
                        </Card>
                      );
                    })()}

                    {/* Pre-publish toolkit (M2 + M4 + #8 + #12 + Bonus img picker) */}
                    <Card withBorder radius="md" p="sm">
                      <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={600}>
                          🛠️ Pre-publish Toolkit
                        </Text>
                      </Group>
                      <Group gap="xs" wrap="wrap">
                        <Button
                          size="xs"
                          variant="light"
                          color="orange"
                          leftSection={<IconShieldCheck size={14} />}
                          onClick={runPolicyCheck}
                        >
                          Cek Pola YMYL
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="blue"
                          leftSection={<IconLink size={14} />}
                          onClick={runLinkSuggestions}
                        >
                          Saran Internal Link
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="grape"
                          leftSection={<IconSearch size={14} />}
                          onClick={runSeoGen}
                        >
                          SEO Snippet
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="teal"
                          leftSection={<IconPhoto size={14} />}
                          onClick={openImgPicker}
                        >
                          Sisipkan Image
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="gray"
                          leftSection={<IconDownload size={14} />}
                          onClick={exportMarkdown}
                        >
                          Export .md
                        </Button>
                      </Group>
                    </Card>

                    <Group>
                      <Button
                        onClick={saveDraft}
                        loading={saving}
                        leftSection={<IconDeviceFloppy size={16} />}
                      >
                        Simpan
                      </Button>
                      <Button
                        variant="light"
                        onClick={generateDraft}
                        loading={generating}
                        leftSection={<IconSparkles size={16} />}
                      >
                        Re-generate
                      </Button>
                      {/* Publish to Blog — hanya muncul saat status siap_publish atau published */}
                      {selected &&
                        (status === 'siap_publish' || status === 'published') && (
                          <Button
                            color={selected.published_url ? 'orange' : 'green'}
                            leftSection={<IconRocket size={16} />}
                            onClick={() => startPublishFlow(false)}
                            loading={publishLoading}
                            disabled={publishOpened}
                          >
                            {selected.published_url ? 'Update to Blog' : 'Publish to Blog'}
                          </Button>
                        )}
                    </Group>

                    {/* Info bar kalau sudah published ke blog */}
                    {selected?.published_url && (
                      <Alert color="green" variant="light" icon={<IconRocket size={16} />}>
                        <Group justify="space-between" wrap="wrap" gap="xs">
                          <Text size="sm">
                            Live di blog Laravel
                            {selected.published_at_blog &&
                              ` sejak ${formatDate(selected.published_at_blog)}`}
                          </Text>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            component="a"
                            href={selected.published_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            leftSection={<IconExternalLink size={12} />}
                          >
                            Buka public URL
                          </Button>
                        </Group>
                      </Alert>
                    )}
                  </>
                )}
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <Modal
        opened={deleteOpened}
        onClose={closeDelete}
        title="Hapus draft?"
        centered
        size="sm"
      >
        <Text size="sm" mb="md">
          Draft akan dihapus permanen. Lanjutkan?
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDelete}>
            Batal
          </Button>
          <Button color="red" onClick={confirmDelete}>
            Hapus
          </Button>
        </Group>
      </Modal>

      {/* M2 — YMYL Policy Check Modal */}
      <Modal
        opened={policyOpened}
        onClose={closePolicy}
        title="Cek Pola YMYL (Your Money Your Life)"
        size="lg"
        centered
      >
        <Alert color="blue" variant="light" mb="md" icon={<IconAlertTriangle size={16} />}>
          <Text size="xs">
            Ini <b>deteksi pola</b>, bukan verdict aman/tidak. AI tidak bisa menggantikan
            review manual untuk policy AdSense. Pakai sebagai checklist, bukan keputusan final.
          </Text>
        </Alert>
        {policyLoading ? (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        ) : policyResult ? (
          <Stack gap="md">
            <Card withBorder p="sm">
              <Text size="sm" fw={600} c="dimmed" mb={4}>
                Ringkasan
              </Text>
              <Text size="sm">{policyResult.summary}</Text>
            </Card>
            {policyResult.patterns.length === 0 ? (
              <Alert color="green" variant="light">
                ✅ Tidak ada pola YMYL terdeteksi.
              </Alert>
            ) : (
              policyResult.patterns.map((p, i) => (
                <Card key={i} withBorder p="sm">
                  <Group gap="xs" mb={4}>
                    <Badge
                      color={
                        p.category === 'medical'
                          ? 'red'
                          : p.category === 'financial'
                            ? 'orange'
                            : p.category === 'legal'
                              ? 'grape'
                              : 'yellow'
                      }
                      variant="filled"
                    >
                      {p.category}
                    </Badge>
                  </Group>
                  <Text size="sm" fs="italic" c="dimmed" mb={4}>
                    "{p.excerpt}"
                  </Text>
                  <Text size="sm" mb="sm">
                    {p.note}
                  </Text>
                  <Card withBorder bg="var(--mantine-color-default-hover)" p="xs">
                    <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={600} c="dimmed">
                          Saran disclaimer:
                        </Text>
                        <Text size="sm">{p.suggested_disclaimer}</Text>
                      </div>
                      <CopyButton value={p.suggested_disclaimer} timeout={1500}>
                        {({ copied, copy }) => (
                          <ActionIcon variant="subtle" onClick={copy}>
                            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          </ActionIcon>
                        )}
                      </CopyButton>
                    </Group>
                  </Card>
                </Card>
              ))
            )}
          </Stack>
        ) : null}
      </Modal>

      {/* M4 — Internal Link Suggestions Modal */}
      <Modal
        opened={linksOpened}
        onClose={closeLinks}
        title="Saran Internal Link"
        size="lg"
        centered
      >
        {linksLoading ? (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        ) : linkSuggestions.length === 0 ? (
          <Alert color="gray" variant="light">
            Belum ada saran. Bikin draft lain dulu di niche yang serupa, atau pastikan
            draft kamu punya konten yang cukup untuk matching.
          </Alert>
        ) : (
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Klik <b>Sisipkan</b> untuk append link markdown di akhir konten. Slug
              ditebak dari judul; sesuaikan dengan struktur URL blog kamu sebelum publish.
            </Text>
            {linkSuggestions.map((s) => (
              <Card key={s.draft_id} withBorder p="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} lineClamp={2}>
                      {s.title}
                    </Text>
                    <Group gap={6} mt={2}>
                      <Badge size="xs" variant="light" color="gray">
                        match {(s.score * 100).toFixed(0)}%
                      </Badge>
                      <Text size="xs" c="dimmed">
                        /{s.slug}
                      </Text>
                    </Group>
                  </div>
                  <Group gap={4}>
                    <CopyButton value={`[${s.suggested_anchor}](/${s.slug})`} timeout={1500}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Tersalin!' : 'Copy markdown link'}>
                          <ActionIcon variant="subtle" onClick={copy}>
                            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Button size="compact-xs" onClick={() => insertLinkAtEnd(s)}>
                      Sisipkan
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Modal>

      {/* #8 — SEO Snippet Modal */}
      <Modal
        opened={seoOpened}
        onClose={closeSeo}
        title="SEO Snippet"
        size="lg"
        centered
      >
        {seoLoading ? (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        ) : seoResult ? (
          <Stack gap="md">
            {[
              {
                label: 'Meta Title',
                value: seoResult.meta_title,
                limit: 60,
              },
              {
                label: 'Meta Description',
                value: seoResult.meta_description,
                limit: 160,
              },
              {
                label: 'URL Slug',
                value: seoResult.slug,
              },
            ].map((f) => (
              <div key={f.label}>
                <Group justify="space-between" mb={4}>
                  <Text size="sm" fw={600}>
                    {f.label}
                  </Text>
                  <Group gap={6}>
                    {f.limit && (
                      <Badge
                        size="xs"
                        color={f.value.length <= f.limit ? 'green' : 'red'}
                        variant="light"
                      >
                        {f.value.length}/{f.limit}
                      </Badge>
                    )}
                    <CopyButton value={f.value} timeout={1500}>
                      {({ copied, copy }) => (
                        <ActionIcon variant="subtle" onClick={copy} size="sm">
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      )}
                    </CopyButton>
                  </Group>
                </Group>
                <Card withBorder p="xs" bg="var(--mantine-color-default-hover)">
                  <Text size="sm">{f.value}</Text>
                </Card>
              </div>
            ))}
            <div>
              <Text size="sm" fw={600} mb={4}>
                Keywords
              </Text>
              <Group gap={6}>
                {seoResult.keywords.map((k) => (
                  <Badge key={k} variant="light" color="grape">
                    {k}
                  </Badge>
                ))}
              </Group>
            </div>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeSeo}>
                Tutup
              </Button>
              <Button
                color="grape"
                leftSection={<IconDeviceFloppy size={14} />}
                onClick={saveSeoToMeta}
              >
                Simpan ke Draft
              </Button>
            </Group>
            <Text size="xs" c="dimmed" ta="center">
              "Simpan ke Draft" akan otomatis dipakai sebagai meta saat Publish to Blog.
            </Text>
          </Stack>
        ) : null}
      </Modal>

      {/* Bonus — Featured Image Picker Modal */}
      <Modal
        opened={imgPickerOpened}
        onClose={closeImgPicker}
        title="Sisipkan Image ke Konten"
        size="xl"
        centered
      >
        <Stack gap="md">
          <Group gap="xs" wrap="nowrap">
            <TextInput
              placeholder="Cari di Pexels / Unsplash / Pixabay..."
              value={imgQuery}
              onChange={(e) => setImgQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  searchImages();
                }
              }}
              style={{ flex: 1 }}
              leftSection={<IconSearch size={14} />}
            />
            <Button onClick={() => searchImages()} loading={imgLoading}>
              Cari
            </Button>
          </Group>
          {imgResults.length > 0 && (
            <Grid gutter="xs">
              {imgResults.map((item) => {
                const isFeatured =
                  publishingMeta.featured_image?.url === item.url;
                return (
                  <Grid.Col
                    key={`${item.provider}-${item.id}`}
                    span={{ base: 6, sm: 4 }}
                  >
                    <Card
                      withBorder
                      padding={0}
                      radius="sm"
                      style={{
                        overflow: 'hidden',
                        borderColor: isFeatured
                          ? 'var(--mantine-color-orange-filled)'
                          : undefined,
                      }}
                    >
                      <div style={{ position: 'relative', aspectRatio: '4/3' }}>
                        <img
                          src={item.thumb}
                          alt={item.alt}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                        <Badge
                          size="xs"
                          color={
                            item.provider === 'pexels'
                              ? 'teal'
                              : item.provider === 'unsplash'
                                ? 'dark'
                                : 'green'
                          }
                          style={{ position: 'absolute', top: 4, right: 4 }}
                        >
                          {item.provider}
                        </Badge>
                        {isFeatured && (
                          <Badge
                            size="xs"
                            color="orange"
                            variant="filled"
                            leftSection={<IconStar size={10} />}
                            style={{ position: 'absolute', top: 4, left: 4 }}
                          >
                            FEATURED
                          </Badge>
                        )}
                      </div>
                      <Stack gap={4} p={4}>
                        <Text size="xs" c="dimmed" truncate>
                          📷 {item.photographer || 'Unknown'}
                        </Text>
                        <Group gap={4} wrap="nowrap">
                          <Button
                            size="compact-xs"
                            variant="light"
                            style={{ flex: 1 }}
                            onClick={() => insertImage(item)}
                          >
                            Sisipkan
                          </Button>
                          <Tooltip
                            label={
                              isFeatured
                                ? 'Sudah jadi featured'
                                : 'Jadikan featured image'
                            }
                          >
                            <ActionIcon
                              variant={isFeatured ? 'filled' : 'light'}
                              color="orange"
                              size="md"
                              onClick={() => setAsFeatured(item)}
                              disabled={isFeatured}
                            >
                              <IconStar size={12} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Stack>
                    </Card>
                  </Grid.Col>
                );
              })}
            </Grid>
          )}
          {imgResults.length === 0 && !imgLoading && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              Cari kata kunci → klik gambar untuk sisipkan markdown ke akhir konten.
            </Text>
          )}
        </Stack>
      </Modal>

      {/* Publish to Blog — 2-stage Modal (preflight + progress) */}
      <Modal
        opened={publishOpened}
        onClose={() => {
          cancelPolling();
          closePublish();
        }}
        title={
          <Group gap="xs">
            <IconRocket size={18} />
            <Text fw={600}>
              {publishStage === 'preflight' ? 'Konfirmasi Publish' : 'Publish to Laravel Blog'}
            </Text>
            {publishForceFlag && (
              <Badge size="xs" color="orange" variant="filled">
                FORCE
              </Badge>
            )}
          </Group>
        }
        size="md"
        centered
        closeOnClickOutside={false}
      >
        {/* STAGE 1 — Preflight confirmation */}
        {publishStage === 'preflight' && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Cek payload yang akan dikirim ke Laravel blog. Field admin (slug, kategori,
              tags, featured image) cuma di-set kalau admin belum isi sendiri.
            </Text>

            <Card withBorder p="sm">
              <Stack gap="xs">
                <div>
                  <Text size="xs" fw={600} c="dimmed">
                    JUDUL
                  </Text>
                  <Text size="sm" fw={500} lineClamp={2}>
                    {title || <Text component="span" c="red">(KOSONG — wajib diisi)</Text>}
                  </Text>
                </div>
                <div>
                  <Text size="xs" fw={600} c="dimmed">
                    KONTEN
                  </Text>
                  <Text size="xs" c="dimmed">
                    {contentMd.length.toLocaleString('id-ID')} karakter ·{' '}
                    {(contentMd.match(/!\[[^\]]*\]\(https?:\/\/[^)]+\)/g) || []).length}{' '}
                    inline image
                  </Text>
                </div>
                {publishingMeta.category && (
                  <div>
                    <Text size="xs" fw={600} c="dimmed">
                      KATEGORI
                    </Text>
                    <Badge variant="light">{publishingMeta.category}</Badge>
                  </div>
                )}
                {(publishingMeta.tags?.length ?? 0) > 0 && (
                  <div>
                    <Text size="xs" fw={600} c="dimmed">
                      TAGS
                    </Text>
                    <Group gap={4}>
                      {publishingMeta.tags!.map((t) => (
                        <Badge key={t} size="xs" variant="light" color="blue">
                          {t}
                        </Badge>
                      ))}
                    </Group>
                  </div>
                )}
                {publishingMeta.featured_image?.url && (
                  <div>
                    <Text size="xs" fw={600} c="dimmed" mb={2}>
                      FEATURED IMAGE
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                      <img
                        src={publishingMeta.featured_image.url}
                        alt=""
                        style={{
                          width: 50,
                          height: 38,
                          objectFit: 'cover',
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      />
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {publishingMeta.featured_image.credit}
                      </Text>
                    </Group>
                  </div>
                )}
                {publishingMeta.meta_title && (
                  <div>
                    <Text size="xs" fw={600} c="dimmed">
                      META TITLE
                    </Text>
                    <Text size="xs" lineClamp={1}>
                      {publishingMeta.meta_title}
                    </Text>
                  </div>
                )}
              </Stack>
            </Card>

            {/* Warnings — pre-flight checks */}
            {(() => {
              const warnings: string[] = [];
              if (!title.trim()) warnings.push('Judul kosong');
              if (!contentMd.trim()) warnings.push('Konten kosong');
              if (contentMd.length < 500)
                warnings.push('Konten pendek (<500 karakter) — AdSense lebih suka konten >800 kata');
              if (!publishingMeta.featured_image?.url)
                warnings.push('Belum ada featured image — Laravel akan publish tanpa hero image');
              if (!publishingMeta.category)
                warnings.push('Belum ada kategori — admin harus isi manual di Filament');
              if (!publishingMeta.meta_title)
                warnings.push('Belum ada SEO meta — Laravel auto-derive dari title (kurang optimal)');
              if (warnings.length === 0) return null;
              return (
                <Alert
                  color={warnings.some((w) => w.includes('kosong')) ? 'red' : 'yellow'}
                  variant="light"
                  icon={<IconAlertTriangle size={16} />}
                >
                  <Text size="xs" fw={500} mb={4}>
                    Pre-flight check
                  </Text>
                  <Stack gap={2}>
                    {warnings.map((w, i) => (
                      <Text key={i} size="xs">
                        • {w}
                      </Text>
                    ))}
                  </Stack>
                </Alert>
              );
            })()}

            <Group justify="flex-end">
              <Button variant="default" onClick={closePublish}>
                Batal
              </Button>
              <Button
                color={publishForceFlag ? 'orange' : 'green'}
                leftSection={<IconRocket size={14} />}
                onClick={confirmPublish}
                disabled={!title.trim() || !contentMd.trim()}
              >
                {publishForceFlag ? 'Force Publish' : 'Lanjut Publish'}
              </Button>
            </Group>
          </Stack>
        )}

        {/* STAGE 2 — Progress (was the original modal content) */}
        {publishStage === 'progress' && (
          <>
            {publishError && (
          <Alert color="red" variant="light" mb="md" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm" fw={500}>
              Gagal publish
            </Text>
            <Text size="xs" mt={4}>
              {publishError}
            </Text>
          </Alert>
        )}

        {publishLoading && !publishStatus && (
          <Group justify="center" py="xl" gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Mengirim payload ke blog...
            </Text>
          </Group>
        )}

        {publishStatus && (
          <Stack gap="md">
            {publishStatus.status === 'processing' && (
              <>
                <Group gap="sm">
                  <Loader size="sm" />
                  <Text size="sm">
                    Background job download gambar... {publishStatus.downloaded_images}/
                    {publishStatus.total_images || '?'}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Polling exponential backoff (3-30 detik). Aman tutup modal — proses
                  lanjut di background, status final bisa dicek nanti.
                </Text>
              </>
            )}

            {publishStatus.status === 'draft' && (
              <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
                <Text size="sm" fw={500}>
                  Sukses — artikel masuk sebagai DRAFT di Laravel
                </Text>
                <Text size="xs" mt={4}>
                  Buka admin URL untuk kurasi (kategori, SEO, slug, dll), lalu publish dari Filament.
                </Text>
              </Alert>
            )}

            {publishStatus.status === 'published' && (
              <Alert color="teal" variant="light" icon={<IconRocket size={16} />}>
                <Text size="sm" fw={500}>
                  LIVE di blog!
                </Text>
              </Alert>
            )}

            {publishStatus.status === 'processing_failed' && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                <Text size="sm" fw={500}>
                  Background job gagal
                </Text>
                <Text size="xs" mt={4}>
                  {publishStatus.processing_error || 'unknown error'}
                </Text>
                <Text size="xs" mt={4} c="dimmed">
                  Buka admin URL untuk fix manual (mis. upload featured image langsung).
                </Text>
              </Alert>
            )}

            {/* Updated/preserved fields info — penting untuk re-POST/force update */}
            {publishFieldsInfo &&
              (publishFieldsInfo.updated.length > 0 ||
                publishFieldsInfo.preserved.length > 0) && (
                <Card withBorder p="xs">
                  {publishFieldsInfo.updated.length > 0 && (
                    <div>
                      <Text size="xs" fw={600} c="green" mb={2}>
                        ✅ Diupdate
                      </Text>
                      <Group gap={4} mb="xs">
                        {publishFieldsInfo.updated.map((f) => (
                          <Badge key={f} size="xs" variant="light" color="green">
                            {f}
                          </Badge>
                        ))}
                      </Group>
                    </div>
                  )}
                  {publishFieldsInfo.preserved.length > 0 && (
                    <div>
                      <Text size="xs" fw={600} c="dimmed" mb={2}>
                        🔒 Dipertahankan oleh admin Laravel
                      </Text>
                      <Group gap={4}>
                        {publishFieldsInfo.preserved.map((f) => (
                          <Badge key={f} size="xs" variant="light" color="gray">
                            {f}
                          </Badge>
                        ))}
                      </Group>
                    </div>
                  )}
                </Card>
              )}

            <Group gap="xs" wrap="wrap">
              {publishStatus.admin_url && (
                <Button
                  size="xs"
                  variant="light"
                  component="a"
                  href={publishStatus.admin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  leftSection={<IconExternalLink size={12} />}
                >
                  Admin (Filament)
                </Button>
              )}
              {publishStatus.public_url && (
                <Button
                  size="xs"
                  variant="light"
                  color="green"
                  component="a"
                  href={publishStatus.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  leftSection={<IconExternalLink size={12} />}
                >
                  Public URL
                </Button>
              )}
              {publishStatus.status === 'processing' && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    if (selected) {
                      pollAbortRef.current = false;
                      pollPublishStatus(selected.id);
                    }
                  }}
                >
                  Re-poll sekarang
                </Button>
              )}
            </Group>

            <Text size="xs" c="dimmed">
              Laravel post id: <b>{publishStatus.laravel_post_id}</b>
            </Text>
          </Stack>
        )}
          </>
        )}
      </Modal>

      {/* Force Confirmation Modal — kalau dapat 409 conflict */}
      <Modal
        opened={forceConfirmOpened}
        onClose={closeForceConfirm}
        title="Artikel sudah live — force update?"
        size="sm"
        centered
      >
        <Stack gap="sm">
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">
              Artikel ini sudah <b>published</b> di blog. Force update HANYA mengganti{' '}
              <b>title, content, meta_title, meta_description, keywords</b>. Field admin
              (slug, kategori, tags, featured image) <b>tidak akan berubah</b>.
            </Text>
          </Alert>
          {forceConfirmAdminUrl && (
            <Button
              size="xs"
              variant="light"
              component="a"
              href={forceConfirmAdminUrl}
              target="_blank"
              rel="noopener noreferrer"
              leftSection={<IconExternalLink size={12} />}
              maw={180}
            >
              Lihat di admin dulu
            </Button>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeForceConfirm}>
              Batal
            </Button>
            <Button
              color="orange"
              leftSection={<IconRocket size={14} />}
              onClick={() => {
                closeForceConfirm();
                startPublishFlow(true);
              }}
            >
              Force Update
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
