import type { AluminumTank, DrySuit, SteelTank, WetSuit } from './gearOptions'
import type { MarineLifeGenre } from './marineLifeOptions'

export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'other'
export type Current = 'none' | 'weak' | 'moderate' | 'strong'

/** 1本のダイビングで観察した生物1種の記録（REQ-1.2）。 */
export interface Observation {
  /** 観察記録の識別子。同一ログ内での一意性のみを保証する（フォームの React key、競合コピー時の突き合わせ用）。 */
  uuid: string
  /** ジャンル。undefined = 選択なし（REQ-1.4） */
  genre?: MarineLifeGenre
  /** 名前（自由記述・必須。空文字の観察記録は保存しない＝REQ-1.3） */
  name: string
  /** 紐づく写真。値は `Attachment.uuid`（端末非依存、REQ-8.2）。0件可（REQ-3.2） */
  photoUuids: string[]
}

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
  // 観察した生物
  /** 観察した生物。未設定（undefined）は0件と同義（REQ-7.1） */
  observations?: Observation[]
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
  'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt' | 'gear' | 'observations'
>

/**
 * フォーム上の写真参照。保存時にリポジトリが `Attachment.uuid` へ解決する。
 * 新規写真は index ではなく `File` オブジェクトそのもので識別する
 * （`PhotoPicker` が配列から取り除いたとき index がずれるため。REQ-3.6）。
 */
export type PhotoRef =
  | { kind: 'existing'; id: number } // 保存済みの添付（Attachment.id）
  | { kind: 'new'; file: File } // 未保存の新規写真

/** フォーム上の観察記録の入力値。保存時に `resolveObservations()` で `Observation` へ変換される。 */
export interface ObservationDraft {
  uuid: string
  genre?: MarineLifeGenre
  name: string
  photos: PhotoRef[]
}
