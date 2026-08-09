export type MarineLifeGenre =
  | 'nudibranch'
  | 'fish'
  | 'crustacean'
  | 'cephalopod'
  | 'shellfish'
  | 'echinoderm'
  | 'cnidarian'
  | 'reptile_mammal'
  | 'other'

export interface MarineLifeGenreOption {
  value: MarineLifeGenre
  label: string
}

/**
 * 生物のジャンル選択肢（固定プリセット、9種）。
 * ユーザー確定（2026-08-09）: 「サメ・エイ」は独立ジャンルとせず `fish`（魚類）へ統合、
 * 「サンゴ・イソギンチャク」は生物学的な分類名 `cnidarian`（刺胞動物）に改称。表示順はウミウシを先頭とする。
 */
export const marineLifeGenreOptions: MarineLifeGenreOption[] = [
  { value: 'nudibranch', label: 'ウミウシ' },
  { value: 'fish', label: '魚類' },
  { value: 'crustacean', label: '甲殻類' },
  { value: 'cephalopod', label: '頭足類' },
  { value: 'shellfish', label: '貝類' },
  { value: 'echinoderm', label: '棘皮動物' },
  { value: 'cnidarian', label: '刺胞動物' },
  { value: 'reptile_mammal', label: '爬虫類・哺乳類' },
  { value: 'other', label: 'その他' },
]

/** 未選択（undefined）や未知のコード値は '-' を返す（REQ-4.5, REQ-7.3）。gearLabel / weatherLabel と同じ方針。 */
export function marineLifeGenreLabel(value: string | undefined): string {
  if (value == null) return '-'
  const found = marineLifeGenreOptions.find((option) => option.value === value)
  return found ? found.label : '-'
}
