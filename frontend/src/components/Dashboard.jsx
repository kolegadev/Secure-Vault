import React, { useEffect } from 'react'
import { Shield, KeyRound, Wrench, Database, Lock, Unlock, Usb, Activity, Clock } from 'lucide-react'
import { useVaultStatus } from '../hooks/useVaultStatus'
import { useFetch } from '../hooks/useApi'

function StatCard({ icon: Icon, label, value, color = 'text-vault-primary', bg = 'bg-vault-primaryMuted' }) {
  return (
    <div className="vault-card p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-vault-textSecondary uppercase tracking-wider">{label}</p>
          <p className="text-xl font-bold text-vault-text">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { vaultState, usbState } = useVaultStatus()
  const { data: envCount, refetch: refetchEnv } = useFetch('/env?limit=0')
  const { data: skillsData, refetch: refetchSkills } = useFetch('/skills')
  const { data: servicesData, refetch: refetchServices } = useFetch('/services')
  const { data: activityData } = useFetch('/activity?limit=10')

  useEffect(() => {
    refetchEnv()
    refetchSkills()
    refetchServices()
  }, [])

  const state = vaultState?.state || 'locked'
  const isMounted = state === 'mounted'

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-vault-text">Dashboard</h1>
        <p className="text-sm text-vault-textSecondary mt-1">System overview and quick actions</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={isMounted ? Unlock : Lock}
          label="Vault State"
          value={state.charAt(0).toUpperCase() + state.slice(1)}
          color={isMounted ? 'text-vault-primary' : 'text-vault-danger'}
          bg={isMounted ? 'bg-vault-primaryMuted' : 'bg-vault-dangerMuted'}
        />
        <StatCard icon={KeyRound} label="Env Variables" value={envCount?.length ?? 0} />
        <StatCard icon={Wrench} label="Skills" value={skillsData?.length ?? 0} />
        <StatCard icon={Database} label="Services" value={servicesData?.length ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="vault-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-vault-text mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-vault-primary" />
            Recent Activity
          </h2>
          {activityData && activityData.length > 0 ? (
            <div className="space-y-2">
              {activityData.map(item => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-vault-border last:border-0">
                  <div className="w-2 h-2 rounded-full bg-vault-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-vault-text truncate">{item.action} {item.target_type}</p>
                    <p className="text-xs text-vault-textSecondary">{item.details}</p>
                  </div>
                  <span className="text-xs text-vault-textMuted whitespace-nowrap">
                    {new Date(item.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-vault-textSecondary">No recent activity</p>
          )}
        </div>

        <div className="vault-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-vault-text flex items-center gap-2">
            <Shield className="w-4 h-4 text-vault-primary" />
            Vault Status
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-vault-textSecondary">State</span>
              <span className={`vault-badge ${isMounted ? 'vault-badge-green' : 'vault-badge-red'}`}>
                {state}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-vault-textSecondary">USB Device</span>
              <span className={`vault-badge ${usbState.present ? 'vault-badge-green' : 'vault-badge-amber'}`}>
                {usbState.present ? 'Present' : 'Absent'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-vault-textSecondary">Device Path</span>
              <span className="text-xs font-mono text-vault-text">{vaultState?.device_path || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-vault-textSecondary">Mount Point</span>
              <span className="text-xs font-mono text-vault-text">{vaultState?.mount_point || 'N/A'}</span>
            </div>
            {vaultState?.last_unlocked_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-vault-textSecondary flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last Unlocked
                </span>
                <span className="text-xs text-vault-text">
                  {new Date(vaultState.last_unlocked_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
