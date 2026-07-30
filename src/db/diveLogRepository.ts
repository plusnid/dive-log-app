import { db } from './db'
import type { Attachment, DiveLog, DiveLogDraft } from '../types/diveLog'

async function addAttachment(type: Attachment['type'], blob: Blob): Promise<number> {
  return db.attachments.add({
    type,
    blob,
    mimeType: blob.type || 'image/png',
    createdAt: new Date().toISOString(),
  })
}

export async function createDiveLog(
  draft: DiveLogDraft,
  photoFiles: File[],
  signatureBlob: Blob | null,
): Promise<number> {
  return db.transaction('rw', db.diveLogs, db.attachments, async () => {
    const photoIds = await Promise.all(photoFiles.map((file) => addAttachment('photo', file)))
    const signatureId = signatureBlob ? await addAttachment('signature', signatureBlob) : undefined

    const now = new Date().toISOString()
    const diveLog: DiveLog = {
      ...draft,
      photoIds,
      signatureId,
      createdAt: now,
      updatedAt: now,
    }
    return db.diveLogs.add(diveLog)
  })
}

export interface UpdateDiveLogOptions {
  newPhotoFiles: File[]
  removedPhotoIds: number[]
  /** undefined = no change, null = remove signature, Blob = replace signature */
  newSignatureBlob?: Blob | null
}

export async function updateDiveLog(
  id: number,
  draft: DiveLogDraft,
  { newPhotoFiles, removedPhotoIds, newSignatureBlob }: UpdateDiveLogOptions,
): Promise<void> {
  await db.transaction('rw', db.diveLogs, db.attachments, async () => {
    const existing = await db.diveLogs.get(id)
    if (!existing) throw new Error(`DiveLog ${id} not found`)

    if (removedPhotoIds.length > 0) {
      await db.attachments.bulkDelete(removedPhotoIds)
    }
    const addedPhotoIds = await Promise.all(newPhotoFiles.map((file) => addAttachment('photo', file)))
    const photoIds = existing.photoIds.filter((pid) => !removedPhotoIds.includes(pid)).concat(addedPhotoIds)

    let signatureId = existing.signatureId
    if (newSignatureBlob === null) {
      if (existing.signatureId != null) await db.attachments.delete(existing.signatureId)
      signatureId = undefined
    } else if (newSignatureBlob) {
      if (existing.signatureId != null) await db.attachments.delete(existing.signatureId)
      signatureId = await addAttachment('signature', newSignatureBlob)
    }

    await db.diveLogs.update(id, {
      ...draft,
      photoIds,
      signatureId,
      updatedAt: new Date().toISOString(),
    })
  })
}

export async function deleteDiveLog(id: number): Promise<void> {
  await db.transaction('rw', db.diveLogs, db.attachments, async () => {
    const existing = await db.diveLogs.get(id)
    if (!existing) return
    const idsToDelete = [...existing.photoIds]
    if (existing.signatureId != null) idsToDelete.push(existing.signatureId)
    if (idsToDelete.length > 0) await db.attachments.bulkDelete(idsToDelete)
    await db.diveLogs.delete(id)
  })
}

export interface DiveLogDetail {
  diveLog: DiveLog
  photos: Attachment[]
  signature: Attachment | null
}

export async function getDiveLogDetail(id: number): Promise<DiveLogDetail | undefined> {
  const diveLog = await db.diveLogs.get(id)
  if (!diveLog) return undefined

  const photos = (await db.attachments.bulkGet(diveLog.photoIds)).filter((a): a is Attachment => a != null)
  const signature = diveLog.signatureId != null ? ((await db.attachments.get(diveLog.signatureId)) ?? null) : null

  return { diveLog, photos, signature }
}
