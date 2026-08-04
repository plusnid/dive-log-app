import type { AluminumTank, DrySuit, SteelTank, WetSuit } from './gearOptions'

export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'other'
export type Current = 'none' | 'weak' | 'moderate' | 'strong'

export interface DiveLog {
  id?: number
  uuid: string
  // 基本情報
  date: string
  startTime?: string
  area?: string
  siteName: string
  maxDepth?: number
  duration?: number
  // 環境情報
  waterTemp?: number
  visibility?: number
  weather?: Weather
  current?: Current
  // 器材・エア管理
  drySuit?: DrySuit // 選択リスト。undefined = 選択なし
  wetSuit?: WetSuit // 選択リスト。undefined = 選択なし
  hood?: boolean // フード着用有無。undefined / false = 着用なし
  hoodVest?: boolean // フードベスト着用有無
  aluminumTank?: AluminumTank
  steelTank?: SteelTank
  tankStartPressure?: number
  tankEndPressure?: number
  weight?: number
  /** @deprecated 旧「使用器材」自由記述。新規入力はせず、既存データの保持と詳細画面での参照のみ（REQ-6.9, REQ-6.10） */
  gear?: string
  // 写真・メモ
  buddyName?: string
  notes?: string
  photoIds: number[]
  // ガイドのサイン
  signatureId?: number
  guideName?: string
  // メタデータ
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id?: number
  uuid: string
  type: 'photo' | 'signature'
  blob: Blob
  mimeType: string
  createdAt: string
}

export type DiveLogDraft = Omit<
  DiveLog,
  'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt' | 'gear'
>
