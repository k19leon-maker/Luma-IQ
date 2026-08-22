import {
  Bot,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  Compass,
  FolderKanban,
  GraduationCap,
  ListTodo,
  MessageCircleMore,
  PackageOpen,
  PenLine,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { NavigationIconId } from './navigation.types';

const ICONS: Record<NavigationIconId, LucideIcon> = {
  'ai-dialog': MessageCircleMore,
  tasks: ListTodo,
  'content-plan': CalendarDays,
  projects: FolderKanban,
  strategy: Compass,
  products: Boxes,
  packaging: PackageOpen,
  content: PenLine,
  chatbots: Bot,
  analytics: ChartNoAxesCombined,
  education: GraduationCap,
  settings: Settings,
};

interface NavigationIconProps {
  icon: NavigationIconId;
  size?: number;
}

export default function NavigationIcon({ icon, size = 22 }: NavigationIconProps) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}
