import React, { useState } from 'react'
import { Wrench, Plus, Search, RefreshCw, ExternalLink, Trash2, FileText, Check, X } from 'lucide-react'
import { useApi, useFetch } from '../hooks/useApi'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

function SkillModal({ isOpen, onClose, onSave }) {
  const [content, setContent] = useState('---\nname: \ndescription: \nversion: 1.0.0\nopenclaw:\n  entry: skill.js\n---\n\n# Skill Documentation\n\nDescribe your skill here.\n')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <h2 className="text-lg font-semibold text-vault-text">New Skill</h2>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="vault-input w-full h-64 font-mono text-sm"
          />
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="vault-btn-ghost">Cancel</button>
            <button onClick={() => onSave(content)} className="vault-btn-primary">Create</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkillDetailModal({ skill, onClose }) {
  if (!skill) return null

  const rawHtml = skill.body ? marked.parse(skill.body, { async: false }) : ''
  const sanitizedHtml = DOMPurify.sanitize(rawHtml)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <h2 className="text-lg font-semibold text-vault-text">{skill.name}</h2>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {skill.frontmatter && (
            <div className="vault-card p-3 bg-vault-bg">
              <pre className="text-xs font-mono text-vault-textSecondary">{JSON.stringify(skill.frontmatter, null, 2)}</pre>
            </div>
          )}
          <div className="prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </div>
      </div>
    </div>
  )
}

export default function SkillRegistry() {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [detailSkill, setDetailSkill] = useState(null)
  const { request } = useApi()
  const { data: skills, loading, error, refetch } = useFetch(`/skills?search=${search}`)

  const handleScan = async () => {
    try {
      await request('/skills/scan', { method: 'POST' })
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleCreate = async (content) => {
    try {
      await request('/skills', { method: 'POST', body: JSON.stringify({ name: 'New Skill', content }) })
      setModalOpen(false)
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleInstall = async (id) => {
    try {
      await request(`/skills/${id}/install`, { method: 'POST' })
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleUninstall = async (id) => {
    try {
      await request(`/skills/${id}/uninstall`, { method: 'POST' })
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-vault-text">Skill Registry</h1>
          <p className="text-sm text-vault-textSecondary mt-1">Manage OpenClaw skills and YAML frontmatter</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleScan} className="vault-btn-ghost"><RefreshCw className="w-4 h-4" /> Scan</button>
          <button onClick={() => setModalOpen(true)} className="vault-btn-primary"><Plus className="w-4 h-4" /> New Skill</button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-textMuted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="vault-input w-full pl-9"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <p className="text-vault-textSecondary col-span-full">Loading...</p>}
        {error && <p className="text-vault-danger col-span-full">{error}</p>}
        {skills?.map(skill => (
          <div key={skill.id} className="vault-card p-4 space-y-3 hover:border-vault-primary/30 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-vault-primary" />
                <h3 className="font-semibold text-sm text-vault-text">{skill.name}</h3>
              </div>
              {skill.installed_at && <span className="vault-badge-green text-[10px]">Installed</span>}
            </div>
            <p className="text-xs text-vault-textSecondary line-clamp-2">{skill.description || 'No description'}</p>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={() => setDetailSkill(skill)} className="vault-btn-ghost text-xs flex-1"><FileText className="w-3 h-3" /> View</button>
              {skill.installed_at ? (
                <button onClick={() => handleUninstall(skill.id)} className="vault-btn-ghost text-xs flex-1 text-vault-danger"><X className="w-3 h-3" /> Uninstall</button>
              ) : (
                <button onClick={() => handleInstall(skill.id)} className="vault-btn-primary text-xs flex-1"><Check className="w-3 h-3" /> Install</button>
              )}
            </div>
          </div>
        ))}
        {skills?.length === 0 && !loading && <p className="text-vault-textSecondary col-span-full">No skills found</p>}
      </div>

      <SkillModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleCreate} />
      <SkillDetailModal skill={detailSkill} onClose={() => setDetailSkill(null)} />
    </div>
  )
}
