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
  IconCheck,
  IconCloud,
  IconCloudCheck,
  IconCopy,
  IconDeviceFloppy,
  IconEye,
  IconLayoutColumns,
  IconPencil,
  IconPlus,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';

type DraftStatus = 'draft' | 'revisi' | 'siap_publish' | 'published';

type DraftListItem = {
  id: number;
  title: string;
  content_type: string;
  tone: string;
  status: DraftStatus;
  published_at: string | null;
  updated_at: string;
};

type Draft = DraftListItem & {
  content_md: string;
  notes: string;
  created_at: string;
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

  // Auto-save (M6)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const lastSavedSigRef = useRef<string>('');

  // Markdown preview view mode (#3)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');

  function computeSig(values: {
    title: string;
    content_md: string;
    content_type: string;
    tone: string;
    notes: string;
    status: string;
  }): string {
    return JSON.stringify({
      t: values.title,
      c: values.content_md,
      ct: values.content_type,
      tn: values.tone,
      n: values.notes,
      s: values.status,
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
                    </Group>
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
    </Stack>
  );
}
