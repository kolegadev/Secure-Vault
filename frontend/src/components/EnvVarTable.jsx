import React, { useState, useEffect, useCallback } from 'react'
import { KeyRound, Plus, Search, Trash2, Eye, EyeOff, Download, Filter, X, FileText } from 'lucide-react'
import { useApi, useFetch } from '../hooks/useApi'
import { marked } from 'marked'

function EnvVarModal({ isOpen, onClose, onSave, editVar, skills, services }) {
  const [form, setForm] = useState({ name: '', value: '', description: '', service_name: '', api_docs_url: '', skill_id: '' })
  const [showValue, setShowValue] = useState(false)

  useEffect(() => {
    if (editVar) {
      setForm({
        name: editVar.name || '',
        value: editVar.value || '',
        description: editVar.description || '',
        service_name: editVar.service_name || '',
        api_docs_url: editVar.api_docs_url || '',
        skill_id: editVar.skill_id || '',
      })
    } else {
      setForm({ name: '', value: '', description: '', service_name: '', api_docs_url: '', skill_id: '' })
    }
  }, [editVar, isOpen])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(form)
  }

  const preview = Object.entries(form)
    .filter(([k, v]) => k !== 'description' && k !== 'api_docs_url' && v)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <h2 className="text-lg font-semibold text-vault-text">{editVar ? 'Edit Variable' : 'New Variable'}</h2>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="API_KEY"
                className="vault-input w-full font-mono"
                required
                disabled={!!editVar}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Value</label>
              <div className="relative">
                <input
                  type={showValue ? 'text' : 'password'}
                  value={form.value}
                  onChange={e => setForm({ ...form, value: e.target.value })}
                  placeholder="secret-value"
                  className="vault-input w-full pr-10 font-mono"
                  required
                />
                <button type="button" onClick={() => setShowValue(!showValue)} className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-textMuted">
                  {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What is this variable used for?"
                className="vault-input w-full h-20 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Service</label>
              <select
                value={form.service_name}
                onChange={e => setForm({ ...form, service_name: e.target.value })}
                className="vault-input w-full"
              >
                <option value="">None</option>
                {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Skill</label>
              <select
                value={form.skill_id}
                onChange={e => setForm({ ...form, skill_id: e.target.value })}
                className="vault-input w-full"
              >
                <option value="">None</option>
                {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">API Docs URL</label>
              <input
                value={form.api_docs_url}
                onChange={e => setForm({ ...form, api_docs_url: e.target.value })}
                placeholder="https://api.example.com/docs"
                className="vault-input w-full"
              />
            </div>
          </div>

          <div className="vault-card p-3 bg-vault-bg">
            <p className="text-xs font-medium text-vault-textSecondary mb-1">.env Preview</p>
            <pre className="text-xs font-mono text-vault-textSecondary whitespace-pre-wrap">{preview || '# Fill in name and value to see preview'}</pre>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="vault-btn-ghost">Cancel</button>
            <button type="submit" className="vault-btn-primary">{editVar ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function EnvVarTable() {
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [editVar, setEditVar] = useState(null)
  const [revealedIds, setRevealedIds] = useState(new Set())
  const { request } = useApi()

  const { data: envVars, loading, error, refetch } = useFetch(`/env?search=${search}&service=${serviceFilter}`)
  const { data: skills } = useFetch('/skills')
  const { data: services } = useFetch('/services')

  const handleSave = async (form) => {
    try {
      if (editVar) {
        await request(`/env/${editVar.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await request('/env', { method: 'POST', body: JSON.stringify(form) })
      }
      setModalOpen(false)
      setEditVar(null)
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this variable?')) return
    try {
      await request(`/env/${id}`, { method: 'DELETE' })
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} variables?`)) return
    try {
      await request('/env/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: Array.from(selectedIds) }) })
      setSelectedIds(new Set())
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const toggleReveal = (id) => {
    setRevealedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExport = async () => {
    try {
      const response = await fetch('/api/env/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
          service_name: serviceFilter || undefined,
        }),
      })
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '.env'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + err.message)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-vault-text">Environment Variables</h1>
          <p className="text-sm text-vault-textSecondary mt-1">Manage secrets and configuration</p>
        </div>
        <button onClick={() => { setEditVar(null); setModalOpen(true) }} className="vault-btn-primary">
          <Plus className="w-4 h-4" /> New Variable
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-textMuted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search variables..."
            className="vault-input w-full pl-9"
          />
        </div>
        <select
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
          className="vault-input w-full sm:w-48"
        >
          <option value="">All Services</option>
          {services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-vault-primaryMuted">
          <span className="text-sm text-vault-primary font-medium">{selectedIds.size} selected</span>
          <div className="ml-auto flex gap-2">
            <button onClick={handleExport} className="vault-btn-ghost text-xs"><Download className="w-3 h-3" /> Export</button>
            <button onClick={handleBulkDelete} className="vault-btn-danger text-xs"><Trash2 className="w-3 h-3" /> Delete</button>
          </div>
        </div>
      )}

      <div className="vault-card overflow-hidden">
        <table className="vault-table">
          <thead>
            <tr>
              <th className="w-10"><input type="checkbox" className="rounded border-vault-border bg-vault-bg" onChange={e => {
                if (e.target.checked) setSelectedIds(new Set(envVars?.map(v => v.id) || []))
                else setSelectedIds(new Set())
              }} /></th>
              <th>Name</th>
              <th>Value</th>
              <th>Service</th>
              <th>Skill</th>
              <th className="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center py-8 text-vault-textSecondary">Loading...</td></tr>
            )}
            {error && (
              <tr><td colSpan={6} className="text-center py-8 text-vault-danger">{error}</td></tr>
            )}
            {envVars?.map(v => (
              <tr key={v.id}>
                <td><input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} className="rounded border-vault-border bg-vault-bg" /></td>
                <td className="font-mono text-vault-primary">{v.name}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{revealedIds.has(v.id) ? v.value : v.value}</span>
                    <button onClick={() => toggleReveal(v.id)} className="text-vault-textMuted hover:text-vault-text">
                      {revealedIds.has(v.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </td>
                <td>{v.service_name || '-'}</td>
                <td>{v.skill_id ? (skills?.find(s => s.id === v.skill_id)?.name || v.skill_id) : '-'}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditVar(v); setModalOpen(true) }} className="p-1.5 rounded hover:bg-vault-surfaceHighlight text-vault-textSecondary hover:text-vault-text">
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded hover:bg-vault-dangerMuted text-vault-textSecondary hover:text-vault-danger">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {envVars?.length === 0 && !loading && (
              <tr><td colSpan={6} className="text-center py-8 text-vault-textSecondary">No variables found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <EnvVarModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        editVar={editVar}
        skills={skills || []}
        services={services || []}
      />
    </div>
  )
}
