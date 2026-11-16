import {
  BarChart3,
  Bell,
  BellOff,
  Book,
  Clapperboard,
  Film,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  Image,
  Lock,
  LayoutGrid,
  List,
  MessageCircle,
  Pencil,
  type LucideIcon,
  Rss,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Tv,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function makeIcon(Component: LucideIcon, displayName: string) {
  function Icon({ size = 16, ...rest }: IconProps) {
    return (
      <Component
        aria-hidden
        focusable="false"
        size={size}
        strokeWidth={1.75}
        {...rest}
      />
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const IconBell = makeIcon(Bell, "IconBell");
export const IconBellOff = makeIcon(BellOff, "IconBellOff");
export const IconPeople = makeIcon(Users, "IconPeople");
export const IconX = makeIcon(X, "IconX");
export const IconSubscriptions = makeIcon(UserRoundCheck, "IconSubscriptions");
export const IconHeart = makeIcon(Heart, "IconHeart");
export const IconSparkles = makeIcon(Sparkles, "IconSparkles");
export const IconFeed = makeIcon(Rss, "IconFeed");
export const IconCollection = makeIcon(Folder, "IconCollection");
export const IconGlobe = makeIcon(Globe, "IconGlobe");
export const IconLock = makeIcon(Lock, "IconLock");
export const IconPencil = makeIcon(Pencil, "IconPencil");
export const IconList = makeIcon(List, "IconList");
export const IconFilm = makeIcon(Film, "IconFilm");
export const IconTv = makeIcon(Tv, "IconTv");
export const IconAnime = makeIcon(Clapperboard, "IconAnime");
export const IconGame = makeIcon(Gamepad2, "IconGame");
export const IconBook = makeIcon(Book, "IconBook");
export const IconImage = makeIcon(Image, "IconImage");
export const IconOther = makeIcon(LayoutGrid, "IconOther");
export const IconTag = makeIcon(Tag, "IconTag");
export const IconStats = makeIcon(BarChart3, "IconStats");
export const IconSettings = makeIcon(SlidersHorizontal, "IconSettings");
export const IconTrash = makeIcon(Trash2, "IconTrash");
export const IconMessage = makeIcon(MessageCircle, "IconMessage");

export function IconHeartFilled({ size = 16, ...rest }: IconProps) {
  return (
    <Heart
      aria-hidden
      fill="currentColor"
      focusable="false"
      size={size}
      strokeWidth={1.75}
      {...rest}
    />
  );
}
