import type { Weather } from './diveLog'

export interface WeatherOption {
  value: Weather
  label: string
}

export const weatherOptions: WeatherOption[] = [
  { value: 'sunny', label: '晴れ' },
  { value: 'cloudy', label: '曇り' },
  { value: 'rainy', label: '雨' },
  { value: 'other', label: 'その他' },
]

/** 未選択（undefined）や未知のコード値は '-' を返す（REQ-3.9）。gearLabel と同じ方針。 */
export function weatherLabel(value: string | undefined): string {
  if (value == null) return '-'
  const found = weatherOptions.find((option) => option.value === value)
  return found ? found.label : '-'
}
