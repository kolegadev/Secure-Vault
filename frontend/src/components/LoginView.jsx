import React, { useState } from 'react'
import { Shield, Lock, Unlock, Usb, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useVaultStatus } from '../hooks/useVaultStatus'
import { useApi } from '../hooks/useApi'

export default function LoginView({ onLogin }) {
  const [passphrase, setPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { vaultState, usbState } = useVaultStatus()
  const { request } = useApi()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      })

      if (result.success) {
        onLogin()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setPassphrase('')
    }
  }

  const state = vaultState?.state || 'locked'
  const stateConfig = {
    locked: { icon: Lock, color: 'text-vault-danger', bg: 'bg-vault-dangerMuted', label: 'Locked' },
    unlocked: { icon: Unlock, color: 'text-vault-warning', bg: 'bg-amber-500/15', label: 'Unlocked' },
    mounted: { icon: Unlock, color: 'text-vault-primary', bg: 'bg-vault-primaryMuted', label: 'Mounted' },
  }

  const currentState = stateConfig[state] || stateConfig.locked

  return (
    <div className="min-h-screen bg-vault-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-vault-primary/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-vault-primary" />
          </div>
          <h1 className="text-2xl font-bold text-vault-text mb-1">OpenClaw Secure Vault</h1>
          <p className="text-sm text-vault-textSecondary">Encrypted USB vault management</p>
        </div>

        <div className="vault-card p-6 space-y-6">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${currentState.bg}`}>
              <currentState.icon className={`w-4 h-4 ${currentState.color}`} />
              <span className={`text-xs font-medium ${currentState.color}`}>{currentState.label}</span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${usbState.present ? 'bg-vault-primaryMuted' : 'bg-vault-surfaceHighlight'}`}>
              <Usb className={`w-4 h-4 ${usbState.present ? 'text-vault-primary' : 'text-vault-textMuted'}`} />
              <span className={`text-xs font-medium ${usbState.present ? 'text-vault-primary' : 'text-vault-textMuted'}`}>
                {usbState.present ? 'USB Present' : 'No USB'}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-vault-textSecondary mb-1.5">Vault Passphrase</label>
              <div className="relative">
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter vault passphrase"
                  className="vault-input w-full pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-textMuted hover:text-vault-text"
                >
                  {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-vault-dangerMuted text-vault-danger text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !passphrase}
              className="vault-btn-primary w-full"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-vault-bg border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  Unlock Vault
                </>
              )}
            </button>
          </form>

          {vaultState?.device_info && (
            <div className="pt-4 border-t border-vault-border space-y-2">
              <p className="text-xs font-medium text-vault-textSecondary uppercase tracking-wider">Device Info</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-vault-textMuted">Device</div>
                <div className="text-vault-text font-mono">{vaultState.device_path}</div>
                <div className="text-vault-textMuted">Cipher</div>
                <div className="text-vault-text font-mono">{vaultState.device_info.cipher || 'N/A'}</div>
                <div className="text-vault-textMuted">Key Slots</div>
                <div className="text-vault-text font-mono">{vaultState.device_info.keySlots}/{vaultState.device_info.totalSlots}</div>
                <div className="text-vault-textMuted">UUID</div>
                <div className="text-vault-text font-mono truncate">{vaultState.device_info.uuid || 'N/A'}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
