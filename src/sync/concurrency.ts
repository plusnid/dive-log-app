/** 同時実行数を制限しつつ配列の各要素へ非同期処理を適用する（Drive のユーザー単位クォータ対策）。 */
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await fn(current)
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}
