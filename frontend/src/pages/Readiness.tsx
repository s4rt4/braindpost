import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Group,
  Loader,
  Progress,
  RingProgress,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconChecklist,
  IconFileText,
  IconRocket,
  IconSettings2,
  IconTarget,
} from '@tabler/icons-react';
import { apiGet, apiPut } from '../api/client';

type AutoStats = {
  published_count: number;
  published_target: number;
  avg_word_count: number;
  avg_word_target: number;
  consecutive_weeks: number;
  consecutive_target: number;
};

type Manual = {
  about_page: boolean;
  privacy_policy: boolean;
  contact_page: boolean;
  disclaimer_page: boolean;
  own_domain: boolean;
  blog_age_6_months: boolean;
  no_policy_violations: boolean;
};

type ReadinessResp = {
  auto: AutoStats;
  manual: Manual;
  overall_pct: number;
};

const PAGES_LABEL: Record<keyof Pick<Manual, 'about_page' | 'privacy_policy' | 'contact_page' | 'disclaimer_page'>, string> = {
  about_page: 'About / Tentang Penulis',
  privacy_policy: 'Privacy Policy',
  contact_page: 'Contact / Kontak',
  disclaimer_page: 'Disclaimer (terutama untuk YMYL)',
};

const TECH_LABEL: Record<keyof Pick<Manual, 'own_domain' | 'blog_age_6_months' | 'no_policy_violations'>, string> = {
  own_domain: 'Domain sendiri (bukan subdomain gratis)',
  blog_age_6_months: 'Blog aktif minimal 6 bulan',
  no_policy_violations: 'Tidak ada konten yang melanggar policy AdSense',
};

function AutoItem({
  label,
  current,
  target,
  unit = '',
}: {
  label: string;
  current: number;
  target: number;
  unit?: string;
}) {
  const pct = Math.min(100, (current / target) * 100);
  const done = current >= target;
  return (
    <div>
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon
            size="sm"
            radius="xl"
            color={done ? 'green' : 'gray'}
            variant={done ? 'filled' : 'light'}
          >
            <IconCheck size={12} />
          </ThemeIcon>
          <Text size="sm">{label}</Text>
        </Group>
        <Text size="sm" fw={600} c={done ? 'green' : 'dimmed'}>
          {current}
          {unit} / {target}
          {unit}
        </Text>
      </Group>
      <Progress value={pct} color={done ? 'green' : 'orange'} size="sm" radius="xl" />
    </div>
  );
}

function ManualItem({
  label,
  checked,
  onToggle,
  loading,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  loading: boolean;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" py={4}>
      <Text size="sm">{label}</Text>
      <Switch
        checked={checked}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        color="green"
        disabled={loading}
      />
    </Group>
  );
}

