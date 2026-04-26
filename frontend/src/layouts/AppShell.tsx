import {
  ActionIcon,
  AppShell,
  Group,
  Image,
  NavLink,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  IconBulb,
  IconCalendar,
  IconMoon,
  IconPencil,
  IconPhoto,
  IconRoute,
  IconSettings,
  IconSun,
  IconSunMoon,
  IconTarget,
  IconWand,
} from '@tabler/icons-react';

const NAV = [
  { path: '/readiness', label: 'Readiness', icon: IconTarget },
  { path: '/workflow', label: 'Workflow', icon: IconRoute },
  { path: '/ideas', label: 'Ide Topik', icon: IconBulb },
  { path: '/drafts', label: 'Draft', icon: IconPencil },
  { path: '/calendar', label: 'Calendar', icon: IconCalendar },
  { path: '/images', label: 'Image', icon: IconPhoto },
  { path: '/image-edit', label: 'Image Edit', icon: IconWand },
];

const NAV_BOTTOM = [
  { path: '/settings', label: 'Setting', icon: IconSettings },
];

function ColorSchemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const next = colorScheme === 'light' ? 'dark' : colorScheme === 'dark' ? 'auto' : 'light';
  const labels: Record<string, string> = {
    light: 'Mode terang',
    dark: 'Mode gelap',
    auto: 'Mengikuti sistem',
  };
  const Icon = colorScheme === 'light' ? IconSun : colorScheme === 'dark' ? IconMoon : IconSunMoon;

  return (
    <Tooltip label={`${labels[colorScheme]} → klik untuk ${labels[next].toLowerCase()}`}>
      <ActionIcon
        variant="default"
        size="lg"
        radius="md"
        onClick={() => setColorScheme(next)}
        aria-label="Toggle color scheme"
      >
        <Icon size={18} stroke={1.6} />
      </ActionIcon>
    </Tooltip>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'sm' }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" gap="sm" justify="space-between">
          <Group gap="sm">
            <Image src="/brainpost.svg" h={32} w={32} alt="Braindpost" />
            <div>
              <Text fw={700} size="lg" lh={1}>
                Braindpost
              </Text>
              <Text size="xs" c="dimmed" lh={1.4}>
                AI content workspace
              </Text>
            </div>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <div style={{ flex: 1 }}>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                label={item.label}
                leftSection={<Icon size={18} stroke={1.6} />}
                active={location.pathname === item.path}
                onClick={() => navigate(item.path)}
                variant="filled"
              />
            );
          })}
        </div>
        <div>
          {NAV_BOTTOM.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                label={item.label}
                leftSection={<Icon size={18} stroke={1.6} />}
                active={location.pathname === item.path}
                onClick={() => navigate(item.path)}
                variant="filled"
              />
            );
          })}
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
