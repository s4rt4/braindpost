import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Card,
  CopyButton,
  Grid,
  Group,
  Loader,
  Paper,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowRight,
  IconCheck,
  IconClockHour4,
  IconCopy,
  IconEye,
  IconReload,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '../api/client';

const CATEGORIES = [
  'Tech / Software',
  'Lifestyle',
  'Finance & Investasi',
  'Kesehatan & Kebugaran',
  'Travel',
  'Food & Kuliner',
  'Pendidikan',
  'Parenting',
  'Bisnis & Entrepreneurship',
  'Hobi & DIY',
];

const AUDIENCES = [
  'Pemula',
  'Profesional',
  'Mahasiswa',
  'Ibu Rumah Tangga',
  'Pelaku UMKM',
  'Hobbyist / Enthusiast',
  'Eksekutif / Leader',
];

type IdeasResponse = {
  id: number;
  category: string;
  audience: string;
  specific_topic: string;
  result: string;
  created_at: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Extract judul-only dari raw AI output.
 * Skip baris keyword (mengandung [BRACKET]: pattern atau colon di awal).
 */
function parseIdeaTitles(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const titles: string[] = [];
  for (const raw of lines) {
    let t = raw.trim();
    if (!t) continue;
    // Strip leading "**1.**" / "1." / "1)"
    t = t.replace(/^\*+\s*/, '');
    t = t.replace(/^\d+[.)]\s*/, '');
    // Strip leading bullet
    t = t.replace(/^[-*•]\s*/, '');
    // Strip wrapping bold
    t = t.replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '');
    // Skip kalau mulai dengan [ → kemungkinan keyword
    if (t.startsWith('[')) continue;
    // Skip kalau ada colon di awal → header / keyword line
    const colonIdx = t.indexOf(':');
    if (colonIdx >= 0 && colonIdx < 30) continue;
    // Length sanity
    if (t.length < 15 || t.length > 200) continue;
    titles.push(t);
  }
  return titles;
}

