import { type ReactNode, useEffect, useState } from 'react';
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconRefresh,
  IconRobot,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';
import { apiDelete, apiGet, apiPost } from '../api/client';

type BadgeKind = 'ai' | 'human' | 'both';

type WorkflowStep = {
  num: number;
  name: string;
  desc: string;
  badge: BadgeKind;
  detail: ReactNode;
};

const BADGE_META: Record<BadgeKind, { label: string; color: string; icon: ReactNode }> = {
  ai: { label: 'AI-assisted', color: 'orange', icon: <IconRobot size={12} /> },
  human: { label: 'Manusia', color: 'green', icon: <IconUser size={12} /> },
  both: { label: 'AI + Manusia', color: 'yellow', icon: <IconUsersGroup size={12} /> },
};

const STEPS: WorkflowStep[] = [
  {
    num: 1,
    name: 'Riset & Pilih Topik',
    desc: 'Pilih topik + validasi keyword + cek kompetitor',
    badge: 'ai',
    detail: (
      <Stack gap="sm">
        <Text size="sm">
          <b>Yang AI bisa bantu:</b> generate ide, cluster topik, cek angle yang
          belum banyak dibahas.
        </Text>
        <Text size="sm">
          <b>Yang kamu kerjakan:</b> validasi apakah topik relevan untuk audience
          kamu, pilih angle unik yang punya sudut pandang personal.
        </Text>
        <Alert color="orange" variant="light">
          🛠️ <b>Tools:</b> Tab <i>Ide Topik</i> di sidebar + Google Search
          autocomplete + Google Trends.
        </Alert>
        <Alert color="green" variant="light">
          💡 <b>Tips:</b> Topik yang spesifik + niche audience hampir selalu
          mengalahkan topik umum yang sudah ratusan blog tulis.
        </Alert>
      </Stack>
    ),
  },
  {
    num: 2,
    name: 'Riset Konten & Validasi Fakta',
    desc: 'Kumpulkan sumber, data, dan validasi akurasi',
    badge: 'human',
    detail: (
      <Stack gap="sm">
        <Text size="sm">
          <b>Yang HARUS kamu kerjakan sendiri:</b>
        </Text>
        <List size="sm" spacing="xs">
          <List.Item>Cek minimal 3 sumber referensi terpercaya</List.Item>
          <List.Item>
            Validasi data, angka, dan klaim — AI sering halusinasi pada detail
            spesifik
          </List.Item>
          <List.Item>
            Catat sumber untuk backlink / sitasi nanti (penting untuk E-E-A-T)
          </List.Item>
          <List.Item>
            Kalau topiknya teknis: coba praktekkan / replikasi sebelum nulis
          </List.Item>
        </List>
        <Alert color="red" variant="light">
          ⚠️ <b>Jangan skip tahap ini.</b> Satu fakta yang salah bisa merusak
          kredibilitas blog kamu untuk waktu yang lama.
        </Alert>
      </Stack>
    ),
  },
  {
    num: 3,
    name: 'Buat Outline & Draft',
    desc: 'AI bantu kerangka, kamu poles dengan konteks',
    badge: 'both',
    detail: (
      <Stack gap="sm">
        <Text size="sm">
          <b>AI kerjakan:</b> outline, draft intro, struktur H2/H3, meta
          description, variasi judul.
        </Text>
        <Text size="sm">
          <b>Kamu kerjakan:</b>
        </Text>
        <List size="sm" spacing="xs">
          <List.Item>Tambah anekdot pembuka / hook personal</List.Item>
          <List.Item>Sisipkan pengalaman atau studi kasus nyata</List.Item>
          <List.Item>Koreksi bahasa supaya natural, bukan robotic</List.Item>
          <List.Item>Tambah konteks lokal / cultural yang relevan</List.Item>
        </List>
        <Alert color="orange" variant="light">
          🛠️ <b>Tools:</b> Tab <i>Draft</i> di sidebar — AI generate skeleton
          markdown, kamu edit langsung di editor.
        </Alert>
      </Stack>
    ),
  },
  {
    num: 4,
    name: 'Edit & Tambah Pengalaman Pribadi',
    desc: 'Polish bahasa, tambah cerita, sisipkan media',
    badge: 'human',
    detail: (
      <Stack gap="sm">
        <Text size="sm">
          <b>Ini yang membedakan blog kamu dari konten AI massal:</b>
        </Text>
        <List size="sm" spacing="xs">
          <List.Item>
            Isi placeholder <code>⭐ Dari Pengalaman Pribadi</code> dengan cerita
            atau insight yang hanya kamu yang bisa tulis
          </List.Item>
          <List.Item>
            Tambahkan screenshot, foto, atau diagram asli (bukan stock generic)
          </List.Item>
          <List.Item>
            Baca ulang dengan suara keras — kalau kaku, sederhanakan
          </List.Item>
          <List.Item>
            Pastikan opening 2 kalimat pertama benar-benar menarik
          </List.Item>
        </List>
        <Alert color="green" variant="light">
          ⭐ <b>E-E-A-T Google:</b> bukti pengalaman nyata (foto, catatan
          proses, opini personal) adalah sinyal kualitas terkuat di 2025.
        </Alert>
      </Stack>
    ),
  },
  {
    num: 5,
    name: 'Optimasi SEO & Publish',
    desc: 'Meta tags, internal link, schema, lalu publish',
    badge: 'both',
    detail: (
      <Stack gap="sm">
        <Text size="sm">
          <b>Checklist sebelum publish:</b>
        </Text>
        <List size="sm" spacing="xs">
          <List.Item>Meta title (≤60 karakter) + meta description (≤160)</List.Item>
          <List.Item>
            URL slug singkat & deskriptif (mis: <code>/judul-pendek</code>)
          </List.Item>
          <List.Item>Alt-text untuk semua gambar</List.Item>
          <List.Item>
            Internal link ke 2–3 artikel terkait (kalau ada)
          </List.Item>
          <List.Item>Schema markup yang sesuai (Article, HowTo, Recipe...)</List.Item>
          <List.Item>Cek typo & ejaan akhir</List.Item>
        </List>
        <Alert color="orange" variant="light">
          📅 <b>Distribusi:</b> setelah publish, jadwalkan promo di Pinterest,
          Twitter/X, LinkedIn, atau newsletter sesuai niche kamu. Tab{' '}
          <i>Calendar</i> bantu rencanakan ini.
        </Alert>
      </Stack>
    ),
  },
];