export default function Readiness() {
  const [data, setData] = useState<ReadinessResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function fetchData() {
    try {
      const d = await apiGet<ReadinessResp>('/readiness');
      setData(d);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal load readiness',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function toggleManual(key: keyof Manual, value: boolean) {
    if (!data) return;
    // Optimistic update
    const prev = data;
    setData({
      ...data,
      manual: { ...data.manual, [key]: value },
    });
    setUpdating(key);
    try {
      const updated = await apiPut<ReadinessResp>('/readiness/manual', {
        key,
        value,
      });
      setData(updated);
    } catch (e) {
      setData(prev); // revert
      notifications.show({
        color: 'red',
        message: e instanceof Error ? e.message : 'Gagal update',
      });
    } finally {
      setUpdating(null);
    }
  }

  if (loading || !data) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  const isReady = data.overall_pct >= 100;
  const ringColor = isReady ? 'green' : data.overall_pct >= 70 ? 'orange' : 'gray';

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Readiness AdSense</Title>
        <Text c="dimmed" size="sm">
          Tracker progress menuju siap apply Google AdSense.
        </Text>
      </div>

      {/* OVERALL PROGRESS */}
      <Card withBorder shadow="xs" radius="md">
        <Group align="center" wrap="nowrap" gap="xl">
          <RingProgress
            size={140}
            thickness={14}
            roundCaps
            sections={[{ value: data.overall_pct, color: ringColor }]}
            label={
              <Stack gap={2} align="center">
                <Text fw={700} size="xl">
                  {data.overall_pct}%
                </Text>
                <Text size="xs" c="dimmed">
                  siap
                </Text>
              </Stack>
            }
          />
          <div style={{ flex: 1 }}>
            <Group gap="xs" mb={6}>
              {isReady ? (
                <Badge color="green" leftSection={<IconRocket size={12} />} size="lg">
                  Siap Apply!
                </Badge>
              ) : (
                <Badge color="gray" size="lg">
                  Belum siap
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {isReady
                ? 'Semua syarat terpenuhi. Saatnya apply AdSense.'
                : `Lanjut kerjakan ${100 - data.overall_pct}% lagi. Tiap langkah di bawah berkontribusi setara ke skor total.`}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              💡 Auto items dihitung dari draft yang status &quot;Published&quot;. Manual items kamu centang sendiri.
            </Text>
          </div>
        </Group>
      </Card>

      {/* KONTEN — AUTO */}
      <Card withBorder shadow="xs" radius="md">
        <Group gap="xs" mb="md">
          <ThemeIcon variant="light" color="orange" size="md">
            <IconFileText size={16} />
          </ThemeIcon>
          <Text fw={600}>Konten</Text>
          <Badge variant="light" size="xs">
            auto
          </Badge>
        </Group>
        <Stack gap="md">
          <AutoItem
            label="Minimal artikel di-publish"
            current={data.auto.published_count}
            target={data.auto.published_target}
          />
          <AutoItem
            label="Rata-rata jumlah kata per artikel"
            current={data.auto.avg_word_count}
            target={data.auto.avg_word_target}
            unit=" kata"
          />
          <AutoItem
            label="Posting konsisten (minggu berturut-turut)"
            current={data.auto.consecutive_weeks}
            target={data.auto.consecutive_target}
            unit=" mgg"
          />
        </Stack>
        {data.auto.published_count === 0 && (
          <Alert color="yellow" variant="light" mt="md">
            Belum ada draft dengan status <b>Published</b>. Buka halaman Draft, ubah
            status draft yang sudah siap → otomatis terhitung di sini.
          </Alert>
        )}
      </Card>

      {/* HALAMAN STATIS — MANUAL */}
      <Card withBorder shadow="xs" radius="md">
        <Group gap="xs" mb="md">
          <ThemeIcon variant="light" color="blue" size="md">
            <IconChecklist size={16} />
          </ThemeIcon>
          <Text fw={600}>Halaman Statis Wajib</Text>
          <Badge variant="light" size="xs">
            manual
          </Badge>
        </Group>
        <Stack gap={0}>
          {(Object.keys(PAGES_LABEL) as (keyof typeof PAGES_LABEL)[]).map((k) => (
            <ManualItem
              key={k}
              label={PAGES_LABEL[k]}
              checked={data.manual[k]}
              onToggle={(v) => toggleManual(k, v)}
              loading={updating === k}
            />
          ))}
        </Stack>
      </Card>

      {/* TEKNIS — MANUAL */}
      <Card withBorder shadow="xs" radius="md">
        <Group gap="xs" mb="md">
          <ThemeIcon variant="light" color="grape" size="md">
            <IconSettings2 size={16} />
          </ThemeIcon>
          <Text fw={600}>Teknis</Text>
          <Badge variant="light" size="xs">
            manual
          </Badge>
        </Group>
        <Stack gap={0}>
          {(Object.keys(TECH_LABEL) as (keyof typeof TECH_LABEL)[]).map((k) => (
            <ManualItem
              key={k}
              label={TECH_LABEL[k]}
              checked={data.manual[k]}
              onToggle={(v) => toggleManual(k, v)}
              loading={updating === k}
            />
          ))}
        </Stack>
      </Card>

      <Alert color="blue" variant="light" icon={<IconTarget size={16} />}>
        Saat skor mencapai 100%, kamu siap apply Google AdSense. Sambil tunggu
        approval, lanjut isi konten — momentum jangan kendor.
      </Alert>
    </Stack>
  );
}
