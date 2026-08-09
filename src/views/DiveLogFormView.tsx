import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad'
import { PhotoPicker } from '../components/PhotoPicker'
import { PlanImagePicker } from '../components/PlanImagePicker'
import { PastValuePicker, derivePlaceCandidates } from '../components/PastValuePicker'
import { WeatherSelect } from '../components/WeatherSelect'
import { ObservationEditor, type AvailablePhoto } from '../components/ObservationEditor'
import {
  createDiveLog,
  updateDiveLog,
  getDiveLogDetail,
  findCarryOverSource,
  listPastPlaceValues,
  listPastObservationValues,
} from '../db/diveLogRepository'
import type { Attachment, Current, DiveLog, DiveLogDraft, ObservationDraft } from '../types/diveLog'
import type { MarineLifeGenre } from '../types/marineLifeOptions'
import {
  aluminumTankOptions,
  drySuitOptions,
  steelTankOptions,
  wetSuitOptions,
  type AluminumTank,
  type DrySuit,
  type SteelTank,
  type WetSuit,
} from '../types/gearOptions'

interface DiveLogFormViewProps {
  id?: number
  onSaved: (id: number) => void
  onCancel: () => void
}

const emptyDraft: DiveLogDraft = {
  date: new Date().toISOString().slice(0, 10),
  startTime: '',
  area: '',
  siteName: '',
  maxDepth: undefined,
  duration: undefined,
  waterTemp: undefined,
  visibility: undefined,
  weather: undefined,
  current: undefined,
  drySuit: undefined,
  wetSuit: undefined,
  hood: false,
  hoodVest: false,
  aluminumTank: undefined,
  steelTank: undefined,
  tankStartPressure: undefined,
  tankEndPressure: undefined,
  weight: undefined,
  buddyName: '',
  notes: '',
  guideName: '',
}

