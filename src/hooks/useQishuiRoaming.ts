import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { closeQishuiRoaming, nextQishuiRoaming, startQishuiRoaming } from '../api/music'
import type { QishuiRoamingPage, SongSearchItem } from '../types'
export function useQishuiRoaming(token:string|null, play:(songs:SongSearchItem[])=>Promise<void>,
  keys:MutableRefObject<Set<string>>, nextHandler:MutableRefObject<(()=>void)|null>, setAvailable:(value:boolean)=>void) {
  const [roamingSession,setSession] = useState<QishuiRoamingPage|null>(null)
  const [roamingBusy,setBusy] = useState(false)
  const [roamingError,setError] = useState('')
  const session = useRef<QishuiRoamingPage|null>(null)
  const generation = useRef(0), busy = useRef(false)
  const request = useRef<AbortController|null>(null)
  const stopRoaming = useCallback(() => {
    generation.current++;request.current?.abort();request.current=null;busy.current=false
    const old=session.current;session.current=null;keys.current.clear();nextHandler.current=null
    setSession(null);setBusy(false);setError('');setAvailable(false)
    if(old) void closeQishuiRoaming(old.sessionId).catch(()=>{})
  },[keys,nextHandler,setAvailable])
  const run = useCallback(async (modeId?:string, next=false) => {
    if(!token || busy.current) return
    if(!next) stopRoaming()
    const current=session.current
    if(next && (!current || !current.hasMore))return
    const version=++generation.current;const controller=new AbortController();request.current=controller
    busy.current=true;setBusy(true);setError('')
    try {
      const page=next && current ? await nextQishuiRoaming(current.sessionId,current.nextSequence,controller.signal) : await startQishuiRoaming(modeId,controller.signal)
      if(version!==generation.current || controller.signal.aborted)return
      session.current=page;setSession(page);setAvailable(page.hasMore)
      keys.current=new Set(page.list.map(s=>`${s.source}:${s.id}`))
      if(page.list.length) await play(page.list)
      else setError('暂时没有新的推荐，请重新开始漫游。')
    } catch(e) {
      if(version===generation.current && !controller.signal.aborted){
        const detail=e as {code?:number;message?:string}
        setError(detail.code===409 ? '请先扫码绑定汽水账号，授权失效后可重新绑定。' : detail.code===404 ? '漫游会话已过期，请重新开始。' : '漫游加载失败，可重试当前批次。')
        // Keep the same nextSequence so retrying a lost response is idempotent.
      }
    } finally {if(version===generation.current){busy.current=false;setBusy(false);request.current=null}}
  },[token,play,keys,setAvailable,stopRoaming])
  const startRoaming=useCallback((modeId?:string)=>run(modeId),[run])
  const nextRoaming=useCallback(()=>run(undefined,true),[run])
  useEffect(()=>{nextHandler.current=roamingSession?.hasMore ? ()=>{void nextRoaming()} : null},[roamingSession,nextRoaming,nextHandler])
  useEffect(()=>{stopRoaming();return stopRoaming},[token,stopRoaming])
  return {roamingSession,roamingBusy,roamingError,startRoaming,nextRoaming,stopRoaming}
}
