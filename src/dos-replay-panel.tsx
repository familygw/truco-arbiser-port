import {useEffect,useMemo,useState} from 'react';
import {runDosMatch,replayDosMatch,type DosMatchResult,type DosMatchEvent} from './original-seeded-match';

const suits=['Espada','Basto','Oro','Copa'];
const suitFiles=['espada','basto','oro','copa'];
const ranks=[1,2,3,4,5,6,7,10,11,12];
const cardName=(id:number)=>`${ranks[id%10]} de ${suits[Math.floor(id/10)]}`;
const commandName=(code:number)=>code===24?'Quiero':code===25?'No quiero':code===26?'Mazo':code>=9&&code<=11?`Carta ${code-8}`:`Comando ${code}`;
function eventLabel(e:DosMatchEvent,dialogues:Record<number,string>={}){
 if(e.text!==undefined)return `CPU: ${e.text.replaceAll('#',' ')}`;
 if(e.cards)return `Reparto · ${e.memory[3]?'CPU':'Vos'} es mano`;
 if(e.playerSlot)return `Vos jugás carta ${e.playerSlot}`;
 if(e.cpuSlot)return `CPU juega carta ${e.cpuSlot}`;
 if(e.input!==undefined)return `Vos: ${commandName(e.input)}`;
 if(e.voice)return `CPU: ${dialogues[e.voice]??`voz ${e.voice}`}`;
 if(e.address===0x82c7)return 'Cierre y puntaje de la mano';
 return 'Fin de la partida';
}

