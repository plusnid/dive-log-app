import { useEffect, useState } from 'react'
import { deleteDiveLog, getDiveLogDetail, type DiveLogDetail } from '../db/diveLogRepository'
import { aluminumTankOptions, drySuitOptions, gearLabel, steelTankOptions, wetSuitOptions } from '../types/gearOptions'

interface DiveLogDetailViewProps {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
  onDeleted: () => void
}

const weatherLabel: Record<string, string> = {
  sunny: '晴れ',
  cloudy: '曇り',
  rainy: '雨',
  other: 'その他',
}

const currentLabel: Record<string, string> = {
  none: 'なし',
  weak: '弱い',
  moderate: '普通',
  strong: '強い',
}

export function DiveLogDetailView({ id, onBack, onEdit, onDeleted }: DiveLogDetailViewProps) {
  const [detail, setDetail] = useState<DiveLogDetail | null | undefined>(undefined)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(undefined)
    getDiveLogDetail(id).then((result) => {
      if (!cancelled) setDetail(result ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!detail) return
    const urls = detail.photos.map((p) => URL.createObjectURL(p.blob))
    const sigUrl = detail.signature ? URL.createObjectURL(detail.signature.blob) : null
    setPhotoUrls(urls)
    setSignatureUrl(sigUrl)
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      if (sigUrl) URL.revokeObjectURL(sigUrl)
    }
  }, [detail])

  async function handleDelete() {
    if (!window.confirm('この記録を削除しますか？')) return
    await deleteDiveLog(id)
    onDeleted()
  }

  if (detail === undefined) return <p>読み込み中...</p>
  if (detail === null) return <p>記録が見つかりませんでした。</p>

  const { diveLog } = detail

  return (
    <div className="view">
      <button type="button" onClick={onBack}>
        ← 一覧に戻る
      </button>
      <h1>{diveLog.siteName}</h1>
      <p className="detail-subtitle">
        {diveLog.date} {diveLog.startTime}
      </p>

      <section>
        <h2>基本情報</h2>
        <dl>
          <dt>エリア</dt>
          <dd>{diveLog.area || '-'}</dd>
          <dt>最大水深</dt>
          <dd>{diveLog.maxDepth ?? '-'} m</dd>
          <dt>潜水時間</dt>
          <dd>{diveLog.duration ?? '-'} 分</dd>
        </dl>
      </section>

      <section>
        <h2>環境情報</h2>
        <dl>
          <dt>水温</dt>
          <dd>{diveLog.waterTemp ?? '-'} ℃</dd>
          <dt>透明度</dt>
          <dd>{diveLog.visibility ?? '-'} m</dd>
          <dt>天候</dt>
          <dd>{diveLog.weather ? weatherLabel[diveLog.weather] : '-'}</dd>
          <dt>流れ</dt>
          <dd>{diveLog.current ? currentLabel[diveLog.current] : '-'}</dd>
        </dl>
      </section>

      <section>
        <h2>器材・エア管理</h2>
        <dl>
          <dt>ドライスーツ</dt>
          <dd>{gearLabel(drySuitOptions, diveLog.drySuit)}</dd>
          <dt>ウェットスーツ</dt>
          <dd>{gearLabel(wetSuitOptions, diveLog.wetSuit)}</dd>
          <dt>フード</dt>
          <dd>{diveLog.hood ? '着用' : '-'}</dd>
          <dt>フードベスト</dt>
          <dd>{diveLog.hoodVest ? '着用' : '-'}</dd>
          <dt>アルミタンク</dt>
          <dd>{gearLabel(aluminumTankOptions, diveLog.aluminumTank)}</dd>
          <dt>スチールタンク</dt>
          <dd>{gearLabel(steelTankOptions, diveLog.steelTank)}</dd>
          <dt>タンク圧力（開始/終了）</dt>
          <dd>
            {diveLog.tankStartPressure ?? '-'} / {diveLog.tankEndPressure ?? '-'} bar
          </dd>
          <dt>ウェイト</dt>
          <dd>{diveLog.weight ?? '-'} kg</dd>
          {diveLog.gear && (
            <>
              <dt>使用器材（旧項目）</dt>
              <dd>{diveLog.gear}</dd>
            </>
          )}
        </dl>
      </section>

      <section>
        <h2>写真・メモ</h2>
        <p>バディ: {diveLog.buddyName || '-'}</p>
        {diveLog.notes && <p className="detail-notes">{diveLog.notes}</p>}
        {photoUrls.length > 0 && (
          <div className="detail-photos">
            {photoUrls.map((url) => (
              <img key={url} src={url} alt="ダイビング写真" />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>ガイドのサイン</h2>
        {signatureUrl ? (
          <img src={signatureUrl} alt="ガイドのサイン" className="detail-signature" />
        ) : (
          <p>未サイン</p>
        )}
        {diveLog.guideName && <p>ガイド: {diveLog.guideName}</p>}
      </section>

      <div className="view__actions">
        <button type="button" onClick={() => onEdit(id)}>
          編集
        </button>
        <button type="button" onClick={handleDelete}>
          削除
        </button>
      </div>
    </div>
  )
}
