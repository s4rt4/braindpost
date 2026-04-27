import { useEffect, useState } from 'react';
import {
  Badge,
  Card,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  RingProgress,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconBulb,
  IconCalendar,
  IconChartBar,
  IconExternalLink,
  IconFileText,
  IconFlame,
  IconRoute,
  IconSparkles,
  IconTrophy,
} from '@tabler/icons-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';

type DashboardStats = {
  drafts_by_status: Record<string, number>;
  drafts_total: number;
  published_total: number;
  avg_word_count: number;
  streak_current: number;
  streak_longest: number;
  heatmap_12w: Array<{
    year: number;
    week: number;
    label: string;
    count: number;
  }>;
  drafts_per_week_8w: Array<{ label: string; drafts: number }>;
  last_activity: Array<{
    id: number;
    title: string;
    status: string;
    updated_at: string;
    published_url: string | null;
  }>;
  calendar_this_month: number;
  workflow_done: number;
  workflow_total: number;
  ideas_history_total: number;
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'gray',
  revisi: 'yellow',
  siap_publish: 'blue',
  published: 'green',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  revisi: 'Revisi',
  siap_publish: 'Siap Publish',
  published: 'Published',
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} jam lalu`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} hari lalu`;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
}

function HeatmapCell({ count }: { count: number }) {
  const intensity =
    count === 0 ? 0 : count === 1 ? 0.4 : count <= 3 ? 0.7 : 1.0;
  const bg =
    count === 0
      ? 'var(--mantine-color-default-hover)'
      : `rgba(34, 139, 34, ${intensity})`;
  return (
    <div
      title={`${count} posting`}
      style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        background: bg,
        border: '1px solid var(--mantine-color-default-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: count > 0 ? 'white' : 'var(--mantine-color-dimmed)',
      }}
    >
      {count > 0 ? count : ''}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stats = await apiGet<DashboardStats>('/dashboard/stats');
        setData(stats);
      } catch (e) {
        notifications.show({
          color: 'red',
          title: 'Gagal load dashboard',
          message: e instanceof Error ? e.message : 'unknown',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !data) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  const workflowPct =
    data.workflow_total > 0
      ? (data.workflow_done / data.workflow_total) * 100
      : 0;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Dashboard</Title>
        <Text c="dimmed" size="sm">
          Overview produktivitas konten + streak posting + activity terbaru.
        </Text>
      </div>

      {/* Top row — KPIs */}
      <Grid gutter="md">
        <Grid.Col span={{ base: 6, sm: 3 }}>
          <Card withBorder shadow="xs" p="md">
            <Group gap="xs" mb={4}>
              <ThemeIcon variant="light" color="orange" size="sm">
                <IconFlame size={14} />
              </ThemeIcon>
              <Text size="xs" c="dimmed" fw={600}>
                STREAK SAAT INI
              </Text>
            </Group>
            <Text fw={700} size="xl">
              {data.streak_current}{' '}
              <Text component="span" size="sm" fw={400} c="dimmed">
                minggu
              </Text>
            </Text>
            <Text size="xs" c="dimmed">
              Longest: {data.streak_longest} minggu
            </Text>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 6, sm: 3 }}>
          <Card withBorder shadow="xs" p="md">
            <Group gap="xs" mb={4}>
              <ThemeIcon variant="light" color="green" size="sm">
                <IconTrophy size={14} />
              </ThemeIcon>
              <Text size="xs" c="dimmed" fw={600}>
                PUBLISHED
              </Text>
            </Group>
            <Text fw={700} size="xl">
              {data.published_total}
            </Text>
            <Text size="xs" c="dimmed">
              Avg {data.avg_word_count.toLocaleString('id-ID')} kata
            </Text>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 6, sm: 3 }}>
          <Card withBorder shadow="xs" p="md">
            <Group gap="xs" mb={4}>
              <ThemeIcon variant="light" color="blue" size="sm">
                <IconFileText size={14} />
              </ThemeIcon>
              <Text size="xs" c="dimmed" fw={600}>
                TOTAL DRAFT
              </Text>
            </Group>
            <Text fw={700} size="xl">
              {data.drafts_total}
            </Text>
            <Group gap={4} mt={4}>
              {Object.entries(data.drafts_by_status).map(([s, n]) => (
                <Badge
                  key={s}
                  size="xs"
                  variant="light"
                  color={STATUS_COLOR[s] || 'gray'}
                >
                  {n} {STATUS_LABEL[s] || s}
                </Badge>
              ))}
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 6, sm: 3 }}>
          <Card withBorder shadow="xs" p="md">
            <Group gap="xs" mb={4}>
              <ThemeIcon variant="light" color="grape" size="sm">
                <IconCalendar size={14} />
              </ThemeIcon>
              <Text size="xs" c="dimmed" fw={600}>
                CALENDAR (BULAN INI)
              </Text>
            </Group>
            <Text fw={700} size="xl">
              {data.calendar_this_month}
            </Text>
            <Text size="xs" c="dimmed">
              jadwal terdaftar
            </Text>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Heatmap streak 12 minggu */}
      <Card withBorder shadow="xs" radius="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <IconFlame size={18} color="var(--mantine-color-orange-6)" />
            <Text fw={600}>Streak Heatmap — 12 minggu terakhir</Text>
          </Group>
          <Text size="xs" c="dimmed">
            posting per ISO week (kiri = 12 minggu lalu, kanan = sekarang)
          </Text>
        </Group>
        <Group gap={4} wrap="wrap">
          {data.heatmap_12w.map((w, i) => (
            <Stack key={i} gap={2} align="center">
              <HeatmapCell count={w.count} />
              <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
                {w.label}
              </Text>
            </Stack>
          ))}
        </Group>
        {data.streak_current === 0 && (
          <Text size="xs" c="dimmed" mt="md" fs="italic">
            💡 Belum ada streak aktif. Publish artikel minggu ini untuk mulai streak.
          </Text>
        )}
      </Card>

      {/* Bar chart drafts per week + Last activity */}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder shadow="xs" radius="md">
            <Group gap="xs" mb="md">
              <IconChartBar size={18} />
              <Text fw={600}>Draft dibuat — 8 minggu terakhir</Text>
            </Group>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.drafts_per_week_8w}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'var(--mantine-color-body)',
                      border: '1px solid var(--mantine-color-default-border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="drafts"
                    fill="var(--mantine-color-orange-5)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder shadow="xs" radius="md">
            <Group gap="xs" mb="md">
              <IconBolt size={18} />
              <Text fw={600}>Aktivitas Terbaru</Text>
            </Group>
            {data.last_activity.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                Belum ada draft.
              </Text>
            ) : (
              <Stack gap="xs">
                {data.last_activity.map((a) => (
                  <Paper
                    key={a.id}
                    withBorder
                    p="xs"
                    radius="sm"
                    component={Link}
                    to="/drafts"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={500} lineClamp={1}>
                          {a.title}
                        </Text>
                        <Group gap={6} mt={2}>
                          <Badge
                            size="xs"
                            variant="light"
                            color={STATUS_COLOR[a.status] || 'gray'}
                          >
                            {STATUS_LABEL[a.status] || a.status}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {formatRelative(a.updated_at)}
                          </Text>
                        </Group>
                      </div>
                      {a.published_url && (
                        <IconExternalLink
                          size={14}
                          style={{ color: 'var(--mantine-color-green-6)' }}
                        />
                      )}
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      {/* Workflow + Ideas history shortcuts */}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card
            withBorder
            shadow="xs"
            radius="md"
            component={Link}
            to="/workflow"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <IconRoute size={18} />
                <Text fw={600}>Workflow Progress</Text>
              </Group>
              <Text size="sm" fw={600} c="orange">
                {data.workflow_done} / {data.workflow_total}
              </Text>
            </Group>
            <Progress
              value={workflowPct}
              color="orange"
              size="md"
              radius="xl"
            />
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card
            withBorder
            shadow="xs"
            radius="md"
            component={Link}
            to="/ideas"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Group justify="space-between">
              <Group gap="xs">
                <IconBulb size={18} />
                <Text fw={600}>Ideas History</Text>
              </Group>
              <Group gap={4}>
                <IconSparkles size={14} color="var(--mantine-color-orange-6)" />
                <Text size="sm" fw={600}>
                  {data.ideas_history_total} sessions
                </Text>
              </Group>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Total generate ide tersimpan
            </Text>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Mini ring — readiness shortcut bonus */}
      <Card
        withBorder
        shadow="xs"
        radius="md"
        component={Link}
        to="/readiness"
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <Group justify="space-between">
          <Group gap="md">
            <RingProgress
              size={50}
              thickness={5}
              sections={[
                {
                  value: Math.min(
                    100,
                    (data.published_total / 15) * 100,
                  ),
                  color: 'green',
                },
              ]}
            />
            <div>
              <Text fw={600}>Progress menuju AdSense Apply</Text>
              <Text size="xs" c="dimmed">
                {data.published_total} / 15 published · klik untuk full readiness checklist
              </Text>
            </div>
          </Group>
          <IconExternalLink size={16} color="var(--mantine-color-dimmed)" />
        </Group>
      </Card>
    </Stack>
  );
}
