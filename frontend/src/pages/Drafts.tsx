import { useEffect, useState } from 'react';
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
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconPlus,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';

type DraftListItem = {
  id: number;
  title: string;
  content_type: string;
  tone: string;
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

  function newDraft() {
    setMode('new');
    setSelected(null);
    setTitle('');
    setContentType(CONTENT_TYPES[0].value);
    setTone(TONES[0].value);
    setNotes('');
    setContentMd('');
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
      });
      setSelected(d);
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

            <ScrollArea h={520} type="auto">
              {loadingList ? (
                <Group justify="center" p="md">
                  <Loader size="sm" />
                </Group>
              ) : list.length === 0 ? (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  Belum ada draft.
                </Text>
              ) : (
                <Stack gap="xs">
                  {list.map((d) => (
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
                    <Text size="xs" c="dimmed">
                      Update terakhir: {formatDate(selected.updated_at)}
                    </Text>
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
                    <Group justify="space-between" align="end">
                      <Text size="sm" fw={500}>
                        Konten (Markdown)
                      </Text>
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