export default function Ideas() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [audience, setAudience] = useState<string>(AUDIENCES[0]);
  const [specific, setSpecific] = useState('');
  const [count, setCount] = useState(12);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<IdeasResponse[]>([]);

  const parsedTitles = useMemo(() => parseIdeaTitles(result ?? ''), [result]);

  async function fetchHistory() {
    try {
      const data = await apiGet<IdeasResponse[]>('/ideas/history');
      setHistory(data);
    } catch {
      // silent fail — history is non-critical
    }
  }

  useEffect(() => {
    fetchHistory();
  }, []);

  function loadHistoryResult(item: IdeasResponse) {
    setResult(item.result);
    notifications.show({
      color: 'teal',
      message: `Hasil dari ${formatDate(item.created_at)} di-load.`,
    });
    // Scroll ke atas supaya hasil terlihat
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reuseHistoryParams(item: IdeasResponse) {
    if (CATEGORIES.includes(item.category)) setCategory(item.category);
    if (AUDIENCES.includes(item.audience)) setAudience(item.audience);
    setSpecific(item.specific_topic);
    notifications.show({
      color: 'teal',
      message: 'Parameter form di-set ulang. Tinggal klik Generate.',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteHistoryItem(id: number) {
    try {
      await apiDelete(`/ideas/history/${id}`);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch (e) {
      notifications.show({
        color: 'red',
        message: e instanceof Error ? e.message : 'Gagal hapus',
      });
    }
  }

  async function generate() {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<IdeasResponse>('/ideas/generate', {
        category,
        audience,
        specific_topic: specific,
        count,
      });
      setResult(data.result);
      fetchHistory(); // refresh history list dengan entry baru
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal generate ide';
      notifications.show({ color: 'red', title: 'Error', message: msg });
    } finally {
      setLoading(false);
    }
  }

  function sendToDraft(title: string) {
    navigate('/drafts', { state: { title } });
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Ide Topik</Title>
        <Text c="dimmed" size="sm">
          Generate ide artikel berdasarkan niche dan target pembaca.
        </Text>
      </div>

      <Card withBorder shadow="xs" radius="md">
        <Stack gap="md">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Kategori / Niche"
                data={CATEGORIES}
                value={category}
                onChange={(v) => setCategory(v ?? '')}
                allowDeselect={false}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Target Pembaca"
                data={AUDIENCES}
                value={audience}
                onChange={(v) => setAudience(v ?? '')}
                allowDeselect={false}
              />
            </Grid.Col>
          </Grid>
          <TextInput
            label="Topik spesifik (opsional)"
            placeholder="mis: NextJS server actions, investasi reksadana, marathon training..."
            value={specific}
            onChange={(e) => setSpecific(e.currentTarget.value)}
          />
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>
                Jumlah ide yang di-generate
              </Text>
              <Badge variant="light" color="orange">
                {count} ide ({Math.max(count - 4, 4)} judul + 4 keyword)
              </Badge>
            </Group>
            <Slider
              value={count}
              onChange={setCount}
              min={4}
              max={20}
              step={1}
              marks={[
                { value: 4, label: '4' },
                { value: 8, label: '8' },
                { value: 12, label: '12' },
                { value: 16, label: '16' },
                { value: 20, label: '20' },
              ]}
              mb="md"
            />
          </div>
          <Button
            onClick={generate}
            loading={loading}
            leftSection={<IconSparkles size={16} />}
            maw={220}
            mt="md"
          >
            Generate Ide
          </Button>
        </Stack>
      </Card>

      {loading && (
        <Card withBorder>
          <Group gap="sm">
            <Loader size="sm" />
            <Text c="dimmed" size="sm">
              Sedang generate ide...
            </Text>
          </Group>
        </Card>
      )}

      {result && parsedTitles.length > 0 && (
        <Card withBorder shadow="xs" radius="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Judul Terdeteksi</Title>
            <Badge variant="light">{parsedTitles.length} judul</Badge>
          </Group>
          <Text size="xs" c="dimmed" mb="md">
            Klik <IconArrowRight size={12} style={{ verticalAlign: 'middle' }} />{' '}
            untuk langsung buat draft dengan judul terpilih.
          </Text>
          <Stack gap="xs">
            {parsedTitles.map((t, i) => (
              <Group
                key={i}
                justify="space-between"
                wrap="nowrap"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 8,
                  background: 'var(--mantine-color-default-hover)',
                }}
              >
                <Text size="sm" style={{ flex: 1, minWidth: 0 }} lineClamp={2}>
                  {t}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <CopyButton value={t} timeout={1500}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Tersalin!' : 'Copy judul'}>
                        <ActionIcon variant="subtle" onClick={copy} color="gray">
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                  <Tooltip label="Buat draft dari judul ini">
                    <Button
                      size="compact-xs"
                      rightSection={<IconArrowRight size={12} />}
                      onClick={() => sendToDraft(t)}
                    >
                      Draft
                    </Button>
                  </Tooltip>
                </Group>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      {result && (
        <Card withBorder shadow="xs" radius="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Hasil Lengkap (Keyword + Judul)</Title>
            <CopyButton value={result} timeout={1500}>
              {({ copied, copy }) => (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  leftSection={
                    copied ? <IconCheck size={14} /> : <IconCopy size={14} />
                  }
                  onClick={copy}
                >
                  {copied ? 'Tersalin' : 'Copy semua'}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Paper
            p="md"
            withBorder
            radius="sm"
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            {result}
          </Paper>
        </Card>
      )}

      {history.length > 0 && (
        <Card withBorder shadow="xs" radius="md">
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <IconClockHour4 size={18} />
              <Title order={4}>Riwayat Generate</Title>
            </Group>
            <Badge variant="light">{history.length} session</Badge>
          </Group>
          <Text size="xs" c="dimmed" mb="md">
            20 generate terakhir. Lihat hasilnya lagi atau pakai ulang parameternya.
          </Text>
          <Accordion variant="separated" radius="md">
            {history.map((h) => {
              const titles = parseIdeaTitles(h.result);
              return (
                <Accordion.Item key={h.id} value={String(h.id)}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap" pr="md">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Group gap={6} mb={4} wrap="wrap">
                          <Badge size="xs" variant="light" color="orange">
                            {h.category}
                          </Badge>
                          <Badge size="xs" variant="light" color="blue">
                            {h.audience}
                          </Badge>
                          {h.specific_topic && (
                            <Badge size="xs" variant="light" color="grape">
                              {h.specific_topic}
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {formatDate(h.created_at)} · {titles.length} judul terdeteksi
                        </Text>
                      </div>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      {titles.length > 0 && (
                        <div>
                          <Text size="xs" c="dimmed" mb={4}>
                            Preview judul:
                          </Text>
                          <Stack gap={4}>
                            {titles.slice(0, 3).map((t, i) => (
                              <Text key={i} size="sm" lineClamp={1}>
                                · {t}
                              </Text>
                            ))}
                            {titles.length > 3 && (
                              <Text size="xs" c="dimmed">
                                + {titles.length - 3} lainnya...
                              </Text>
                            )}
                          </Stack>
                        </div>
                      )}
                      <Group justify="space-between" mt="xs">
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconEye size={14} />}
                            onClick={() => loadHistoryResult(h)}
                          >
                            Lihat hasil
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            color="grape"
                            leftSection={<IconReload size={14} />}
                            onClick={() => reuseHistoryParams(h)}
                          >
                            Pakai parameter
                          </Button>
                        </Group>
                        <Tooltip label="Hapus dari riwayat">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => deleteHistoryItem(h.id)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        </Card>
      )}
    </Stack>
  );
}
