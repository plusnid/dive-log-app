import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad'
import { PhotoPicker } from '../components/PhotoPicker'
import { createDiveLog, updateDiveLog, getDiveLogDetail } from '../db/diveLogRepository'
import type { Attachment, Current, DiveLogDraft, Weather } from '../types/diveLog'

interface DiveLogFormViewProps {
  id?: number
  onSaved: (id: number) => void
  onCancel: () => void
}

const emptyDraft: DiveLogDraft = {
  date: new Date().toISOString().slice(0, 10),
  startTime: '',
  siteName: '',
  maxDepth: undefined,
  duration: undefined,
  waterTemp: undefined,
  visibility: undefined,
  weather: undefined,
  current: undefined,
  tankStartPressure: undefined,
  tankEndPressure: undefined,
  weight: undefined,
  gear: '',
  buddyName: '',
  notes: '',
  guideName: '',
}

function numberOrUndefined(value: string): number | undefined {
  if (value === '') return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

export function DiveLogFormView({ id, onSaved, onCancel }: DiveLogFormViewProps) {
  const isEditing = id != null
  const [draft, setDraft] = useState<DiveLogDraft>(emptyDraft)
  const [loading, setLoading] = useState(isEditing)
  const [existingPhotos, setExistingPhotos] = useState<Attachment[]>([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState<number[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [existingSignatureUrl, setExistingSignatureUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const signaturePadRef = useRef<SignaturePadHandle>(null)

  useEffect(() => {
    if (!isEditing) return
    let cancelled = false
    getDiveLogDetail(id).then((detail) => {
      if (cancelled || !detail) return
      const { diveLog, photos, signature } = detail
      setDraft({
        date: diveLog.date,
        startTime: diveLog.startTime ?? '',
        siteName: diveLog.siteName,
        maxDepth: diveLog.maxDepth,
        duration: diveLog.duration,
        waterTemp: diveLog.waterTemp,
        visibility: diveLog.visibility,
        weather: diveLog.weather,
        current: diveLog.current,
        tankStartPressure: diveLog.tankStartPressure,
        tankEndPressure: diveLog.tankEndPressure,
        weight: diveLog.weight,
        gear: diveLog.gear ?? '',
        buddyName: diveLog.buddyName ?? '',
        notes: diveLog.notes ?? '',
        guideName: diveLog.guideName ?? '',
      })
      setExistingPhotos(photos)
      setExistingSignatureUrl(signature ? URL.createObjectURL(signature.blob) : null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isEditing])

  useEffect(() => {
    return () => {
      if (existingSignatureUrl) URL.revokeObjectURL(existingSignatureUrl)
    }
  }, [existingSignatureUrl])

  function updateField<K extends keyof DiveLogDraft>(key: K, value: DiveLogDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      const signatureBlob = await signaturePadRef.current?.exportBlob()
      if (isEditing) {
        await updateDiveLog(id, draft, {
          newPhotoFiles: newFiles,
          removedPhotoIds,
          newSignatureBlob: signatureBlob,
        })
        onSaved(id)
      } else {
        const newId = await createDiveLog(draft, newFiles, signatureBlob ?? null)
        onSaved(newId)
      }
    } catch (error) {
      // 保存は必ず Dexie のトランザクションを通るため、ブラウザの QuotaExceededError（DOMException）は
      // Dexie 自身の DexieError（`QuotaExceededError` という name を持つが DOMException ではない）に
      // 変換される。bulk 系操作では inner にラップされる場合もあるため、そちらも見る。
      const errorName = (error as { name?: string } | null | undefined)?.name
      const innerName = (error as { inner?: { name?: string } } | null | undefined)?.inner?.name
      if (errorName === 'QuotaExceededError' || innerName === 'QuotaExceededError') {
        setSaveError(
          '端末のストレージ容量が不足しているため保存できませんでした。不要な写真を削除するなどして空き容量を確保してから、もう一度お試しください。',
        )
      } else {
        setSaveError('保存に失敗しました。もう一度お試しください。')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>読み込み中...</p>

  return (
    <form className="view dive-log-form" onSubmit={handleSubmit}>
      <button type="button" onClick={onCancel}>
        ← キャンセル
      </button>
      <h1>{isEditing ? 'ダイビングログを編集' : '新規ダイビングログ'}</h1>

      <fieldset>
        <legend>基本情報</legend>
        <label>
          日付
          <input type="date" required value={draft.date} onChange={(e) => updateField('date', e.target.value)} />
        </label>
        <label>
          開始時刻
          <input type="time" value={draft.startTime ?? ''} onChange={(e) => updateField('startTime', e.target.value)} />
        </label>
        <label>
          ダイビングポイント
          <input
            type="text"
            required
            value={draft.siteName}
            onChange={(e) => updateField('siteName', e.target.value)}
          />
        </label>
        <label>
          最大水深 (m)
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={draft.maxDepth ?? ''}
            onChange={(e) => updateField('maxDepth', numberOrUndefined(e.target.value))}
          />
        </label>
        <label>
          潜水時間 (分)
          <input
            type="number"
            inputMode="numeric"
            value={draft.duration ?? ''}
            onChange={(e) => updateField('duration', numberOrUndefined(e.target.value))}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>環境情報</legend>
        <label>
          水温 (℃)
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={draft.waterTemp ?? ''}
            onChange={(e) => updateField('waterTemp', numberOrUndefined(e.target.value))}
          />
        </label>
        <label>
          透明度 (m)
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={draft.visibility ?? ''}
            onChange={(e) => updateField('visibility', numberOrUndefined(e.target.value))}
          />
        </label>
        <label>
          天候
          <select
            value={draft.weather ?? ''}
            onChange={(e) => updateField('weather', (e.target.value || undefined) as Weather | undefined)}
          >
            <option value="">選択なし</option>
            <option value="sunny">晴れ</option>
            <option value="cloudy">曇り</option>
            <option value="rainy">雨</option>
            <option value="other">その他</option>
          </select>
        </label>
        <label>
          流れ
          <select
            value={draft.current ?? ''}
            onChange={(e) => updateField('current', (e.target.value || undefined) as Current | undefined)}
          >
            <option value="">選択なし</option>
            <option value="none">なし</option>
            <option value="weak">弱い</option>
            <option value="moderate">普通</option>
            <option value="strong">強い</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>器材・エア管理</legend>
        <label>
          タンク開始圧力 (bar)
          <input
            type="number"
            inputMode="numeric"
            value={draft.tankStartPressure ?? ''}
            onChange={(e) => updateField('tankStartPressure', numberOrUndefined(e.target.value))}
          />
        </label>
        <label>
          タンク終了圧力 (bar)
          <input
            type="number"
            inputMode="numeric"
            value={draft.tankEndPressure ?? ''}
            onChange={(e) => updateField('tankEndPressure', numberOrUndefined(e.target.value))}
          />
        </label>
        <label>
          ウェイト (kg)
          <input
            type="number"
            step="0.5"
            inputMode="decimal"
            value={draft.weight ?? ''}
            onChange={(e) => updateField('weight', numberOrUndefined(e.target.value))}
          />
        </label>
        <label>
          使用器材
          <input type="text" value={draft.gear ?? ''} onChange={(e) => updateField('gear', e.target.value)} />
        </label>
      </fieldset>

      <fieldset>
        <legend>写真・メモ</legend>
        <label>
          バディ名
          <input type="text" value={draft.buddyName ?? ''} onChange={(e) => updateField('buddyName', e.target.value)} />
        </label>
        <label>
          メモ
          <textarea value={draft.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} />
        </label>
        <PhotoPicker
          existingPhotos={existingPhotos.map((p) => ({ id: p.id as number, blob: p.blob }))}
          removedExistingIds={removedPhotoIds}
          onRemoveExisting={(pid) => setRemovedPhotoIds((prev) => [...prev, pid])}
          newFiles={newFiles}
          onNewFilesChange={setNewFiles}
        />
      </fieldset>

      <fieldset>
        <legend>ガイドのサイン</legend>
        <label>
          ガイド名
          <input type="text" value={draft.guideName ?? ''} onChange={(e) => updateField('guideName', e.target.value)} />
        </label>
        <SignaturePad ref={signaturePadRef} existingSignatureUrl={existingSignatureUrl} />
      </fieldset>

      {saveError && (
        <p className="form-error" role="alert">
          {saveError}
        </p>
      )}

      <div className="view__actions">
        <button type="submit" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </form>
  )
}
