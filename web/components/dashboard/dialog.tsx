'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,dialog=ref.current;dialog?.showModal();
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return ()=>{dialog?.close();document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  return <dialog ref={ref} className={`glass-dialog ${wide?'wide':''}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog-inner"><div className="dialog-heading"><span className="eyebrow">IDX LENS / RESEARCH</span><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>{children}</div></dialog>;
}
