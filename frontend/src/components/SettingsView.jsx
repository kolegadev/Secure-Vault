import React, { useState, useEffect } from 'react'
import { Settings, Lock, AlertTriangle, Download, Shield } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useVaultStatus } from '../hooks/useVaultStatus'

export default function SettingsView() {
  const { vaultState } = useVaultStatus()
  const { request } = useApi()
  const [passphrase, setPassphrase] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [slotIndex, setSlotIndex] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(null); setSuccess(null) }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  const handleLock = async () => {
    if (!confirm('Lock the vault? All sessions will be invalidated.')) return
    try {
      await request('/vault/lock', { method: 'POST' })
      window.location.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAddKey = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (newPassphrase !== confirmPassphrase) {
      setError('Passphrases do not match')
      return
    }
    setLoading(true)
    try {
      const result = await request('/vault/keyslot', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', oldPass: passphrase, newPass: newPassphrase }),
      })
      if (result.success) {
        setSuccess('Key slot added successfully')
        setPassphrase('')
        setNewPassphrase('')
        setConfirmPassphrase('')
      } else {
        setError(result.data?.message || 'Failed to add key slot')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveKey = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!confirm('Remove this key slot? Make sure you have another working passphrase.')) return
    setLoading(true)
    try {
      const result = await request('/vault/keyslot', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove', oldPass: passphrase, slotIndex: parseInt(slotIndex, 10) }),
      })
      if (result.success) {
        setSuccess('Key slot removed successfully')
        setPassphrase('')
        setSlotIndex('')
      } else {
        setError(result.data?.message || 'Failed to remove key slot')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBackup = async () => {
    try {
      const result = await request('/vault/backup-header', {
        method: 'POST',
        body: JSON.stringify({ suggestedName: `vault-header-backup-${Date.now()}` }),
      })
      if (result.success) {
        setSuccess('Header backed up successfully')
      } else {
        setError(result.data?.message || 'Backup failed')
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-vault-text">Settings</h1>
        <p className="text-sm text-vault-textSecondary mt-1">Vault configuration and key management</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-vault-dangerMuted text-vault-danger text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-vault-primaryMuted text-vault-primary text-sm">
          <Shield className="w-4 h-4 mt-0.5 shrink-0" /> <span>{success}</span>
        </div>
      )}

      <div className="vault-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-vault-text flex items-center gap-2"><Lock className="w-4 h-4 text-vault-danger" /> Vault Lock</h2>
        <p className="text-xs text-vault-textSecondary">Lock the vault to secure all data. You will need to re-enter your passphrase to access it again.</p>
        <button onClick={handleLock} className="vault-btn-danger"><Lock className="w-4 h-4" /> Lock Vault Now</button>
      </div>

      <div className="vault-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-vault-text flex items-center gap-2"><Download className="w-4 h-4 text-vault-primary" /> Backup Vault Header</h2>
        <p className="text-xs text-vault-textSecondary">Create a backup of the vault header. Store this securely — without it, data recovery is impossible if the header is corrupted.</p>
        <button onClick={handleBackup} className="vault-btn-primary"><Download className="w-4 h-4" /> Backup Header</button>
      </div>

      <div className="vault-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-vault-text flex items-center gap-2"><Settings className="w-4 h-4 text-vault-primary" /> Add Key Slot</h2>
        <form onSubmit={handleAddKey} className="space-y-3">
          <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Current passphrase" className="vault-input w-full" required />
          <input type="password" value={newPassphrase} onChange={e => setNewPassphrase(e.target.value)} placeholder="New passphrase" className="vault-input w-full" required />
          <input type="password" value={confirmPassphrase} onChange={e => setConfirmPassphrase(e.target.value)} placeholder="Confirm new passphrase" className="vault-input w-full" required />
          <button type="submit" disabled={loading} className="vault-btn-primary">{loading ? 'Processing...' : 'Add Key Slot'}</button>
        </form>
      </div>

      <div className="vault-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-vault-text flex items-center gap-2"><Settings className="w-4 h-4 text-vault-danger" /> Remove Key Slot</h2>
        <form onSubmit={handleRemoveKey} className="space-y-3">
          <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Current passphrase" className="vault-input w-full" required />
          <input type="number" value={slotIndex} onChange={e => setSlotIndex(e.target.value)} placeholder="Slot index to remove (0-7)" className="vault-input w-full" required min={0} max={7} />
          <button type="submit" disabled={loading} className="vault-btn-danger">{loading ? 'Processing...' : 'Remove Key Slot'}</button>
        </form>
      </div>

      {vaultState?.device_info && (
        <div className="vault-card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-vault-text">Device Information</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-vault-textMuted">Type</div><div className="text-vault-text font-mono">{vaultState.device_info.type || 'N/A'}</div>
            <div className="text-vault-textMuted">Cipher</div><div className="text-vault-text font-mono">{vaultState.device_info.cipher || 'N/A'}</div>
            <div className="text-vault-textMuted">Key Slots</div><div className="text-vault-text font-mono">{vaultState.device_info.keySlots}/{vaultState.device_info.totalSlots}</div>
            <div className="text-vault-textMuted">UUID</div><div className="text-vault-text font-mono truncate">{vaultState.device_info.uuid || 'N/A'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
