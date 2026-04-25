import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
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
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const ASPECT_OPTIONS = [
  { value: 'original', label: 'Asli' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:5', label: '4:5' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
];

const ASPECT_TO_NUM: Record<string, number | undefined> = {
  original: undefined,
  '1:1': 1,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:5': 4 / 5,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
};

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

/**
 * Hitung crop default yang BENAR-BENAR fit di dalam image dengan aspect terkunci.
 * Mengisi 90% dari dimensi yang membatasi (width / height).
 *
 * react-image-crop's makeAspectCrop tidak auto-clamp — kalau aspect tidak fit,
 * dia bisa keluar dari batas image (mis: crop 1:1 di landscape → height 160%).
 */
function buildCenterCrop(
  aspectNum: number | undefined,
  imgW: number,
  imgH: number,
): Crop | undefined {
  if (!aspectNum || imgW <= 0 || imgH <= 0) return undefined;

  const mediaAspect = imgW / imgH;
  let cropPxW: number;
  let cropPxH: number;

  if (aspectNum >= mediaAspect) {
    // Crop lebih landscape (atau sama) dari media → batasi pakai width
    cropPxW = imgW * 0.9;
    cropPxH = cropPxW / aspectNum;
  } else {
    // Crop lebih potret dari media → batasi pakai height
    cropPxH = imgH * 0.9;
    cropPxW = cropPxH * aspectNum;
  }

  const widthPct = (cropPxW / imgW) * 100;
  const heightPct = (cropPxH / imgH) * 100;

  return {
    unit: '%',
    width: widthPct,
    height: heightPct,
    x: (100 - widthPct) / 2,
    y: (100 - heightPct) / 2,
  };
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
  const [crop, setCrop] = useState<Crop | undefined>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>();

  const inputUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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
    setCrop(undefined);
    setCompletedCrop(undefined);
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
    } catch {
      notifications.show({
        color: 'red',
        title: 'Gagal load URL',
        message:
          'Mungkin CORS-blocked. Coba upload manual, atau kosongkan file dan klik Process — server akan fetch URL.',
      });
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

  useEffect(() => {
    return () => {
      if (inputUrlRef.current) URL.revokeObjectURL(inputUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  function onImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const aspectNum = ASPECT_TO_NUM[aspect];
    setCrop(buildCenterCrop(aspectNum, width, height));
    setCompletedCrop(undefined);
  }

  // Saat aspect berubah, recompute crop default ke center 90%
  useEffect(() => {
    if (!imgRef.current) return;
    const aspectNum = ASPECT_TO_NUM[aspect];
    const { width, height } = imgRef.current;
    if (!aspectNum) {
      setCrop(undefined);
      setCompletedCrop(undefined);
      return;
    }
    setCrop(buildCenterCrop(aspectNum, width, height));
  }, [aspect]);

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

    // Crop: kirim pixel coords kalau ada region terpilih.
    // Else fallback ke aspect (untuk URL-only, server-fetch flow tanpa preview).
    if (completedCrop && imgRef.current && completedCrop.width > 0) {
      const img = imgRef.current;
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      fd.append('crop_x', String(Math.round(completedCrop.x * scaleX)));
      fd.append('crop_y', String(Math.round(completedCrop.y * scaleY)));
      fd.append('crop_w', String(Math.round(completedCrop.width * scaleX)));
      fd.append('crop_h', String(Math.round(completedCrop.height * scaleY)));
    } else {
      fd.append('aspect', aspect);
    }

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

  const aspectNum = ASPECT_TO_NUM[aspect];
  const livePreviewStyle: React.CSSProperties = {
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
    filter: grayscale ? 'grayscale(100%)' : undefined,
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Image Edit</Title>
        <Text c="dimmed" size="sm">
          Crop draggable, flip, grayscale, convert ke WebP/PNG/JPEG, dan kompres.
        </Text>
      </div>

      <Grid gutter="md">
        {/* INPUT + LIVE PREVIEW */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder shadow="xs" radius="md">
            <Stack gap="sm">
              <Text fw={600} size="sm">
                INPUT & LIVE PREVIEW
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
                  <div
                    style={{
                      maxHeight: 520,
                      overflow: 'auto',
                      display: 'flex',
                      justifyContent: 'center',
                      background: 'var(--mantine-color-default-hover)',
                      borderRadius: 8,
                      padding: 4,
                    }}
                  >
                    <ReactCrop
                      crop={crop}
                      onChange={(_pix, percent) => setCrop(percent)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={aspectNum}
                      keepSelection
                    >
                      <img
                        ref={imgRef}
                        src={inputPreview}
                        alt="Input"
                        onLoad={onImageLoad}
                        style={livePreviewStyle}
                      />
                    </ReactCrop>
                  </div>
                  <Group gap="xs" wrap="wrap">
                    <Badge color="gray">{inputName}</Badge>
                    <Badge variant="light">{fmtBytes(inputSize)}</Badge>
                    {imgRef.current && (
                      <Badge variant="light" color="blue">
                        {imgRef.current.naturalWidth}×{imgRef.current.naturalHeight}
                      </Badge>
                    )}
                    {completedCrop && completedCrop.width > 0 && imgRef.current && (
                      <Badge variant="light" color="orange">
                        crop:{' '}
                        {Math.round(
                          completedCrop.width *
                            (imgRef.current.naturalWidth / imgRef.current.width),
                        )}
                        ×
                        {Math.round(
                          completedCrop.height *
                            (imgRef.current.naturalHeight / imgRef.current.height),
                        )}
                      </Badge>
                    )}
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
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder shadow="xs" radius="md">
            <Stack gap="md">
              <Text fw={600} size="sm">
                OPERASI
              </Text>

              <div>
                <Text size="sm" mb={6} fw={500}>
                  Crop — drag/resize box di preview kiri
                </Text>
                <SegmentedControl
                  value={aspect}
                  onChange={setAspect}
                  data={ASPECT_OPTIONS}
                  fullWidth
                  size="xs"
                />
                <Text size="xs" c="dimmed" mt={4}>
                  &quot;Asli&quot; = tidak crop. Ratio lain = box dengan aspect
                  ratio terkunci.
                </Text>
              </div>

              <div>
                <Text size="sm" mb={6} fw={500}>
                  Flip{' '}
                  <Text component="span" size="xs" c="dimmed">
                    (diterapkan setelah crop saat Process)
                  </Text>
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
                label="Konversi ke grayscale (live preview)"
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
          Process — server akan fetch URL untuk kamu (tapi tanpa live crop preview).
        </Alert>
      )}
    </Stack>
  );
}
