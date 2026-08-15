import { useEffect, useState } from 'react'
import { deleteDiveLog, getDiveLogDetail, type DiveLogDetail } from '../db/diveLogRepository'
import { aluminumTankOptions, drySuitOptions, gearLabel, steelTankOptions, wetSuitOptions } from '../types/gearOptions'
import { weatherLabel } from '../types/weatherOptions'
import { marineLifeGenreLabel } from '../types/marineLifeOptions'
import { canShowLightbox, ImageLightbox, type LightboxImage } from '../components/ImageLightbox'

interface DiveLogDetailViewProps {
  id: number
  onEdit: (id: number) => void
  onDeleted: () => void
  /** 生物名を選択したとき、その生物の該当ログ一覧へ移動する（REQ-6.2の補助導線） */
  onSelectCreature?: (name: string) => void
}

const currentLabel: Record<string, string> = {
  none: 'なし',
  weak: '弱い',
  moderate: '普通',
  strong: '強い',
}

/** 拡大表示の対象。写真の実体ではなく「どこから開いたか」を持つ（オブジェクトURLの世代ずれを避けるため）。 */
type LightboxTarget =
  | { kind: 'log'; index: number } // 写真・メモから（REQ-4.1）
  | { kind: 'observation'; uuid: string; index: number } // 観察記録の行から（REQ-4.2）
  | { kind: 'plan'; index: number } // ダイビングプラン画像から（dive-plan-image REQ-4.2）

export function DiveLogDetailView({ id, onEdit, onDeleted, onSelectCreature }: DiveLogDetailViewProps) {
  const [detail, setDetail] = useState<DiveLogDetail | null | undefined>(undefined)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [planImageUrls, setPlanImageUrls] = useState<string[]>([])
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null)

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
    const planUrls = detail.planImages.map((p) => URL.createObjectURL(p.blob))
    const sigUrl = detail.signature ? URL.createObjectURL(detail.signature.blob) : null
    setPhotoUrls(urls)
    setPlanImageUrls(planUrls)
    setSignatureUrl(sigUrl)
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      planUrls.forEach((u) => URL.revokeObjectURL(u))
      if (sigUrl) URL.revokeObjectURL(sigUrl)
    }
  }, [detail])

  // detail が変わる（＝写真URLが作り直される）と、開いていた拡大表示は対象を失うため閉じる（design.md 3-1）。
  useEffect(() => {
    setLightbox(null)
  }, [detail])

  // 拡大表示を開いている間、背面をスクロールさせない（REQ-2.4、design.md 3-4）。
  useEffect(() => {
    if (!lightbox) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [lightbox])

  async function handleDelete() {
    if (!window.confirm('この記録を削除しますか？')) return
    await deleteDiveLog(id)
    onDeleted()
  }

  if (detail === undefined)
    return (
      <div className="view">
        <p>読み込み中...</p>
      </div>
    )
  if (detail === null)
    return (
      <div className="view">
        <p>記録が見つかりませんでした。</p>
      </div>
    )

  const { diveLog } = detail
  const observations = diveLog.observations ?? []
  const photoUrlByUuid = new Map(detail.photos.map((p, i) => [p.uuid, photoUrls[i]]))

  /** 拡大表示に渡す画像。photoUrls / observations から毎レンダリングで導出する（REQ-4.1〜REQ-4.3）。 */
  function lightboxImages(target: LightboxTarget): LightboxImage[] {
    if (target.kind === 'log') {
      return photoUrls.map((url) => ({ url, label: 'ダイビング写真' }))
    }
    if (target.kind === 'plan') {
      return planImageUrls.map((url) => ({ url, label: 'ダイビングプランの画像' })) // REQ-4.2, REQ-4.3
    }
    const observation = observations.find((o) => o.uuid === target.uuid)
    if (!observation) return []
    return observation.photoUuids
      .map((u) => photoUrlByUuid.get(u))
      .filter((url): url is string => url !== undefined) // REQ-4.3
      .map((url) => ({ url, label: `${observation.name}の写真` })) // REQ-7.7
  }

  const activeLightboxImages = lightbox ? lightboxImages(lightbox) : null

  return (
    <div className="view">
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
        {planImageUrls.length > 0 && (
          <div className="detail-plan-images">
            <p className="detail-plan-images__label">ダイビングプラン</p>
            <div className="detail-plan-images__list">
              {planImageUrls.map((url, i) => {
                const name = planImageUrls.length > 1 ? `ダイビングプランの画像${i + 1}` : 'ダイビングプランの画像'
                return canShowLightbox ? (
                  <button
                    key={url}
                    type="button"
                    className="detail-plan-images__button"
                    aria-label={`${name}を拡大表示`}
                    onClick={() => setLightbox({ kind: 'plan', index: i })}
                  >
                    <img src={url} alt="" />
                  </button>
                ) : (
                  <img key={url} src={url} alt={name} /> /* REQ-4.9 */
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2>環境情報</h2>
        <dl>
          <dt>水温</dt>
          <dd>{diveLog.waterTemp ?? '-'} ℃</dd>
          <dt>透明度</dt>
          <dd>{diveLog.visibility ?? '-'} m</dd>
          <dt>天候</dt>
          <dd>{weatherLabel(diveLog.weather)}</dd>
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
        <h2>観察した生物</h2>
        {observations.length === 0 ? (
          <p>-</p>
        ) : (
          <ul className="observation-list">
            {observations.map((o) => {
              const thumbUrl = o.photoUuids.length > 0 ? photoUrlByUuid.get(o.photoUuids[0]) : undefined
              return (
                <li key={o.uuid} className="observation-list__item">
                  {onSelectCreature ? (
                    <button
                      type="button"
                      className="observation-list__name"
                      onClick={() => onSelectCreature(o.name)}
                    >
                      {o.name}
                    </button>
                  ) : (
                    <span className="observation-list__name observation-list__name--static">{o.name}</span>
                  )}
                  <span className="observation-list__genre">{marineLifeGenreLabel(o.genre)}</span>
                  {thumbUrl &&
                    (canShowLightbox ? (
                      <button
                        type="button"
                        className="observation-list__thumb-button"
                        aria-label={`${o.name}の写真を拡大表示`}
                        onClick={() => setLightbox({ kind: 'observation', uuid: o.uuid, index: 0 })}
                      >
                        <img className="observation-list__thumb" src={thumbUrl} alt="" />
                      </button>
                    ) : (
                      <img className="observation-list__thumb" src={thumbUrl} alt="" />
                    ))}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h2>写真・メモ</h2>
        <p>バディ: {diveLog.buddyName || '-'}</p>
        {diveLog.notes && <p className="detail-notes">{diveLog.notes}</p>}
        {photoUrls.length > 0 && (
          <div className="detail-photos">
            {photoUrls.map((url, i) =>
              canShowLightbox ? (
                <button
                  key={url}
                  type="button"
                  className="detail-photos__button"
                  aria-label={`写真${i + 1}を拡大表示`} // REQ-7.8
                  onClick={() => setLightbox({ kind: 'log', index: i })}
                >
                  <img src={url} alt="" /> {/* ボタン名は aria-label が担うため装飾扱い */}
                </button>
              ) : (
                <img key={url} src={url} alt="ダイビング写真" />
              ),
            )}
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

      {lightbox && activeLightboxImages && activeLightboxImages.length > 0 && (
        <ImageLightbox
          images={activeLightboxImages}
          index={lightbox.index}
          onIndexChange={(next) => setLightbox((prev) => (prev ? { ...prev, index: next } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
