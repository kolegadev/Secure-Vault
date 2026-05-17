import React, { useState } from 'react'
import { Database, Plus, Search, FileText, Trash2, ExternalLink, X, KeyRound, Wrench } from 'lucide-react'
import { useApi, useFetch } from '../hooks/useApi'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

function ReadmePreviewModal({ data, onClose }) {
  if (!data) return null
  const rawHtml = data.content ? marked.parse(data.content, { async: false }) : ''
  const sanitizedHtml = DOMPurify.sanitize(rawHtml)
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <div>
            <h2 className="text-lg font-semibold text-vault-text">README for {data.serviceName}</h2>
            <p className="text-[10px] font-mono text-vault-textMuted mt-0.5">/mnt/optimus-usb/services/{data.serviceName}.md</p>
          </div>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <div
            className="text-sm text-vault-textSecondary leading-relaxed
              [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-vault-text [&_h1]:mt-5 [&_h1]:mb-2
              [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-vault-text [&_h2]:mt-4 [&_h2]:mb-2
              [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-vault-text [&_h3]:mt-3 [&_h3]:mb-1
              [&_p]:my-2
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
              [&_li]:my-0.5
              [&_a]:text-vault-primary [&_a]:underline hover:[&_a]:no-underline
              [&_strong]:text-vault-text [&_strong]:font-semibold
              [&_code]:font-mono [&_code]:text-xs [&_code]:bg-vault-bg [&_code]:text-vault-text [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
              [&_pre]:bg-vault-bg [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-3 [&_pre]:border [&_pre]:border-vault-border
              [&_blockquote]:border-l-2 [&_blockquote]:border-vault-border [&_blockquote]:pl-3 [&_blockquote]:text-vault-textMuted [&_blockquote]:my-3
              [&_hr]:border-vault-border [&_hr]:my-4
              [&_table]:text-xs [&_table]:border-collapse [&_table]:my-3
              [&_th]:text-vault-text [&_th]:font-semibold [&_th]:px-2 [&_th]:py-1 [&_th]:border [&_th]:border-vault-border [&_th]:bg-vault-bg
              [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-vault-border"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </div>
      </div>
    </div>
  )
}

function ServiceModal({ isOpen, onClose, onSave, editService }) {
  const [form, setForm] = useState({ name: '', description: '', swagger_url: '' })

  React.useEffect(() => {
    if (editService) {
      setForm({ name: editService.name || '', description: editService.description || '', swagger_url: editService.swagger_url || '' })
    } else {
      setForm({ name: '', description: '', swagger_url: '' })
    }
  }, [editService, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <h2 className="text-lg font-semibold text-vault-text">{editService ? 'Edit Service' : 'New Service'}</h2>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="vault-input w-full" required disabled={!!editService} />
          </div>
          <div>
            <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="vault-input w-full h-20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-vault-textSecondary mb-1.5">Swagger URL</label>
            <input value={form.swagger_url} onChange={e => setForm({ ...form, swagger_url: e.target.value })} placeholder="https://api.example.com/swagger" className="vault-input w-full" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="vault-btn-ghost">Cancel</button>
            <button type="submit" className="vault-btn-primary">{editService ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ServiceDetail({ service, onClose }) {
  if (!service) return null
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="vault-card w-full max-w-xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-vault-border">
          <h2 className="text-lg font-semibold text-vault-text">{service.name}</h2>
          <button onClick={onClose} className="text-vault-textSecondary hover:text-vault-text"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-vault-textSecondary">{service.description || 'No description'}</p>
          {service.swagger_url && (
            <a href={service.swagger_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-vault-primary hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Swagger Docs
            </a>
          )}
          <div className="pt-4 border-t border-vault-border">
            <h3 className="text-sm font-semibold text-vault-text mb-2 flex items-center gap-2"><KeyRound className="w-4 h-4 text-vault-primary" /> Environment Variables</h3>
            {service.env_vars?.length > 0 ? (
              <div className="space-y-1">
                {service.env_vars.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-vault-bg">
                    <span className="font-mono text-xs text-vault-primary">{ev.name}</span>
                    <span className="text-xs text-vault-textSecondary">{ev.description || ''}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-vault-textSecondary">No linked variables</p>}
          </div>
          <div className="pt-4 border-t border-vault-border">
            <h3 className="text-sm font-semibold text-vault-text mb-2 flex items-center gap-2"><Wrench className="w-4 h-4 text-vault-primary" /> Linked Skills</h3>
            {service.skills?.length > 0 ? (
              <div className="space-y-1">
                {service.skills.map(s => (
                  <div key={s.id} className="flex items-center gap-2 py-1.5 px-2 rounded bg-vault-bg">
                    <span className="text-xs text-vault-text">{s.name}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-vault-textSecondary">No linked skills</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ServiceManager() {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editService, setEditService] = useState(null)
  const [detailService, setDetailService] = useState(null)
  const [readmePreview, setReadmePreview] = useState(null)
  const { request } = useApi()
  const { data: services, loading, error, refetch } = useFetch(`/services?search=${search}`)

  const handleSave = async (form) => {
    try {
      if (editService) {
        await request(`/services/${editService.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await request('/services', { method: 'POST', body: JSON.stringify(form) })
      }
      setModalOpen(false)
      setEditService(null)
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this service?')) return
    try {
      await request(`/services/${id}`, { method: 'DELETE' })
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleGenerateReadme = async (svc) => {
    try {
      const result = await request(`/services/${svc.id}/readme`, { method: 'POST' })
      const content = result.data?.content
      if (content) {
        setReadmePreview({ serviceName: svc.name, content })
      } else {
        alert(result.data?.message || 'README generated')
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const handleViewDetail = async (svc) => {
    try {
      const result = await request(`/services/${svc.id}`)
      setDetailService(result.data)
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-vault-text">Services</h1>
          <p className="text-sm text-vault-textSecondary mt-1">Manage API services and generate READMEs</p>
        </div>
        <button onClick={() => { setEditService(null); setModalOpen(true) }} className="vault-btn-primary">
          <Plus className="w-4 h-4" /> New Service
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-textMuted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search services..."
          className="vault-input w-full pl-9"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <p className="text-vault-textSecondary col-span-full">Loading...</p>}
        {error && <p className="text-vault-danger col-span-full">{error}</p>}
        {services?.map(svc => (
          <div key={svc.id} className="vault-card p-4 space-y-3 hover:border-vault-primary/30 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-vault-primary" />
                <h3 className="font-semibold text-sm text-vault-text">{svc.name}</h3>
              </div>
              <span className="vault-badge-green text-[10px]">{svc.env_var_count || 0} vars</span>
            </div>
            <p className="text-xs text-vault-textSecondary line-clamp-2">{svc.description || 'No description'}</p>
            {svc.swagger_url && (
              <a href={svc.swagger_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-vault-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Swagger
              </a>
            )}
            <div className="flex items-center gap-2 pt-2">
              <button onClick={() => handleViewDetail(svc)} className="vault-btn-ghost text-xs flex-1"><FileText className="w-3 h-3" /> Details</button>
              <button onClick={() => handleGenerateReadme(svc)} className="vault-btn-ghost text-xs flex-1"><FileText className="w-3 h-3" /> README</button>
              <button onClick={() => handleDelete(svc.id)} className="p-1.5 rounded hover:bg-vault-dangerMuted text-vault-textSecondary hover:text-vault-danger"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {services?.length === 0 && !loading && <p className="text-vault-textSecondary col-span-full">No services found</p>}
      </div>

      <ServiceModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} editService={editService} />
      <ServiceDetail service={detailService} onClose={() => setDetailService(null)} />
      <ReadmePreviewModal data={readmePreview} onClose={() => setReadmePreview(null)} />
    </div>
  )
}
