import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AutoComplete, Input } from 'antd'
import { qishuiSearchSuggestions } from '../api/music'
import { useAuth } from '../context/AuthContext'
import type { MusicSourceId } from '../types'
export default function MusicSearchInput({source,value,onChange,onSearch,className,placeholder,enterButton,loading}: {
  source:MusicSourceId; value:string; onChange:(value:string)=>void; onSearch:(value:string)=>void;
  className?:string; placeholder?:string; enterButton?:ReactNode; loading?:boolean
}) {
  const {token} = useAuth()
  const [suggestions, setSuggestions] = useState<Array<{value:string}>>([])
  const [open,setOpen] = useState(false)
  const selected = useRef(false)
  useEffect(() => {
    setSuggestions([])
    const keyword = value.trim()
    if (source !== 'qishui' || !token || !keyword || keyword.length > 120) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void qishuiSearchSuggestions(keyword,controller.signal).then(values => {
        if (!controller.signal.aborted) setSuggestions(values.map(v => ({value:v})))
      }).catch(() => {})
    },250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [source,value,token])
  return <AutoComplete className={className} value={value} options={suggestions} open={open && suggestions.length > 0}
    onOpenChange={setOpen} onChange={v => onChange(v.slice(0, 120))} onSelect={v => {
      selected.current = true; setOpen(false); onSearch(v); window.setTimeout(() => { selected.current = false }, 0)
    }}>
    <Input.Search placeholder={placeholder} enterButton={enterButton} loading={loading} allowClear
      onSearch={v => { window.setTimeout(() => { if (!selected.current) { setOpen(false); onSearch(v) } }, 0) }} onFocus={() => setOpen(true)} />
  </AutoComplete>
}
