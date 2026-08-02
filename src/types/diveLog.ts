export type Weather = 'sunny' | 'cloudy' | 'rainy' | 'other'
export type Current = 'none' | 'weak' | 'moderate' | 'strong'

export interface DiveLog {
  id?: number
  uuid: string
  // 基本情報
  date: string
  startTime?: string
  siteName: string
  maxDepth?: number
  duration?: number
  // 環境情報
  waterTemp?: number
  visibility?: number
  weather?: Weather
  current?: Current
  // 器材・エア管理
  tankStartPressure?: number
  tankEndPressure?: number
  weight?: number
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

export type DiveLogDraft = Omit<DiveLog, 'id' | 'uuid' | 'photoIds' | 'signatureId' | 'createdAt' | 'updatedAt'>
