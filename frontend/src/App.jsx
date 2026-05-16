import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Shield, KeyRound, Database, Wrench, Settings, Activity, LogOut, Menu, X } from 'lucide-react'
import { useVaultStatus } from './hooks/useVaultStatus'
import { useApi } from './hooks/useApi'
import LoginView from './components/LoginView'
import Dashboard from './components/Dashboard'
import EnvVarTable from './components/EnvVarTable'
import SkillRegistry from './components/SkillRegistry'
import ServiceManager from './components/ServiceManager'
import SettingsView from './components/SettingsView'

const NAV_ITEMS = [
  { path: '/', icon: Activity, label: 'Dashboard' },
  { path: '/env-vars', icon: KeyRound, label: 'Env Variables' },
  { path: '/skills', icon: Wrench, label: 'Skills' },
  { path: '/services', icon: Database, label: 'Services' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

function Sidebar({ onClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { request } = useApi()

  const handleLogout = async () => {
    try {
      await request('/auth/logout', { method: 'POST', body: JSON.stringify({ lock: false }) })
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  return (
    <aside className="w-64 bg-vault-surface border-r border-vault-border flex flex-col h-screen fixed left-0 top-0 z-40">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-vault-border">
        <div className="w-9 h-9 rounded-lg bg-vault-primary/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-vault-primary" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-tight text-vault-text">OpenClaw</h1>
          <p className="text-[10px] text-vault-textSecondary uppercase tracking-widest">Secure Vault</p>
        </div>
        <button onClick={onClose} className="ml-auto lg:hidden text-vault-textSecondary hover:text-vault-text">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); onClose?.() }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? 'bg-vault-primaryMuted text-vault-primary'
                  : 'text-vault-textSecondary hover:text-vault-text hover:bg-vault-surfaceHighlight'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-vault-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-vault-textSecondary hover:text-vault-danger hover:bg-vault-dangerMuted transition-all"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </aside>
  )
}

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { vaultState, usbState, connected } = useVaultStatus()

  return (
    <div className="min-h-screen bg-vault-bg text-vault-text">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-vault-surface border-b border-vault-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} className="text-vault-textSecondary">
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-semibold text-sm">OpenClaw Vault</span>
        <div className="ml-auto flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-vault-primary' : 'bg-vault-danger'} animate-pulse`} />
          <div className={`w-2 h-2 rounded-full ${usbState.present ? 'bg-vault-primary' : 'bg-vault-textMuted'}`} />
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`fixed lg:translate-x-0 transition-transform z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setAuthenticated(data.data?.authenticated && data.data?.vaultMounted)
        setAuthChecked(true)
      })
      .catch(() => setAuthChecked(true))
  }, [])

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-vault-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-vault-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return <LoginView onLogin={() => setAuthenticated(true)} />
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/env-vars" element={<EnvVarTable />} />
        <Route path="/skills" element={<SkillRegistry />} />
        <Route path="/services" element={<ServiceManager />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}