export default function DosReplayPanel({onClose}:{onClose:()=>void}) {
 const [dialogues,setDialogues]=useState<Record<number,string>>({});
 useEffect(()=>{let active=true;void fetch(`${import.meta.env.BASE_URL}original/dialogos.json`).then(r=>r.json()).then((rows:{record:number;text:string}[])=>{if(active)setDialogues(Object.fromEntries(rows.map(r=>[r.record,r.text])));}).catch(()=>{});return()=>{active=false;};},[]);
 const [seed,setSeed]=useState('327680');const [flor,setFlor]=useState(true);const [cpuMano,setCpuMano]=useState(true);
 const [result,setResult]=useState<DosMatchResult|null>(null);const [error,setError]=useState('');const [cursor,setCursor]=useState(0);const [playing,setPlaying]=useState(false);const [transcript,setTranscript]=useState('');
 const event=result?.events[cursor];
 const currentHand=event?.memory[2]??0;
 const deal=useMemo(()=>result?.events.slice(0,cursor+1).findLast(e=>e.cards),[result,cursor]);
 const plays=useMemo(()=>result?.events.slice(0,cursor+1).filter(e=>e.memory[2]===currentHand&&(e.playerSlot||e.cpuSlot))??[],[result,cursor,currentHand]);
 useEffect(()=>{if(!playing||!result)return;if(cursor>=result.events.length-1){setPlaying(false);return;}const timer=window.setTimeout(()=>setCursor(c=>c+1),500);return()=>window.clearTimeout(timer);},[playing,result,cursor]);
 function install(next:DosMatchResult){setResult(next);setCursor(0);setPlaying(false);setError('');setTranscript(JSON.stringify(next.replay,null,2));}
 function generate(){try{install(runDosMatch({seed:Number(seed),flor,cpuMano}));}catch(e){setError(e instanceof Error?e.message:String(e));}}
 function load(){try{const next=replayDosMatch(JSON.parse(transcript));setSeed(String(next.replay.seed));setFlor(next.replay.flor);setCpuMano(next.replay.cpuMano);install(next);}catch(e){setError(e instanceof Error?e.message:String(e));}}
 function download(){if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result.replay,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`truco-dos-${result.replay.seed}.json`;a.click();URL.revokeObjectURL(url);}
 return <main className="dos-replay app-shell">
  <header><div><p className="eyebrow">TRUCO ARBISER · PRESERVACIÓN</p><h1>Una partida DOS por semilla</h1></div><button onClick={onClose}>Volver al juego</button></header>
  <p>Reproduce cartas, cantos y puntajes del original con las mismas jugadas. Perfil DOS con sonido apagado; se conserva el azar que el juego usa para elegir voces y frases.</p>
  <div className="dos-controls">
   <label>Semilla (0–16777215)<input aria-label="Semilla DOS" value={seed} onChange={e=>setSeed(e.target.value)} inputMode="numeric" /></label>
   <label><input type="checkbox" checked={flor} onChange={e=>setFlor(e.target.checked)} /> Con Flor</label>
   <label><input type="checkbox" checked={cpuMano} onChange={e=>setCpuMano(e.target.checked)} /> CPU es mano</label>
   <button className="primary-button" onClick={generate}>REPRODUCIR PARTIDA</button>
  </div>
  <p className="dos-policy">La demostración juega las cartas en orden de reparto, rechaza los tantos de apertura, acepta Truco y Retruco y rechaza Vale 4. La semilla fija el azar; el archivo conserva también las jugadas y las opciones.</p>
  {error&&<p role="alert">{error}</p>}
  {result&&event&&<>
   <section className="dos-summary" aria-label="Resultado de la reproducción"><strong>Resultado final: Vos {result.score.player} · CPU {result.score.cpu}</strong><span>{result.events.filter(e=>e.cards).length} manos · {result.draws} sorteos · semilla {result.replay.seed}</span></section>
   <section className="dos-table" aria-label="Mesa de reproducción">
    <div className="dos-score"><strong>Mano {currentHand}</strong><span>Vos {event.memory[0]} · CPU {event.memory[1]}</span><span>{eventLabel(event,dialogues)}</span></div>
    {(['CPU','Vos'] as const).map((side,index)=><div key={side} className="dos-hand"><h2>{side}</h2><div>{(deal?.cards?.slice(index===0?3:0,index===0?6:3)??[]).map((id,slot)=>{
     const used=plays.some(p=>(side==='CPU'?p.cpuSlot:p.playerSlot)===slot+1);
     return <div className={`dos-card ${used?'played':''}`} key={id}><b>{ranks[id%10]}</b><img src={`${import.meta.env.BASE_URL}restored/carta-${suitFiles[Math.floor(id/10)]}-fullcolor.png`} alt={cardName(id)} /><span>{suits[Math.floor(id/10)]}</span>{used&&<em>Jugada</em>}</div>;
    })}</div></div>)}
    <ol className="dos-played">{plays.map((p,i)=><li key={i}>{p.cpuSlot?'CPU':'Vos'}: {cardName(deal!.cards![(p.cpuSlot?3:0)+(p.cpuSlot??p.playerSlot!)-1])}</li>)}</ol>
   </section>
   <div className="dos-controls"><button onClick={()=>{setPlaying(false);setCursor(Math.max(0,cursor-1));}} disabled={cursor===0}>Anterior</button><button onClick={()=>setPlaying(p=>!p)} disabled={cursor===result.events.length-1}>{playing?'Pausar':'Reproducir'}</button><button onClick={()=>{setPlaying(false);setCursor(Math.min(result.events.length-1,cursor+1));}} disabled={cursor===result.events.length-1}>Siguiente</button><span>Evento {cursor+1} de {result.events.length}</span></div>
   <input className="dos-timeline" type="range" aria-label="Evento de la partida" min={0} max={result.events.length-1} value={cursor} onChange={e=>{setPlaying(false);setCursor(Number(e.target.value));}} />
   <details><summary>Ver las {result.events.length} jugadas y eventos</summary><ol className="dos-events">{result.events.map((e,i)=><li key={i}><button aria-current={i===cursor?'step':undefined} onClick={()=>{setPlaying(false);setCursor(i);}}>Mano {e.memory[2]} · {eventLabel(e,dialogues)} · {e.memory[0]}–{e.memory[1]}</button></li>)}</ol></details>
  </>}
  <details className="dos-transcript"><summary>Guardar o cargar una partida</summary><p>Descargá el archivo o pegá una transcripción para volver a ejecutarla desde la semilla.</p><textarea aria-label="Transcripción DOS" value={transcript} onChange={e=>setTranscript(e.target.value)} spellCheck={false} /><div className="dos-controls"><button onClick={download} disabled={!result}>Descargar replay JSON</button><button onClick={load} disabled={!transcript}>Cargar y verificar replay</button></div></details>
 </main>;
}
