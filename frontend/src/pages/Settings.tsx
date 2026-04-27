import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconDeviceFloppy,
  IconKey,
  IconPlugConnected,
  IconX,
} from '@tabler/icons-react';
import { apiGet, apiPut } from '../api/client';

type SettingItem = {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  category: string;
  active: boolean;
  description: string;
  placeholder: string;
  is_set: boolean;
  value_preview: string;
  options: string[];
};

export default function Settings() {
  const [items, setItems] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function fetchAll() {
    setLoading(true);
    try {
      const data = await apiGet<SettingItem[]>('/settings');
      setItems(data);
      setDrafts({});
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal load settings',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function setDraft(key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAll() {
    const changed = Object.entries(drafts).filter(([, v]) => v !== '');
    if (changed.length === 0) {
      notifications.show({ color: 'yellow', message: 'Tidak ada perubahan.' });
      return;
    }
    setSaving(true);
    try {
      await apiPut('/settings', { values: Object.fromEntries(changed) });
      notifications.show({
        color: 'teal',
        icon: <IconCheck size={16} />,
        message: `${changed.length} setting tersimpan.`,
      });
      await fetchAll();
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal simpan',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setSaving(false);
    }
  }

  async function clearOne(key: string) {
    setSaving(true);
    try {
      await apiPut('/settings', { values: { [key]: '' } });
      notifications.show({ color: 'teal', message: 'Setting di-clear.' });
      await fetchAll();
    } catch (e) {
      notifications.show({
        color: 'red',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const g: Record<string, SettingItem[]> = {};
    for (const item of items) {
      (g[item.category] ??= []).push(item);
    }
    return g;
  }, [items]);

  const dirtyCount = Object.values(drafts).filter((v) => v !== '').length;

  type LaravelHealthResult = {
    ok: boolean;
    state:
      | 'production'
      | 'staging'
      | 'connected'
      | 'invalid_token'
      | 'unreachable'
      | 'timeout'
      | 'rate_limited'
      | 'endpoint_not_found'
      | 'unexpected'
      | 'non_json'
      | 'error';
    status_code?: number;
    message: string;
    blog_name?: string;
    blog_url?: string;
    blog_mode?: string;
    api_version?: string;
    timezone?: string;
    server_time?: string;
    limits?: {
      rate_limit_per_minute?: number;
      max_image_size_mb?: number;
      image_download_timeout_seconds?: number;
    };
  };

  const [testingConnection, setTestingConnection] = useState(false);
  const [healthResult, setHealthResult] = useState<LaravelHealthResult | null>(
    null,
  );

  async function testLaravelConnection() {
    setTestingConnection(true);
    try {
      const result = await apiGet<LaravelHealthResult>(
        '/publishing/laravel/test-connection',
      );
      setHealthResult(result);
    } catch (e) {
      setHealthResult({
        ok: false,
        state: 'error',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setTestingConnection(false);
    }
  }

  const STATE_BADGE: Record<
    LaravelHealthResult['state'],
    { color: string; label: string }
  > = {
    production: { color: 'green', label: 'AKTIF' },
    staging: { color: 'yellow', label: 'STAGING' },
    connected: { color: 'teal', label: 'CONNECTED' },
    invalid_token: { color: 'red', label: 'INVALID TOKEN' },
    unreachable: { color: 'red', label: 'TIDAK TERHUBUNG' },
    timeout: { color: 'orange', label: 'TIMEOUT' },
    rate_limited: { color: 'orange', label: 'RATE LIMITED' },
    endpoint_not_found: { color: 'red', label: 'ENDPOINT 404' },
    unexpected: { color: 'red', label: 'UNEXPECTED' },
    non_json: { color: 'red', label: 'NON-JSON' },
    error: { color: 'red', label: 'ERROR' },
  };

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Setting</Title>
        <Text c="dimmed" size="sm">
          API keys dan konfigurasi provider. Disimpan lokal di SQLite — tidak
          dikirim ke mana-mana selain ke API yang bersangkutan.
        </Text>
      </div>

      {Object.entries(grouped).map(([category, categoryItems]) => {
        const anyActive = categoryItems.some((i) => i.active);
        const isPublishing = category === 'Publishing';
        const allPublishingSet =
          isPublishing && categoryItems.every((i) => i.is_set);
        return (
          <Card key={category} withBorder shadow="xs" radius="md">
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <IconKey size={16} />
                <Text fw={600}>{category}</Text>
              </Group>
              <Group gap="xs">
                {isPublishing && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="blue"
                    leftSection={<IconPlugConnected size={12} />}
                    onClick={testLaravelConnection}
                    loading={testingConnection}
                    disabled={!allPublishingSet}
                  >
                    Test Connection
                  </Button>
                )}
                <Badge color={anyActive ? 'green' : 'gray'} variant="light" size="sm">
                  {anyActive ? 'Aktif' : 'Belum dipakai'}
                </Badge>
              </Group>
            </Group>

            {/* Rich health result display untuk kategori Publishing */}
            {isPublishing && healthResult && (
              <Card
                withBorder
                p="sm"
                mb="md"
                bg={
                  healthResult.ok
                    ? 'var(--mantine-color-green-light)'
                    : 'var(--mantine-color-red-light)'
                }
              >
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <Badge
                      color={STATE_BADGE[healthResult.state].color}
                      variant="filled"
                      size="sm"
                    >
                      {STATE_BADGE[healthResult.state].label}
                    </Badge>
                    {healthResult.blog_name && (
                      <Text size="sm" fw={500}>
                        {healthResult.blog_name}
                      </Text>
                    )}
                  </Group>
                  {healthResult.api_version && (
                    <Badge size="xs" variant="light" color="gray">
                      api {healthResult.api_version}
                    </Badge>
                  )}
                </Group>

                <Text size="xs" c="dimmed" mb={healthResult.ok ? 'xs' : 0}>
                  {healthResult.message}
                </Text>

                {healthResult.state === 'staging' && (
                  <Alert color="yellow" variant="light" p="xs" mt="xs">
                    <Text size="xs">
                      ⚠️ Mode staging — artikel TIDAK ke-index Google. Switch ke
                      production URL untuk publish beneran.
                    </Text>
                  </Alert>
                )}

                {healthResult.ok && healthResult.limits && (
                  <Group gap="xs" mt="xs" wrap="wrap">
                    {healthResult.blog_url && (
                      <Badge size="xs" variant="light" color="gray">
                        🔗 {healthResult.blog_url}
                      </Badge>
                    )}
                    {healthResult.timezone && (
                      <Badge size="xs" variant="light" color="gray">
                        🕒 {healthResult.timezone}
                      </Badge>
                    )}
                    {healthResult.limits.rate_limit_per_minute && (
                      <Badge size="xs" variant="light" color="gray">
                        ⚡ {healthResult.limits.rate_limit_per_minute}/min
                      </Badge>
                    )}
                    {healthResult.limits.max_image_size_mb && (
                      <Badge size="xs" variant="light" color="gray">
                        🖼️ max {healthResult.limits.max_image_size_mb}MB/img
                      </Badge>
                    )}
                  </Group>
                )}
              </Card>
            )}

            <Stack gap="md">
              {categoryItems.map((item) => {
                const draft = drafts[item.key] ?? '';
                return (
                  <div key={item.key}>
                    <Group justify="space-between" mb={4} wrap="nowrap">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Group gap={6}>
                          <Text size="sm" fw={500}>
                            {item.label}
                          </Text>
                          {item.is_set && (
                            <Badge size="xs" color="green" variant="light">
                              tersimpan
                            </Badge>
                          )}
                          {!item.active && (
                            <Badge size="xs" color="gray" variant="outline">
                              belum aktif
                            </Badge>
                          )}
                        </Group>
                        {item.description && (
                          <Text size="xs" c="dimmed">
                            {item.description}
                          </Text>
                        )}
                      </div>
                      {item.is_set && (
                        <Button
                          variant="subtle"
                          color="red"
                          size="compact-xs"
                          onClick={() => clearOne(item.key)}
                          disabled={saving}
                        >
                          Clear
                        </Button>
                      )}
                    </Group>
                    {item.type === 'select' ? (
                      <Select
                        data={item.options.map((o) => ({ value: o, label: o }))}
                        placeholder={
                          item.is_set
                            ? `Aktif: ${item.value_preview}`
                            : item.placeholder || 'Pilih...'
                        }
                        value={draft || null}
                        onChange={(v) => setDraft(item.key, v ?? '')}
                        clearable={false}
                      />
                    ) : item.type === 'password' ? (
                      <PasswordInput
                        placeholder={
                          item.is_set
                            ? `${item.value_preview}  (kosongkan = tidak diubah)`
                            : item.placeholder || 'Belum di-set'
                        }
                        value={draft}
                        onChange={(e) => setDraft(item.key, e.currentTarget.value)}
                      />
                    ) : (
                      <TextInput
                        placeholder={
                          item.is_set
                            ? `${item.value_preview}  (kosongkan = tidak diubah)`
                            : item.placeholder || 'Belum di-set'
                        }
                        value={draft}
                        onChange={(e) => setDraft(item.key, e.currentTarget.value)}
                      />
                    )}
                  </div>
                );
              })}
            </Stack>
          </Card>
        );
      })}

      <Alert color="blue" variant="light">
        💡 Untuk password fields, value tersembunyi setelah disimpan. Kalau mau
        ganti — ketik value baru, klik Simpan.
      </Alert>

      <Group justify="flex-end">
        <Button
          onClick={saveAll}
          loading={saving}
          disabled={dirtyCount === 0}
          leftSection={<IconDeviceFloppy size={16} />}
        >
          Simpan {dirtyCount > 0 && `(${dirtyCount})`}
        </Button>
      </Group>
    </Stack>
  );
}