function numberOrUndefined(value: string): number | undefined {
  if (value === '') return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

/**
 * 引き継ぎ対象項目（REQ-7.4）を DiveLog から抽出する。
 * 文字列項目は `?? ''`、真偽値は `?? false`、数値・選択リストはそのまま（`undefined` 可）に正規化する（REQ-7.6）。
 */
function pickCarryOverFields(source: DiveLog): Partial<DiveLogDraft> {
  return {
    area: source.area ?? '',
    drySuit: source.drySuit,
    wetSuit: source.wetSuit,
    hood: source.hood ?? false,
    hoodVest: source.hoodVest ?? false,
    aluminumTank: source.aluminumTank,
    steelTank: source.steelTank,
    weight: source.weight,
    guideName: source.guideName ?? '',
    buddyName: source.buddyName ?? '',
  }
}

export function DiveLogFormView({ id, onSaved, onCancel }: DiveLogFormViewProps) {
  const isEditing = id != null
  const [draft, setDraft] = useState<DiveLogDraft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [existingPhotos, setExistingPhotos] = useState<Attachment[]>([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState<number[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  // ダイビングプラン画像（写真とは独立した3状態。dive-plan-image/design.md 6-4）
  const [existingPlanImages, setExistingPlanImages] = useState<Attachment[]>([])
  const [removedPlanImageIds, setRemovedPlanImageIds] = useState<number[]>([])
  const [newPlanImageFiles, setNewPlanImageFiles] = useState<File[]>([])
  const [existingSignatureUrl, setExistingSignatureUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const signaturePadRef = useRef<SignaturePadHandle>(null)

  // 観察した生物（REQ-2）。編集時は保存済みの観察記録から復元する。
  const [observations, setObservations] = useState<ObservationDraft[]>([])
  const [availablePhotos, setAvailablePhotos] = useState<AvailablePhoto[]>([])
  const [observationRecords, setObservationRecords] = useState<{ genre?: MarineLifeGenre; name: string }[]>([])

  // 過去ログからの参照入力（REQ-8）用の元データ。新規作成・編集のどちらでも使う。
  const [placeRecords, setPlaceRecords] = useState<{ area: string; siteName: string }[]>([])
  // 同日の直前ログからの引き継ぎ（REQ-7）用の状態。編集時は使わない。
  const [carryOverSource, setCarryOverSource] = useState<DiveLog | undefined>(undefined)
  const [carriedOverFrom, setCarriedOverFrom] = useState<string | null>(null)
  const isFirstDateEffect = useRef(true)

  useEffect(() => {
    if (!isEditing) return
    let cancelled = false
    getDiveLogDetail(id).then((detail) => {
      if (cancelled || !detail) return
      const { diveLog, photos, planImages, signature } = detail
      setDraft({
        date: diveLog.date,
        startTime: diveLog.startTime ?? '',
        area: diveLog.area ?? '',
        siteName: diveLog.siteName,
        maxDepth: diveLog.maxDepth,
        duration: diveLog.duration,
        waterTemp: diveLog.waterTemp,
        visibility: diveLog.visibility,
        weather: diveLog.weather,
        current: diveLog.current,
        drySuit: diveLog.drySuit,
        wetSuit: diveLog.wetSuit,
        hood: diveLog.hood ?? false,
        hoodVest: diveLog.hoodVest ?? false,
        aluminumTank: diveLog.aluminumTank,
        steelTank: diveLog.steelTank,
        tankStartPressure: diveLog.tankStartPressure,
        tankEndPressure: diveLog.tankEndPressure,
        weight: diveLog.weight,
        buddyName: diveLog.buddyName ?? '',
        notes: diveLog.notes ?? '',
        guideName: diveLog.guideName ?? '',
      })
      setExistingPhotos(photos)
      setExistingPlanImages(planImages) // REQ-2.4: 保存済みのプラン画像をすべてプレビューとして表示
      setExistingSignatureUrl(signature ? URL.createObjectURL(signature.blob) : null)

      // 保存済みの観察記録をフォームの初期値として読み込む（REQ-2.12）。
      // Attachment.uuid → Attachment.id の逆引きで PhotoRef に戻す。見つからない uuid は落とす（REQ-3.7）。
      const byUuid = new Map(photos.map((p) => [p.uuid, p.id as number]))
      setObservations(
        (diveLog.observations ?? []).map((o) => ({
          uuid: o.uuid,
          genre: o.genre,
          name: o.name,
          photos: o.photoUuids.flatMap((u) =>
            byUuid.has(u) ? [{ kind: 'existing' as const, id: byUuid.get(u)! }] : [],
          ),
        })),
      )

      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, isEditing])

  // 参照入力の候補の初期ロード（REQ-8）。新規作成・編集のどちらでも取得する。
  useEffect(() => {
    let cancelled = false
    listPastPlaceValues().then((places) => {
      if (!cancelled) setPlaceRecords(places)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 観察記録の名前の参照入力（REQ-2.6〜REQ-2.10）用の元データ。新規作成・編集のどちらでも取得する。
  useEffect(() => {
    let cancelled = false
    listPastObservationValues().then((records) => {
      if (!cancelled) setObservationRecords(records)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 観察記録に紐づけられる写真プール（保存済み＋未保存の統合、REQ-3.1, REQ-3.5）。
  // オブジェクトURLは PhotoPicker が内部で作るものとは別インスタンスだが、Blob実体を複製しない軽量なハンドルのため問題にならない。
  useEffect(() => {
    const visibleExisting = existingPhotos.filter((p) => !removedPhotoIds.includes(p.id as number))
    const photos: AvailablePhoto[] = [
      ...visibleExisting.map((p) => ({
        ref: { kind: 'existing' as const, id: p.id as number },
        url: URL.createObjectURL(p.blob),
        key: `existing-${p.id}`,
      })),
      ...newFiles.map((file, index) => ({
        ref: { kind: 'new' as const, file },
        url: URL.createObjectURL(file),
        key: `new-${index}`,
      })),
    ]
    setAvailablePhotos(photos)
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [existingPhotos, removedPhotoIds, newFiles])

  // 新規作成時のマウント時引き継ぎ（REQ-7.1）。
  useEffect(() => {
    if (isEditing) return
    let cancelled = false
    findCarryOverSource(emptyDraft.date).then((source) => {
      if (cancelled) return
      setCarryOverSource(source)
      if (source) {
        setDraft((prev) => ({ ...prev, ...pickCarryOverFields(source) }))
        setCarriedOverFrom(source.date)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isEditing])

  // 日付変更時は引き継ぎ元の有無だけを再取得する（自動コピーはしない、REQ-7.10）。
  // 変更前の日付についての引き継ぎ通知は、現在の日付と食い違うため取り下げる（REQ-7.7）。
  useEffect(() => {
    if (isEditing) return
    if (isFirstDateEffect.current) {
      // 初回（マウント時）は上の effect が同じ日付で既に処理済み。
      isFirstDateEffect.current = false
      return
    }
    setCarriedOverFrom(null)
    let cancelled = false
    findCarryOverSource(draft.date).then((source) => {
      if (!cancelled) setCarryOverSource(source)
    })
    return () => {
      cancelled = true
    }
  }, [draft.date, isEditing])

  useEffect(() => {
    return () => {
      if (existingSignatureUrl) URL.revokeObjectURL(existingSignatureUrl)
    }
  }, [existingSignatureUrl])

  const placeCandidates = useMemo(
    () => derivePlaceCandidates(placeRecords, draft.area ?? ''),
    [placeRecords, draft.area],
  )

  function updateField<K extends keyof DiveLogDraft>(key: K, value: DiveLogDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleCarryOver() {
    if (!carryOverSource) return
    setDraft((prev) => ({ ...prev, ...pickCarryOverFields(carryOverSource) }))
    setCarriedOverFrom(carryOverSource.date)
  }

  // 写真が取り除かれたとき、観察記録側の参照も整理する（REQ-3.6）。
  // リポジトリ側でも最終的なサニタイズを行うため、ここでの取りこぼしがあってもデータには不整合が残らない。
  function handleRemoveExistingPhoto(pid: number) {
    setRemovedPhotoIds((prev) => [...prev, pid])
    setObservations((prev) =>
      prev.map((o) => ({ ...o, photos: o.photos.filter((r) => !(r.kind === 'existing' && r.id === pid)) })),
    )
  }

  function handleRemoveExistingPlanImage(pid: number) {
    setRemovedPlanImageIds((prev) => [...prev, pid])
  }

  function handleNewFilesChange(next: File[]) {
    setNewFiles(next)
    setObservations((prev) =>
      prev.map((o) => ({ ...o, photos: o.photos.filter((r) => r.kind !== 'new' || next.includes(r.file)) })),
    )
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
          observations,
          newPlanImageFiles,
          removedPlanImageIds,
        })
        onSaved(id)
      } else {
        const newId = await createDiveLog(draft, newFiles, signatureBlob ?? null, observations, newPlanImageFiles)
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

      {!isEditing && carriedOverFrom && (
        <p className="dive-log-form__carry-over-notice">
          同じ日付（{carriedOverFrom}）の直前の記録から、エリア・器材・ガイド名などを引き継ぎました。
        </p>
      )}

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
          エリア
          <span className="dive-log-form__input-with-picker">
            <input type="text" value={draft.area ?? ''} onChange={(e) => updateField('area', e.target.value)} />
            <PastValuePicker
              title="過去のエリア"
              values={placeCandidates.areas}
              onSelect={(value) => updateField('area', value)}
            />
          </span>
        </label>
        <label>
          ダイビングポイント
          <span className="dive-log-form__input-with-picker">
            <input
              type="text"
              required
              value={draft.siteName}
              onChange={(e) => updateField('siteName', e.target.value)}
            />
            <PastValuePicker
              title="過去のダイビングポイント"
              values={placeCandidates.siteNames}
              onSelect={(value) => updateField('siteName', value)}
            />
          </span>
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
        <label>
          ダイビングプラン画像
          <PlanImagePicker
            existingImages={existingPlanImages.map((p) => ({ id: p.id as number, blob: p.blob }))}
            removedExistingIds={removedPlanImageIds}
            onRemoveExisting={handleRemoveExistingPlanImage}
            newFiles={newPlanImageFiles}
            onNewFilesChange={setNewPlanImageFiles}
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
        <WeatherSelect value={draft.weather} onChange={(value) => updateField('weather', value)} />
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
          ドライスーツ
          <select
            value={draft.drySuit ?? ''}
            onChange={(e) => updateField('drySuit', (e.target.value || undefined) as DrySuit | undefined)}
          >
            <option value="">選択なし</option>
            {drySuitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ウェットスーツ
          <select
            value={draft.wetSuit ?? ''}
            onChange={(e) => updateField('wetSuit', (e.target.value || undefined) as WetSuit | undefined)}
          >
            <option value="">選択なし</option>
            {wetSuitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={draft.hood ?? false} onChange={(e) => updateField('hood', e.target.checked)} />
          フード
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.hoodVest ?? false}
            onChange={(e) => updateField('hoodVest', e.target.checked)}
          />
          フードベスト
        </label>
        <label>
          アルミタンク
          <select
            value={draft.aluminumTank ?? ''}
            onChange={(e) => updateField('aluminumTank', (e.target.value || undefined) as AluminumTank | undefined)}
          >
            <option value="">選択なし</option>
            {aluminumTankOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          スチールタンク
          <select
            value={draft.steelTank ?? ''}
            onChange={(e) => updateField('steelTank', (e.target.value || undefined) as SteelTank | undefined)}
          >
            <option value="">選択なし</option>
            {steelTankOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
        {!isEditing && (
          <button type="button" disabled={!carryOverSource} onClick={handleCarryOver}>
            同じ日付の直前のログから引き継ぐ
          </button>
        )}
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
          onRemoveExisting={handleRemoveExistingPhoto}
          newFiles={newFiles}
          onNewFilesChange={handleNewFilesChange}
        />
      </fieldset>

      <fieldset>
        <legend>観察した生物</legend>
        <ObservationEditor
          observations={observations}
          onChange={setObservations}
          availablePhotos={availablePhotos}
          nameCandidateRecords={observationRecords}
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
