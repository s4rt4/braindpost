import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconDeviceFloppy, IconKey } from '@tabler/icons-react';
import { apiGet, apiPut } from '../api/client';

type SettingItem = {
  key: string;
  label: string;
  type: 'text' | 'password';
  category: string;
  active: boolean;
  description: string;
  placeholder: string;
  is_set: boolean;
  value_preview: string;
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
        return (
          <Card key={category} withBorder shadow="xs" radius="md">
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <IconKey size={16} />
                <Text fw={600}>{category}</Text>
              </Group>
              <Badge color={anyActive ? 'green' : 'gray'} variant="light" size="sm">
                {anyActive ? 'Aktif' : 'Belum dipakai'}
              </Badge>
            </Group>

            <Stack gap="md">
              {categoryItems.map((item) => {
                const draft = drafts[item.key] ?? '';
                const Input = item.type === 'password' ? PasswordInput : TextInput;
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
                    <Input
                      placeholder={
                        item.is_set
                          ? `${item.value_preview}  (kosongkan = tidak diubah)`
                          : item.placeholder || 'Belum di-set'
                      }
                      value={draft}
                      onChange={(e) => setDraft(item.key, e.currentTarget.value)}
                      disabled={!item.active && !item.is_set ? false : false}
                    />
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
