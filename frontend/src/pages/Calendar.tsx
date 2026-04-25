import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
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
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCalendar,
  IconCheck,
  IconDeviceFloppy,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';

type CalendarEntry = {
  id: number;
  date: string; // YYYY-MM-DD
  title: string;
  content_type: string;
  notes: string;
};

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const CONTENT_TYPES = [
  { value: 'panduan', label: 'Panduan' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'review', label: 'Review' },
  { value: 'tips', label: 'Tips' },
  { value: 'sejarah', label: 'Sejarah' },
  { value: 'perbandingan', label: 'Perbandingan' },
  { value: 'listicle', label: 'Listicle' },
  { value: 'opini', label: 'Opini' },
  { value: 'studi-kasus', label: 'Studi Kasus' },
  { value: 'artikel', label: 'Artikel' },
];

const TYPE_EMOJI: Record<string, string> = {
  panduan: '📘',
  tutorial: '🛠️',
  review: '⭐',
  tips: '💡',
  sejarah: '📜',
  perbandingan: '⚖️',
  listicle: '📋',
  opini: '💬',
  'studi-kasus': '🔍',
  artikel: '📝',
};

function dayOfMonth(dateStr: string): number {
  return parseInt(dateStr.split('-')[2], 10);
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [frequency, setFrequency] = useState(3);
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('');

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [editorOpened, { open: openEditor, close: closeEditor }] = useDisclosure(false);
  const [editEntry, setEditEntry] = useState<CalendarEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState('artikel');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 1 + i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function fetchEntries() {
    setLoading(true);
    try {
      const data = await apiGet<CalendarEntry[]>(
        `/calendar?year=${year}&month=${month}`,
      );
      setEntries(data);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal load kalender',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function tryGenerate() {
    if (!niche.trim()) {
      notifications.show({ color: 'yellow', message: 'Isi niche dulu.' });
      return;
    }
    if (entries.length > 0) {
      openConfirm();
    } else {
      runGenerate();
    }
  }

  async function runGenerate() {
    closeConfirm();
    setGenerating(true);
    try {
      const data = await apiPost<CalendarEntry[]>('/calendar/generate', {
        year,
        month,
        frequency,
        niche,
        audience,
      });
      setEntries(data);
      notifications.show({
        color: 'teal',
        icon: <IconCheck size={16} />,
        message: `${data.length} jadwal berhasil dibuat.`,
      });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal generate',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setGenerating(false);
    }
  }

  function openEditModal(entry: CalendarEntry) {
    setEditEntry(entry);
    setEditTitle(entry.title);
    setEditType(entry.content_type);
    setEditNotes(entry.notes);
    openEditor();
  }

  async function saveEdit() {
    if (!editEntry) return;
    setEditSaving(true);
    try {
      const updated = await apiPut<CalendarEntry>(`/calendar/${editEntry.id}`, {
        title: editTitle,
        content_type: editType,
        notes: editNotes,
      });
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      closeEditor();
      notifications.show({ color: 'teal', message: 'Jadwal tersimpan.' });
    } catch (e) {
      notifications.show({
        color: 'red',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteEntry(id: number) {
    try {
      await apiDelete(`/calendar/${id}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      closeEditor();
      notifications.show({ color: 'teal', message: 'Jadwal dihapus.' });
    } catch (e) {
      notifications.show({
        color: 'red',
        message: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  // Build calendar grid
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun..6=Sat
  const entryByDay = useMemo(() => {
    const m: Record<number, CalendarEntry> = {};
    for (const e of entries) m[dayOfMonth(e.date)] = e;
    return m;
  }, [entries]);

  const dayHeaders = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Content Calendar</Title>
        <Text c="dimmed" size="sm">
          Rencanakan jadwal posting bulanan dengan distribusi topik seimbang.
        </Text>
      </div>

      {/* Settings */}
      <Card withBorder shadow="xs" radius="md">
        <Stack gap="md">
          <Grid>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <Select
                label="Tahun"
                data={yearOptions}
                value={String(year)}
                onChange={(v) => v && setYear(parseInt(v))}
                allowDeselect={false}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <Select
                label="Bulan"
                data={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                value={String(month)}
                onChange={(v) => v && setMonth(parseInt(v))}
                allowDeselect={false}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Frekuensi posting / minggu"
                data={[
                  { value: '2', label: '2x (sustainable)' },
                  { value: '3', label: '3x (ideal)' },
                  { value: '4', label: '4x' },
                  { value: '5', label: '5x (intensif)' },
                ]}
                value={String(frequency)}
                onChange={(v) => v && setFrequency(parseInt(v))}
                allowDeselect={false}
              />
            </Grid.Col>
          </Grid>
          <TextInput
            label="Niche / fokus topik"
            placeholder="mis: web development, investasi reksadana, marathon training..."
            value={niche}
            onChange={(e) => setNiche(e.currentTarget.value)}
          />
          <TextInput
            label="Target audience (opsional)"
            placeholder="mis: developer pemula, ibu rumah tangga, profesional 30-an..."
            value={audience}
            onChange={(e) => setAudience(e.currentTarget.value)}
          />
          <Button
            onClick={tryGenerate}
            loading={generating}
            leftSection={<IconSparkles size={16} />}
            maw={260}
          >
            Generate Calendar
          </Button>
        </Stack>
      </Card>

      {/* Grid */}
      <Card withBorder shadow="xs" radius="md">
        <Group justify="space-between" mb="md">
          <Text fw={600}>
            <IconCalendar size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {MONTHS[month - 1]} {year}
          </Text>
          <Text size="sm" c="dimmed">
            {entries.length} jadwal
          </Text>
        </Group>

        {loading ? (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        ) : (
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 6,
            }}
          >
            {dayHeaders.map((d) => (
              <Text
                key={d}
                ta="center"
                size="xs"
                fw={600}
                c="dimmed"
                tt="uppercase"
                py={6}
              >
                {d}
              </Text>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => (
              <Box key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const entry = entryByDay[day];
              return (
                <Card
                  key={day}
                  withBorder
                  padding={6}
                  radius="sm"
                  style={{
                    minHeight: 78,
                    cursor: entry ? 'pointer' : 'default',
                    background: entry ? 'var(--mantine-color-orange-light)' : undefined,
                    borderColor: entry ? 'var(--mantine-color-orange-filled)' : undefined,
                  }}
                  onClick={() => entry && openEditModal(entry)}
                >
                  <Text size="xs" fw={600} c={entry ? 'orange.7' : 'dimmed'}>
                    {day}
                  </Text>
                  {entry && (
                    <Text size="xs" lineClamp={3} mt={3} style={{ lineHeight: 1.3 }}>
                      {TYPE_EMOJI[entry.content_type] ?? '📝'} {entry.title}
                    </Text>
                  )}
                </Card>
              );
            })}
          </Box>
        )}
      </Card>

      {/* List view */}
      {entries.length > 0 && (
        <Card withBorder shadow="xs" radius="md">
          <Text fw={600} mb="sm">
            Daftar Lengkap
          </Text>
          <ScrollArea h={Math.min(entries.length * 64 + 16, 400)}>
            <Stack gap="xs">
              {entries.map((e) => (
                <Card
                  key={e.id}
                  withBorder
                  padding="sm"
                  radius="sm"
                  style={{ cursor: 'pointer' }}
                  onClick={() => openEditModal(e)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={4}>
                        <Badge size="sm" variant="light" color="orange">
                          {e.date.split('-')[2]} {MONTHS[month - 1]}
                        </Badge>
                        <Badge size="sm" variant="light" color="gray">
                          {TYPE_EMOJI[e.content_type] ?? '📝'} {e.content_type}
                        </Badge>
                      </Group>
                      <Text size="sm" lineClamp={2}>
                        {e.title}
                      </Text>
                    </div>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        deleteEntry(e.id);
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          </ScrollArea>
        </Card>
      )}

      {/* Confirm regenerate */}
      <Modal
        opened={confirmOpened}
        onClose={closeConfirm}
        title="Re-generate kalender?"
        centered
        size="sm"
      >
        <Text size="sm" mb="md">
          Bulan ini sudah punya {entries.length} jadwal. Generate ulang akan{' '}
          <b>menghapus semua jadwal lama</b> dan menggantinya dengan yang baru.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeConfirm}>
            Batal
          </Button>
          <Button color="orange" onClick={runGenerate}>
            Replace
          </Button>
        </Group>
      </Modal>

      {/* Edit entry */}
      <Modal
        opened={editorOpened}
        onClose={closeEditor}
        title={editEntry ? `Edit jadwal ${editEntry.date}` : ''}
        centered
        size="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Judul"
            value={editTitle}
            onChange={(e) => setEditTitle(e.currentTarget.value)}
          />
          <Select
            label="Jenis konten"
            data={CONTENT_TYPES}
            value={editType}
            onChange={(v) => v && setEditType(v)}
            allowDeselect={false}
          />
          <Textarea
            label="Catatan (opsional)"
            value={editNotes}
            onChange={(e) => setEditNotes(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={5}
          />
          <Alert color="gray" variant="light">
            Tip: catat sumber, angle khusus, atau referensi untuk artikel ini.
          </Alert>
          <Group justify="space-between">
            <Button
              variant="light"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => editEntry && deleteEntry(editEntry.id)}
            >
              Hapus
            </Button>
            <Group>
              <Button variant="default" onClick={closeEditor}>
                Batal
              </Button>
              <Button
                onClick={saveEdit}
                loading={editSaving}
                leftSection={<IconDeviceFloppy size={16} />}
              >
                Simpan
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
