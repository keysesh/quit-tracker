// What the person used. Drives the unit words, the defaults, and which health
// milestones apply (carbon-monoxide and lung milestones only apply to smoked products).

export type Product = 'bowls' | 'cigarettes' | 'cigars' | 'vape' | 'pouches';

export interface ProductInfo {
  label: string;
  unit: string;
  units: string;
  container: string;
  perContainer: number;
  cost: number;
  perDay: number;
  /** Minutes one unit takes out of your day (0 = don't show "time back"). */
  minutes: number;
  /** Burned tobacco: carbon monoxide, tar, lung recovery all apply. */
  smoked: boolean;
  /** Extra guidance under the cost fields. */
  hint?: string;
}

export const PRODUCTS: Record<Product, ProductInfo> = {
  // Includes rolling the tobacco out of cigarettes and smoking it in a bowl: bought by the pack, smoked by the bowl.
  bowls: { label: 'Tobacco bowls', unit: 'bowl', units: 'bowls', container: 'pack', perContainer: 20, cost: 10, perDay: 10, minutes: 7, smoked: true, hint: 'Rolling cigarette tobacco into a bowl? Use what a pack costs and how many bowls you get from one pack.' },
  cigarettes: { label: 'Cigarettes', unit: 'cigarette', units: 'cigarettes', container: 'pack', perContainer: 20, cost: 10, perDay: 15, minutes: 7, smoked: true },
  cigars: { label: 'Cigars or cigarillos', unit: 'cigar', units: 'cigars', container: 'pack', perContainer: 5, cost: 8, perDay: 3, minutes: 20, smoked: true },
  vape: { label: 'Vape', unit: 'pod', units: 'pods', container: 'pack', perContainer: 4, cost: 18, perDay: 1, minutes: 0, smoked: false },
  pouches: { label: 'Nicotine pouches or dip', unit: 'pouch', units: 'pouches', container: 'can', perContainer: 20, cost: 6, perDay: 10, minutes: 0, smoked: false },
};

export const PRODUCT_ORDER: Product[] = ['bowls', 'cigarettes', 'cigars', 'vape', 'pouches'];

export function unitWord(p: ProductInfo, n: number) {
  return n === 1 ? p.unit : p.units;
}

/** "tobacco-free" for smoked products, "nicotine-free" for vapes and pouches. */
export function freeWord(p: ProductInfo) {
  return p.smoked ? 'tobacco-free' : 'nicotine-free';
}
