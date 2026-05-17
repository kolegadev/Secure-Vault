import React, { useState } from 'react'
import { Wrench, Plus, Search, RefreshCw, ExternalLink, Trash2, FileText, Check, X, Cloud, Download, Key, Tag, ChevronDown, ChevronRight } from 'lucide-react'
import { useApi, useFetch } from '../hooks/useApi'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

function SkillModal({ isOpen, onClose, onSave }) {
  const BLANK = '---\nname: \ndescription: \nversion: 1.0.0\nopenclaw:\n  entry: skill.js\n---\n\n# Skill Documentation\n\nDescribe your skill here.\n'
  const [name, setName] = useState('')
  const [content, setContent] = useState(BLANK)
  const fileInputRef = React.useRef(null)

  if (!isOpen) return null

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const inferredName = file.name.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ')
    const reader = new FileReader()
    reader.onload = (ev) => {
      setContent(ev.target.result)
      if (!name) setName(inferredName)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleSave = () => {
    onSave({ name: name || 'New Skill', content })
    setName('')
    setContent(BLANK)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <h2 className="text-lg font-semibold text-vault-text">New Skill</h2>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-vault-textSecondary mb-1 block">Skill name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. My Skill"
                className="vault-input w-full"
              />
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept=".md,.txt" className="hidden" onChange={handleFile} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="vault-btn-ghost flex items-center gap-2"
                title="Upload a .md file to populate the editor"
              >
                <FileText className="w-4 h-4" /> Upload .md
              </button>
            </div>
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="vault-input w-full h-64 font-mono text-sm"
          />
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="vault-btn-ghost">Cancel</button>
            <button onClick={handleSave} className="vault-btn-primary">Create</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function extractSkillMeta(fm) {
  const empty = { emoji: null, version: null, author: null, license: null, repository: null, homepage: null, entry: null, primaryEnv: null, envVars: [], deps: [], tags: [], triggers: [] }
  if (!fm || typeof fm !== 'object') return empty
  const ns = fm.openclaw || fm.clawdbot || fm.metadata?.openclaw || fm.metadata?.clawdbot || {}
  const requires = fm.requires || ns.requires || {}
  const envVars = Array.isArray(requires.env) ? requires.env : []
  const pythonDeps = Array.isArray(requires.python) ? requires.python.map(d => `python: ${d}`) : []
  const nodeDeps = Array.isArray(requires.node) ? requires.node.map(d => `node: ${d}`) : []
  const otherDeps = Array.isArray(requires.deps) ? requires.deps : (Array.isArray(requires.dependencies) ? requires.dependencies : [])
  const deps = [...pythonDeps, ...nodeDeps, ...otherDeps]
  const tags = Array.isArray(fm.tags) ? fm.tags : (Array.isArray(ns.tags) ? ns.tags : [])
  const triggers = Array.isArray(fm.triggers) ? fm.triggers : []
  return {
    emoji: ns.emoji || null,
    version: fm.version || null,
    author: fm.author || fm.owner || null,
    license: fm.license || null,
    repository: fm.repository || null,
    homepage: fm.homepage || null,
    entry: ns.entry || null,
    primaryEnv: ns.primaryEnv || null,
    envVars,
    deps,
    tags,
    triggers,
  }
}

function SkillDetailModal({ skill, onClose }) {
  const [rawOpen, setRawOpen] = useState(false)
  if (!skill) return null

  const meta = extractSkillMeta(skill.frontmatter)
  const rawHtml = skill.body ? marked.parse(skill.body, { async: false }) : ''
  const sanitizedHtml = DOMPurify.sanitize(rawHtml)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-start justify-between p-5 border-b border-vault-border gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {meta.emoji && <span className="text-2xl leading-none mt-0.5">{meta.emoji}</span>}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-vault-text truncate">{skill.name}</h2>
              {skill.description && <p className="text-sm text-vault-textSecondary mt-1">{skill.description}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-vault-textMuted">
                {meta.version && <span>v{meta.version}</span>}
                {meta.license && <span>{meta.license}</span>}
                {meta.author && <span>by {meta.author}</span>}
                {meta.repository && <a href={meta.repository} target="_blank" rel="noreferrer" className="text-vault-primary hover:underline inline-flex items-center gap-1">repo <ExternalLink className="w-3 h-3" /></a>}
                {meta.homepage && <a href={meta.homepage} target="_blank" rel="noreferrer" className="text-vault-primary hover:underline inline-flex items-center gap-1">homepage <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {skill.loading && <p className="text-sm text-vault-textSecondary">Loading skill content...</p>}
          {skill.loadError && <p className="text-sm text-vault-danger">Failed to load content: {skill.loadError}</p>}

          {meta.envVars.length > 0 && (
            <div className="vault-card p-4 border-vault-warning/40 bg-vault-warning/5">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-vault-warning" />
                <h3 className="text-sm font-semibold text-vault-text">Required environment variables</h3>
              </div>
              <ul className="space-y-1">
                {meta.envVars.map(name => (
                  <li key={name} className="flex items-center gap-2 text-xs">
                    <code className="font-mono px-2 py-0.5 rounded bg-vault-bg text-vault-text">{name}</code>
                    {name === meta.primaryEnv && <span className="text-[10px] text-vault-textMuted">primary</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {meta.deps.length > 0 && (
            <div className="vault-card p-4">
              <h3 className="text-sm font-semibold text-vault-text mb-2">Dependencies</h3>
              <ul className="text-xs text-vault-textSecondary list-disc list-inside space-y-0.5">
                {meta.deps.map(d => <li key={d}><code className="font-mono">{d}</code></li>)}
              </ul>
            </div>
          )}

          {(meta.triggers.length > 0 || meta.tags.length > 0 || meta.entry) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {meta.entry && (
                <div className="vault-card p-3">
                  <p className="text-[10px] uppercase tracking-wide text-vault-textMuted mb-1">Entry</p>
                  <code className="text-xs font-mono text-vault-text">{meta.entry}</code>
                </div>
              )}
              {meta.tags.length > 0 && (
                <div className="vault-card p-3">
                  <p className="text-[10px] uppercase tracking-wide text-vault-textMuted mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {meta.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-vault-bg text-vault-textSecondary">{t}</span>)}
                  </div>
                </div>
              )}
              {meta.triggers.length > 0 && (
                <div className="vault-card p-3 sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-wide text-vault-textMuted mb-1">Triggers</p>
                  <div className="flex flex-wrap gap-1">
                    {meta.triggers.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-vault-bg text-vault-textSecondary font-mono">"{t}"</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {!skill.loading && !skill.body && !skill.loadError && (
            <p className="text-sm text-vault-textSecondary italic">This skill has no README body — only frontmatter.</p>
          )}
          {sanitizedHtml && (
            <div
              className="text-sm text-vault-textSecondary leading-relaxed border-t border-vault-border pt-4
                [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-vault-text [&_h1]:mt-5 [&_h1]:mb-2
                [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-vault-text [&_h2]:mt-4 [&_h2]:mb-2
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-vault-text [&_h3]:mt-3 [&_h3]:mb-1
                [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-vault-text [&_h4]:mt-2
                [&_p]:my-2
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                [&_li]:my-0.5
                [&_a]:text-vault-primary [&_a]:underline hover:[&_a]:no-underline
                [&_strong]:text-vault-text [&_strong]:font-semibold
                [&_code]:font-mono [&_code]:text-xs [&_code]:bg-vault-bg [&_code]:text-vault-text [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                [&_pre]:bg-vault-bg [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-3 [&_pre]:border [&_pre]:border-vault-border
                [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:text-vault-text
                [&_blockquote]:border-l-2 [&_blockquote]:border-vault-border [&_blockquote]:pl-3 [&_blockquote]:text-vault-textMuted [&_blockquote]:my-3
                [&_hr]:border-vault-border [&_hr]:my-4
                [&_table]:text-xs [&_th]:text-vault-text [&_th]:font-semibold [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_td]:border [&_th]:border-vault-border [&_td]:border-vault-border"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          )}

          {skill.frontmatter && (
            <div className="border-t border-vault-border pt-3">
              <button onClick={() => setRawOpen(o => !o)} className="text-xs text-vault-textMuted hover:text-vault-text flex items-center gap-1">
                {rawOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Raw frontmatter
              </button>
              {rawOpen && (
                <pre className="text-xs font-mono text-vault-textSecondary whitespace-pre-wrap mt-2 p-3 rounded bg-vault-bg">{JSON.stringify(skill.frontmatter, null, 2)}</pre>
              )}
            </div>
          )}
          {skill.path && <p className="text-[10px] font-mono text-vault-textMuted pt-1">{skill.path}</p>}
        </div>
      </div>
    </div>
  )
}

function ClawHubBrowserModal({ isOpen, onClose, onInstalled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [installing, setInstalling] = useState({})
  const [installed, setInstalled] = useState({})
  const { request } = useApi()

  if (!isOpen) return null

  const handleSearch = async (e) => {
    e?.preventDefault?.()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const resp = await request(`/clawhub/search?q=${encodeURIComponent(query)}&limit=20`)
      setResults(resp?.data?.results || [])
    } catch (err) {
      setSearchError(err.message)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleInstall = async (slug) => {
    setInstalling(p => ({ ...p, [slug]: true }))
    try {
      await request('/clawhub/install', { method: 'POST', body: JSON.stringify({ slug }) })
      setInstalled(p => ({ ...p, [slug]: true }))
      onInstalled?.()
    } catch (err) {
      alert(`Install failed: ${err.message}`)
    } finally {
      setInstalling(p => ({ ...p, [slug]: false }))
    }
  }

  const handleClose = () => {
    setQuery('')
    setResults(null)
    setSearchError(null)
    setInstalled({})
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <h2 className="text-lg font-semibold text-vault-text flex items-center gap-2">
            <Cloud className="w-5 h-5" /> Browse ClawHub
          </h2>
          <button onClick={handleClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-textMuted" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search ClawHub (e.g. hello, weather, calendar)..."
                className="vault-input w-full pl-9"
              />
            </div>
            <button type="submit" disabled={searching || !query.trim()} className="vault-btn-primary">
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchError && <p className="text-sm text-vault-danger">{searchError}</p>}

          {results && results.length === 0 && !searching && (
            <p className="text-sm text-vault-textSecondary">No results.</p>
          )}

          <div className="space-y-2">
            {results?.map(r => (
              <div key={r.slug} className="vault-card p-3 flex items-start gap-3">
                {r.owner?.image && (
                  <img src={r.owner.image} alt="" className="w-8 h-8 rounded-full mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-vault-text truncate">{r.displayName || r.slug}</h3>
                    <span className="text-[10px] text-vault-textMuted">@{r.ownerHandle}</span>
                  </div>
                  <p className="text-xs text-vault-textSecondary line-clamp-2 mt-1">{r.summary || 'No description'}</p>
                  <p className="text-[10px] text-vault-textMuted mt-1 font-mono">{r.slug}</p>
                </div>
                <button
                  onClick={() => handleInstall(r.slug)}
                  disabled={installing[r.slug] || installed[r.slug]}
                  className={installed[r.slug] ? 'vault-btn-ghost text-xs' : 'vault-btn-primary text-xs'}
                >
                  {installed[r.slug] ? (<><Check className="w-3 h-3" /> Installed</>) :
                   installing[r.slug] ? 'Installing...' :
                   (<><Download className="w-3 h-3" /> Install</>)}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SkillRegistry() {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [clawhubOpen, setClawhubOpen] = useState(false)
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

  const handleCreate = async ({ name, content }) => {
    try {
      await request('/skills', { method: 'POST', body: JSON.stringify({ name, content }) })
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

  const handleView = async (skill) => {
    setDetailSkill({ ...skill, body: '', frontmatter: null, loading: true })
    try {
      const resp = await request(`/skills/${skill.id}`)
      setDetailSkill(resp?.data || skill)
    } catch (err) {
      setDetailSkill({ ...skill, body: '', frontmatter: null, loadError: err.message })
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
          <button onClick={() => setClawhubOpen(true)} className="vault-btn-ghost"><Cloud className="w-4 h-4" /> Browse ClawHub</button>
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
              <button onClick={() => handleView(skill)} className="vault-btn-ghost text-xs flex-1"><FileText className="w-3 h-3" /> View</button>
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
      <ClawHubBrowserModal isOpen={clawhubOpen} onClose={() => setClawhubOpen(false)} onInstalled={refetch} />
      <SkillDetailModal skill={detailSkill} onClose={() => setDetailSkill(null)} />
    </div>
  )
}
