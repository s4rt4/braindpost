import { type FormEvent, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  Image as MantineImage,
  Loader,
  Menu,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconSearch,
  IconWand,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';

type ImageSize = {
  label: string;
  url: string;
  width: number;
};

type ImageItem = {
  id: string;
  provider: 'pexels' | 'unsplash' | 'pixabay';
  url: string;
  thumb: string;
  width: number;
  height: number;
  photographer: string;
  photographer_url: string;
  source_url: string;
  alt: string;
  sizes: ImageSize[];
};

type SearchResp = {
  query: string;
  page: number;
  results: ImageItem[];
  errors: Record<string, string>;
};

const PROVIDER_COLOR: Record<string, string> = {
  pexels: 'teal',
  unsplash: 'dark',
  pixabay: 'green',
};

export default function Images() {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<'all' | 'pexels' | 'unsplash' | 'pixabay'>('all');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<ImageItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [viewer, { open: openViewer, close: closeViewer }] = useDisclosure(false);
  const [active, setActive] = useState<ImageItem | null>(null);

  async function runSearch(
    p: number = 1,
    append: boolean = false,
    providerOverride?: typeof provider,
  ) {
    const useProvider = providerOverride ?? provider;
    if (!query.trim()) {
      notifications.show({ color: 'yellow', message: 'Ketik kata kunci dulu.' });
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const data = await apiGet<SearchResp>(
        `/images/search?q=${encodeURIComponent(query)}&provider=${useProvider}&page=${p}`,
      );
      setResults((prev) => (append ? [...prev, ...data.results] : data.results));
      setErrors(data.errors);
      setPage(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      notifications.show({ color: 'red', title: 'Gagal cari', message: msg });
      if (!append) setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch(1, false);
  }

  function onProviderChange(v: string) {
    const next = v as typeof provider;
    setProvider(next);
    if (query.trim() && hasSearched) {
      runSearch(1, false, next);
    }
  }

  function openImage(item: ImageItem) {
    setActive(item);
    openViewer();
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Image</Title>
        <Text c="dimmed" size="sm">
          Cari stock photo bebas pakai dari Pexels & Unsplash.
        </Text>
      </div>

      <Card withBorder shadow="xs" radius="md">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <TextInput
              placeholder="mis: laptop, kopi pagi, gunung indonesia, urban office..."
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              leftSection={<IconSearch size={16} />}
              size="md"
            />
            <Group justify="space-between" wrap="wrap">
              <SegmentedControl
                value={provider}
                onChange={onProviderChange}
                data={[
                  { value: 'all', label: 'Semua' },
                  { value: 'pexels', label: 'Pexels' },
                  { value: 'unsplash', label: 'Unsplash' },
                  { value: 'pixabay', label: 'Pixabay' },
                ]}
              />
              <Button
                type="submit"
                loading={loading}
                leftSection={<IconSearch size={16} />}
              >
                Cari
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>

      {Object.keys(errors).length > 0 && (
        <Alert color="yellow" variant="light" title="Ada provider yang error">
          <Stack gap={4}>
            {Object.entries(errors).map(([name, msg]) => (
              <Text key={name} size="sm">
                <b>{name}:</b> {msg}
              </Text>
            ))}
            <Text size="xs" c="dimmed">
              Cek halaman <b>Setting</b> untuk isi API key yang missing.
            </Text>
          </Stack>
        </Alert>
      )}

      {loading && results.length === 0 && (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      )}

      {!loading && hasSearched && results.length === 0 && Object.keys(errors).length === 0 && (
        <Card withBorder>
          <Text c="dimmed" ta="center" py="md">
            Tidak ada hasil untuk &quot;{query}&quot;.
          </Text>
        </Card>
      )}

      {results.length > 0 && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
            {results.map((item) => (
              <Card
                key={`${item.provider}-${item.id}`}
                withBorder
                padding={0}
                radius="md"
                style={{ cursor: 'pointer', overflow: 'hidden' }}
                onClick={() => openImage(item)}
              >
                <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden' }}>
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
                    color={PROVIDER_COLOR[item.provider]}
                    variant="filled"
                    style={{ position: 'absolute', top: 6, right: 6 }}
                  >
                    {item.provider}
                  </Badge>
                </div>
                <Text size="xs" c="dimmed" p={6} truncate>
                  📷 {item.photographer || 'Unknown'}
                </Text>
              </Card>
            ))}
          </SimpleGrid>

          <Group justify="center">
            <Button
              variant="light"
              loading={loading}
              onClick={() => runSearch(page + 1, true)}
            >
              Load lebih banyak (page {page + 1})
            </Button>
          </Group>
        </>
      )}

      <Modal
        opened={viewer}
        onClose={closeViewer}
        size="xl"
        title={active ? `${active.provider} · ${active.width}×${active.height}` : ''}
        centered
      >
        {active && (
          <Stack gap="md">
            <MantineImage
              src={active.url}
              alt={active.alt}
              radius="md"
              fit="contain"
              mah={500}
            />
            {active.alt && (
              <Text size="sm" c="dimmed" fs="italic">
                &quot;{active.alt}&quot;
              </Text>
            )}
            <Group gap="xs">
              <Text size="sm">
                📷{' '}
                <Anchor href={active.photographer_url} target="_blank" size="sm">
                  {active.photographer}
                </Anchor>{' '}
                via{' '}
                <Anchor href={active.source_url} target="_blank" size="sm">
                  {active.provider}
                </Anchor>
              </Text>
            </Group>
            <Group>
              <Menu shadow="md" position="bottom-start">
                <Menu.Target>
                  <Button
                    variant="filled"
                    leftSection={<IconDownload size={16} />}
                    rightSection={<IconChevronDown size={14} />}
                  >
                    Download
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Pilih ukuran</Menu.Label>
                  {active.sizes.map((s) => (
                    <Menu.Item
                      key={s.label}
                      component="a"
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.label}
                      {s.width > 0 && (
                        <Text component="span" size="xs" c="dimmed" ml={6}>
                          {s.width}px
                        </Text>
                      )}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>

              <Menu shadow="md" position="bottom-start">
                <Menu.Target>
                  <Button
                    variant="light"
                    leftSection={<IconCopy size={16} />}
                    rightSection={<IconChevronDown size={14} />}
                  >
                    Copy URL
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Pilih ukuran untuk copy</Menu.Label>
                  {active.sizes.map((s) => (
                    <CopyButton key={s.label} value={s.url} timeout={1500}>
                      {({ copied, copy }) => (
                        <Menu.Item
                          onClick={(e) => {
                            e.preventDefault();
                            copy();
                          }}
                          leftSection={
                            copied ? <IconCheck size={14} /> : <IconCopy size={14} />
                          }
                          closeMenuOnClick={false}
                        >
                          {copied ? 'Tersalin!' : s.label}
                          {s.width > 0 && (
                            <Text component="span" size="xs" c="dimmed" ml={6}>
                              {s.width}px
                            </Text>
                          )}
                        </Menu.Item>
                      )}
                    </CopyButton>
                  ))}
                </Menu.Dropdown>
              </Menu>

              <Button
                component={Link}
                to={`/image-edit?url=${encodeURIComponent(active.url)}`}
                variant="light"
                leftSection={<IconWand size={16} />}
              >
                Edit
              </Button>
              <Button
                component="a"
                href={active.source_url}
                target="_blank"
                rel="noopener noreferrer"
                variant="subtle"
                leftSection={<IconExternalLink size={16} />}
              >
                Lihat di {active.provider}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
