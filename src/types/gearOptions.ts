export type DrySuit = 'inner_light' | 'inner_medium' | 'inner_heavy'
export type WetSuit = 'wet_3mm' | 'wet_5mm' | 'wet_5mm_tapper' | 'semidry'
export type AluminumTank = 'al_10l' | 'al_11l' | 'al_12l'
export type SteelTank = 'steel_10l' | 'steel_12l' | 'steel_14l'

export interface GearOption<T extends string> {
  value: T
  label: string
}

export const drySuitOptions: GearOption<DrySuit>[] = [
  { value: 'inner_light', label: 'インナー薄手' },
  { value: 'inner_medium', label: 'インナー中厚' },
  { value: 'inner_heavy', label: 'インナー厚手' },
]

export const wetSuitOptions: GearOption<WetSuit>[] = [
  { value: 'wet_3mm', label: '3mm' },
  { value: 'wet_5mm', label: '5mm' },
  { value: 'wet_5mm_tapper', label: '5mm + タッパー' },
  { value: 'semidry', label: 'セミドライ' },
]

export const aluminumTankOptions: GearOption<AluminumTank>[] = [
  { value: 'al_10l', label: '10L' },
  { value: 'al_11l', label: '11L' },
  { value: 'al_12l', label: '12L' },
]

export const steelTankOptions: GearOption<SteelTank>[] = [
  { value: 'steel_10l', label: '10L' },
  { value: 'steel_12l', label: '12L' },
  { value: 'steel_14l', label: '14L' },
]

/** 未選択（undefined）や未知のコード値は '-' を返す。 */
export function gearLabel<T extends string>(options: GearOption<T>[], value: T | undefined): string {
  if (value == null) return '-'
  const found = options.find((option) => option.value === value)
  return found ? found.label : '-'
}