export default function Workflow() {
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{ completed: number[] }>('/workflow/progress');
        setCompleted(new Set(data.completed));
      } catch (e) {
        notifications.show({
          color: 'red',
          message: e instanceof Error ? e.message : 'Gagal load progress',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleStep(num: number, isCompleted: boolean) {
    try {
      const data = await apiPost<{ completed: number[] }>('/workflow/progress', {
        step_num: num,
        completed: isCompleted,
      });
      setCompleted(new Set(data.completed));
    } catch (e) {
      notifications.show({
        color: 'red',
        message: e instanceof Error ? e.message : 'Gagal update',
      });
    }
  }

  async function resetAll() {
    try {
      await apiDelete('/workflow/progress');
      setCompleted(new Set());
      notifications.show({ color: 'teal', message: 'Progress di-reset.' });
    } catch (e) {
      notifications.show({
        color: 'red',
        message: e instanceof Error ? e.message : 'Gagal reset',
      });
    }
  }

  const pct = (completed.size / STEPS.length) * 100;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Workflow</Title>
        <Text c="dimmed" size="sm">
          Alur kerja universal: AI mempercepat, suara & pengalaman kamu yang
          jadi pembeda.
        </Text>
      </div>

      <Card withBorder shadow="xs" radius="md">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500}>
            Progress: {completed.size} / {STEPS.length} langkah
          </Text>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconRefresh size={14} />}
            onClick={resetAll}
            disabled={completed.size === 0 || loading}
          >
            Reset
          </Button>
        </Group>
        <Progress value={pct} color="orange" radius="xl" size="md" animated={loading} />
      </Card>

      <Accordion
        variant="separated"
        radius="md"
        multiple
        defaultValue={['1']}
      >
        {STEPS.map((step) => {
          const isDone = completed.has(step.num);
          const meta = BADGE_META[step.badge];
          return (
            <Accordion.Item key={step.num} value={String(step.num)}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap" pr="md">
                  <Group gap="md" wrap="nowrap">
                    <Badge
                      circle
                      size="lg"
                      color={isDone ? 'green' : 'gray'}
                      variant={isDone ? 'filled' : 'light'}
                    >
                      {isDone ? <IconCheck size={14} /> : step.num}
                    </Badge>
                    <div>
                      <Text fw={600} size="sm">
                        {step.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {step.desc}
                      </Text>
                    </div>
                  </Group>
                  <Badge
                    color={meta.color}
                    variant="light"
                    leftSection={meta.icon}
                    size="sm"
                  >
                    {meta.label}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  {step.detail}
                  <Group>
                    {isDone ? (
                      <Button
                        size="xs"
                        variant="light"
                        color="gray"
                        onClick={() => toggleStep(step.num, false)}
                      >
                        ↩ Batalkan
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        leftSection={<IconCheck size={14} />}
                        onClick={() => toggleStep(step.num, true)}
                      >
                        Tandai Selesai
                      </Button>
                    )}
                  </Group>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Stack>
  );
}
