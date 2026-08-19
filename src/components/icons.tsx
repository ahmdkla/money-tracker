import {
  Bandaids,
  Bank,
  Barbell,
  Basket,
  Bicycle,
  BookOpen,
  Briefcase,
  Bus,
  Camera,
  Car,
  Coffee,
  Confetti,
  CreditCard,
  CurrencyDollar,
  DeviceMobile,
  Dog,
  FilmSlate,
  ForkKnife,
  GameController,
  Gift,
  GraduationCap,
  HandCoins,
  Heartbeat,
  House,
  Leaf,
  Lightning,
  MusicNotes,
  PiggyBank,
  Receipt,
  Repeat,
  ShoppingCart,
  Suitcase,
  Tag,
  Ticket,
  TShirt,
  Wallet,
  Wrench,
  type Icon,
} from '@phosphor-icons/react';

/**
 * The icon set a category can use.
 *
 * One family, one stroke weight, referenced by name so a category survives a
 * round trip through export and import. Explicitly listed rather than pulled
 * from the whole Phosphor barrel, which keeps the bundle to the icons that
 * are actually reachable.
 */
export const CATEGORY_ICONS: Record<string, Icon> = {
  Coffee,
  ForkKnife,
  ShoppingCart,
  Basket,
  House,
  Lightning,
  Car,
  Bus,
  Bicycle,
  Suitcase,
  Heartbeat,
  Bandaids,
  Barbell,
  Repeat,
  Receipt,
  Briefcase,
  Bank,
  CreditCard,
  DeviceMobile,
  PiggyBank,
  Wallet,
  CurrencyDollar,
  HandCoins,
  GraduationCap,
  BookOpen,
  MusicNotes,
  FilmSlate,
  GameController,
  Camera,
  TShirt,
  Gift,
  Confetti,
  Ticket,
  Dog,
  Leaf,
  Wrench,
  Tag,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** Unknown names resolve to a neutral tag rather than a hole in the layout. */
export function iconFor(name: string): Icon {
  return CATEGORY_ICONS[name] ?? Tag;
}
