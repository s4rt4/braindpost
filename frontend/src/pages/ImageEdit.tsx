import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  Grid,
  Group,
  Image as MantineImage,
  NumberInput,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconDownload,
  IconFlipHorizontal,
  IconFlipVertical,
  IconPhoto,
  IconUpload,
  IconWand,
} from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';

const ASPECT_OPTIONS = [
  { value: 'original', label: 'Asli' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:5', label: '4:5' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
];

const FORMAT_OPTIONS = [
  { value: 'webp', label: 'WebP' },
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
];

type Flip = '' | 'horizontal' | 'vertical';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function ImageEdit() {
  const [searchParams] = useSearchParams();
  const initialUrl = searchParams.get('url');

  const [inputBlob, setInputBlob] = useState<Blob | null>(null);
  const [inputPreview, setInputPreview] = useState<string | null>(null);
  const [inputSize, setInputSize] = useState(0);
  const [inputName, setInputName] = useState('image');

  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [processing, setProcessing] = useState(false);

  const [aspect, setAspect] = useState('original');
  const [flip, setFlip] = useState<Flip>('');
  const [grayscale, setGrayscale] = useState(false);
  const [maxWidth, setMaxWidth] = useState<number | string>('');
  const [fmt, setFmt] = useState('webp');
  const [quality, setQuality] = useState(85);

  const [urlInput, setUrlInput] = useState(initialUrl ?? '');
  const inputUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);

  function setInputFromBlob(blob: Blob, name = 'image') {
    if (inputUrlRef.current) URL.revokeObjectURL(inputUrlRef.current);
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = null;
    }
    const url = URL.createObjectURL(blob);
    inputUrlRef.current = url;
    setInputBlob(blob);
    setInputPreview(url);
    setInputSize(blob.size);
    setInputName(name);
    setOutputUrl(null);
    setOutputSize(0);
  }

  async function loadFromUrl(url: string) {
    if (!url.trim()) {
      notifications.show({ color: 'yellow', message: 'Masukkan URL gambar.' });
      return;
    }
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const guessedName = url.split('/').pop()?.split('?')[0] || 'image';
      setInputFromBlob(blob, guessedName);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Gagal load URL',
        message:
          'Mungkin CORS-blocked. Coba upload manual, atau biarkan server fetch saat Process (kosongkan file).',
      });
      // fallback: clear file blob, keep urlInput so server fetches at process time
      setInputBlob(null);
      setInputPreview(null);
      setInputSize(0);
    }
  }

  function onFileChange(file: File | null) {
    if (!file) return;
    setInputFromBlob(file, file.name);
    setUrlInput('');
  }

  useEffect(() => {
    if (initialUrl) loadFromUrl(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (inputUrlRef.current) URL.revokeObjectURL(inputUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  async function runProcess() {
    if (!inputBlob && !urlInput.trim()) {
      notifications.show({
        color: 'yellow',
        message: 'Upload gambar atau isi URL dulu.',
      });
      return;
    }
    setProcessing(true);
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = null;
    }
    setOutputUrl(null);

    const fd = new FormData();
    if (inputBlob) {
      fd.append('file', inputBlob, inputName);
    } else {
      fd.append('source_url', urlInput);
    }
    fd.append('aspect', aspect);
    if (flip) fd.append('flip', flip);
    fd.append('grayscale', String(grayscale));
    if (maxWidth && Number(maxWidth) > 0) fd.append('max_width', String(maxWidth));
    fd.append('fmt', fmt);
    fd.append('quality', String(quality));

    try {
      const resp = await fetch('/api/images/process', { method: 'POST', body: fd });
      if (!resp.ok) {
        let detail = `${resp.status}`;
        try {
          const data = await resp.json();
          detail = data.detail || JSON.stringify(data);
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      outputUrlRef.current = url;
      setOutputUrl(url);
      setOutputSize(blob.size);
      notifications.show({
        color: 'teal',
        icon: <IconCheck size={16} />,
        message: `Selesai: ${fmtBytes(blob.size)}`,
      });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Process gagal',
        message: e instanceof Error ? e.message : 'unknown',
      });
    } finally {
      setProcessing(false);
    }
  }

  function downloadOutput() {
    if (!outputUrl) return;
    const a = document.createElement('a');
    const baseName = inputName.replace(/\.[^.]+$/, '') || 'braindpost';
    a.href = outputUrl;
    a.download = `${baseName}-edit.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const compressionPct =
    inputSize > 0 && outputSize > 0
      ? Math.round((1 - outputSize / inputSize) * 100)
      : null;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Image Edit</Title>
        <Text c="dimmed" size="sm">
          Crop, flip, grayscale, convert ke WebP/PNG/JPEG, dan kompres.
        </Text>
      </div>

      <Grid gutter="md">
        {/* INPUT */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder shadow="xs" radius="md">
            <Stack gap="sm">
              <Text fw={600} size="sm">
                INPUT
              </Text>
              <FileInput
                placeholder="Upload gambar dari disk"
                leftSection={<IconUpload size={16} />}
                accept="image/*"
                onChange={onFileChange}
                clearable
              />
              <Text size="xs" c="dimmed" ta="center">
                — atau —
              </Text>
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  placeholder="URL gambar"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button variant="light" onClick={() => loadFromUrl(urlInput)}>
                  Load
                </Button>
              </Group>

              {inputPreview ? (
                <>
                  <MantineImage
                    src={inputPreview}
                    alt="Input"
                    fit="contain"
                    mah={300}
                    radius="md"
                  />
                  <Group gap="xs">
                    <Badge color="gray">{inputName}</Badge>
                    <Badge variant="light">{fmtBytes(inputSize)}</Badge>
                  </Group>
                </>
              ) : (
                <Card withBorder bg="var(--mantine-color-default-hover)">
                  <Group justify="center" py="md" c="dimmed">
                    <IconPhoto size={20} />
                    <Text size="sm">Belum ada gambar</Text>
                  </Group>
                </Card>
              )}
            </Stack>
          </Card>
        </Grid.Col>

        {/* OPERATIONS */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder shadow="xs" radius="md">
            <Stack gap="md">
              <Text fw={600} size="sm">
                OPERASI
              </Text>

              <div>
                <Text size="sm" mb={6} fw={500}>
                  Crop (center crop ke aspect ratio)
                </Text>
                <SegmentedControl
                  value={aspect}
                  onChange={setAspect}
                  data={ASPECT_OPTIONS}
                  fullWidth
                  size="xs"
                />
              </div>

              <div>
                <Text size="sm" mb={6} fw={500}>
                  Flip
                </Text>
                <Group gap="xs">
                  <Button
                    variant={flip === 'horizontal' ? 'filled' : 'light'}
                    leftSection={<IconFlipHorizontal size={16} />}
                    onClick={() =>
                      setFlip(flip === 'horizontal' ? '' : 'horizontal')
                    }
                    size="xs"
                  >
                    Horizontal
                  </Button>
                  <Button
                    variant={flip === 'vertical' ? 'filled' : 'light'}
                    leftSection={<IconFlipVertical size={16} />}
                    onClick={() =>
                      setFlip(flip === 'vertical' ? '' : 'vertical')
                    }
                    size="xs"
                  >
                    Vertical
                  </Button>
                </Group>
              </div>

              <Switch
                label="Konversi ke grayscale"
                checked={grayscale}
                onChange={(e) => setGrayscale(e.currentTarget.checked)}
              />

              <NumberInput
                label="Max width (px) — opsional, untuk resize"
                placeholder="Kosong = ukuran asli"
                value={maxWidth}
                onChange={setMaxWidth}
                min={50}
                max={6000}
                step={100}
              />

              <div>
                <Text size="sm" mb={6} fw={500}>
                  Format output
                </Text>
                <SegmentedControl
                  value={fmt}
                  onChange={setFmt}
                  data={FORMAT_OPTIONS}
                  fullWidth
                />
              </div>

              {fmt !== 'png' && (
                <div>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm">Quality</Text>
                    <Text size="sm" fw={600}>
                      {quality}
                    </Text>
                  </Group>
                  <Slider value={quality} onChange={setQuality} min={1} max={100} />
                </div>
              )}

              <Button
                onClick={runProcess}
                loading={processing}
                disabled={!inputBlob && !urlInput.trim()}
                leftSection={<IconWand size={16} />}
                size="md"
              >
                Process
              </Button>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {/* OUTPUT */}
      {outputUrl && (
        <Card withBorder shadow="xs" radius="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap="xs">
                <Text fw={600} size="sm">
                  OUTPUT
                </Text>
                <Badge color="orange" variant="light">
                  .{fmt}
                </Badge>
                <Badge variant="light">{fmtBytes(outputSize)}</Badge>
                {compressionPct !== null && compressionPct > 0 && (
                  <Badge color="green" variant="light">
                    -{compressionPct}% vs input
                  </Badge>
                )}
              </Group>
              <Button
                size="sm"
                leftSection={<IconDownload size={14} />}
                onClick={downloadOutput}
              >
                Download
              </Button>
            </Group>
            <MantineImage
              src={outputUrl}
              alt="Output"
              fit="contain"
              mah={520}
              radius="md"
            />
          </Stack>
        </Card>
      )}

      {!outputUrl && (
        <Alert color="blue" variant="light">
          💡 Tip: kalau load URL gagal karena CORS, kosongkan file input dan klik
          Process — server akan fetch URL-nya untuk kamu.
        </Alert>
      )}
    </Stack>
  );
}
