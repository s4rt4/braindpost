import { useState } from 'react';
import {
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSparkles } from '@tabler/icons-react';
import { apiPost } from '../api/client';

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
  result: string;
  created_at: string;
};

export default function Ideas() {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [audience, setAudience] = useState<string>(AUDIENCES[0]);
  const [specific, setSpecific] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<IdeasResponse>('/ideas/generate', {
        category,
        audience,
        specific_topic: specific,
      });
      setResult(data.result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal generate ide';
      notifications.show({ color: 'red', title: 'Error', message: msg });
    } finally {
      setLoading(false);
    }
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
          <Button
            onClick={generate}
            loading={loading}
            leftSection={<IconSparkles size={16} />}
            maw={220}
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

      {result && (
        <Card withBorder shadow="xs" radius="md">
          <Title order={4} mb="sm">
            Hasil
          </Title>
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
    </Stack>
  );
}
