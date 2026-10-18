/**
 * REWIND Zero-Knowledge Air-Gapped Encrypted Vault Engine
 * Encrypts timeline database and backup files using AES-256-GCM with PBKDF2 key derivation.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const MAGIC_HEADER = Buffer.from('REWIND_VAULT_V1\0', 'utf-8') // 16 bytes
const SALT_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const PBKDF2_ITERATIONS = 100000
const DIGEST = 'sha256'

export interface VaultMetadata {
  schemaVersion: 1
  createdAt: string
  originalSize: number
  description?: string
}

export class VaultEngine {
  /**
   * Derive a 256-bit symmetric key from passphrase and salt.
   */
  public static deriveKey(passphrase: string, salt: Buffer): Buffer {
    if (!passphrase || passphrase.length < 6) {
      throw new Error('Vault passphrase must be at least 6 characters long')
    }
    return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_BYTES, DIGEST)
  }

  /**
   * Encrypt a plaintext buffer into a standalone vault buffer.
   */
  public static encrypt(plainData: Buffer, passphrase: string, metadata: Partial<VaultMetadata> = {}): Buffer {
    const salt = crypto.randomBytes(SALT_BYTES)
    const iv = crypto.randomBytes(IV_BYTES)
    const key = this.deriveKey(passphrase, salt)

    const meta: VaultMetadata = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      originalSize: plainData.length,
      ...metadata,
    }

    const payloadBundle = JSON.stringify({
      meta,
      data: plainData.toString('base64'),
    })

    const compressed = zlib.gzipSync(Buffer.from(payloadBundle, 'utf-8'), { level: 9 })

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()])
    const tag = cipher.getAuthTag()

    // Layout: [MAGIC_HEADER(16)] [SALT(32)] [IV(12)] [TAG(16)] [ENCRYPTED_DATA(...)]
    return Buffer.concat([MAGIC_HEADER, salt, iv, tag, encrypted])
  }

  /**
   * Decrypt a vault buffer back into the original plaintext buffer.
   */
  public static decrypt(vaultBuffer: Buffer, passphrase: string): { data: Buffer; meta: VaultMetadata } {
    const minHeaderLen = MAGIC_HEADER.length + SALT_BYTES + IV_BYTES + TAG_BYTES
    if (vaultBuffer.length < minHeaderLen) {
      throw new Error('Corrupted vault: file too small or invalid header')
    }

    const magic = vaultBuffer.subarray(0, MAGIC_HEADER.length)
    if (!magic.equals(MAGIC_HEADER)) {
      throw new Error('Invalid vault header: file is not a valid REWIND vault')
    }

    let offset = MAGIC_HEADER.length
    const salt = vaultBuffer.subarray(offset, offset + SALT_BYTES)
    offset += SALT_BYTES

    const iv = vaultBuffer.subarray(offset, offset + IV_BYTES)
    offset += IV_BYTES

    const tag = vaultBuffer.subarray(offset, offset + TAG_BYTES)
    offset += TAG_BYTES

    const encryptedData = vaultBuffer.subarray(offset)

    const key = this.deriveKey(passphrase, salt)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)

    let compressed: Buffer
    try {
      compressed = Buffer.concat([decipher.update(encryptedData), decipher.final()])
    } catch {
      throw new Error('Decryption failed: incorrect passphrase or corrupted vault archive')
    }

    const payloadJson = zlib.gunzipSync(compressed).toString('utf-8')
    const parsed = JSON.parse(payloadJson) as { meta: VaultMetadata; data: string }

    return {
      data: Buffer.from(parsed.data, 'base64'),
      meta: parsed.meta,
    }
  }

  /**
   * Encrypt a file from disk and save to target vault path.
   */
  public static createVaultFile(
    inputFilePath: string,
    outputVaultPath: string,
    passphrase: string,
    metadata?: Partial<VaultMetadata>
  ): void {
    if (!fs.existsSync(inputFilePath)) {
      throw new Error(`Source file does not exist: ${inputFilePath}`)
    }
    const plain = fs.readFileSync(inputFilePath)
    const vault = this.encrypt(plain, passphrase, metadata)

    const outDir = path.dirname(outputVaultPath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    const tmpPath = `${outputVaultPath}.tmp`
    fs.writeFileSync(tmpPath, vault)
    fs.renameSync(tmpPath, outputVaultPath)
  }

  /**
   * Decrypt a vault file from disk and write to target output path.
   */
  public static restoreVaultFile(vaultPath: string, outputFilePath: string, passphrase: string): VaultMetadata {
    if (!fs.existsSync(vaultPath)) {
      throw new Error(`Vault file does not exist: ${vaultPath}`)
    }
    const vault = fs.readFileSync(vaultPath)
    const { data, meta } = this.decrypt(vault, passphrase)

    const outDir = path.dirname(outputFilePath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    const tmpPath = `${outputFilePath}.tmp`
    fs.writeFileSync(tmpPath, data)
    fs.renameSync(tmpPath, outputFilePath)

    return meta
  }
}
