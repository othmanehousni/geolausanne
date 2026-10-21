import {
  BasketIcon,
  BreadIcon,
  CoffeeIcon,
  ForkKnifeIcon,
  HamburgerIcon,
  KnifeIcon,
  StorefrontIcon,
  TruckIcon,
  type IconProps,
} from "@phosphor-icons/react";
import type { PlaceCategory } from "@/lib/data/types";

const ICONS: Record<PlaceCategory, React.ComponentType<IconProps>> = {
  restaurant: ForkKnifeIcon,
  fast_food: HamburgerIcon,
  cafe: CoffeeIcon,
  bakery: BreadIcon,
  butcher: KnifeIcon,
  grocery: BasketIcon,
  food_truck: TruckIcon,
  other: StorefrontIcon,
};

/** Decorative category glyph; the category name is always shown as text nearby. */
export function CategoryIcon({ category, ...props }: { category: PlaceCategory } & IconProps) {
  const Icon = ICONS[category] ?? StorefrontIcon;
  return <Icon aria-hidden="true" {...props} />;
}
