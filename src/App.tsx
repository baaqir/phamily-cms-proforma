import React, { useMemo, useState } from "react";
import { Wand2, Edit3, ArrowRight, Check, Settings, DollarSign, TrendingUp, BarChart2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from "recharts";

// -------------------- Constants & Helpers --------------------
const CMS_ENDPOINT = "/api/cms-proxy";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Mock data for preview and for cases where the CMS API is blocked in the sandbox
const MOCK_TARGETS = [
  { id: "t1", mode: "name", first: "Amelia", last: "Nguyen", state: "TX" },
  { id: "t2", mode: "name", first: "David", last: "Patel", state: "FL" },
  { id: "t3", mode: "name", first: "Maria", last: "Gonzalez", state: "CA" },
];
const MOCK_MATCHES = [
  { id: "t1", npi: "1234567890", name: "NGUYEN AMELIA", state: "TX", city: "Austin",   tot_benes: 780,  tot_srvcs: 4120, pay_amt: 160400, score: 0.92 },
  { id: "t2", npi: "1098765432", name: "PATEL DAVID",   state: "FL", city: "Tampa",    tot_benes: 1320, tot_srvcs: 6350, pay_amt: 214200, score: 0.88 },
  { id: "t3", npi: "1456789012", name: "GONZALEZ MARIA",state: "CA", city: "San Jose", tot_benes: 560,  tot_srvcs: 2850, pay_amt: 138600, score: 0.81 },
];

// Tiny utils
const num = (v:any) => Number(v || 0);
const fmt = (n:any) => (n == null || isNaN(+n) ? "—" : Number(n).toLocaleString());
const money = (n:any) => (n == null || isNaN(+n) ? "—" : `$${Number(n).toLocaleString(undefined,{ maximumFractionDigits: 0 })}`);
const lines = (t:string) => String(t || "").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const npi = (n:string) => String(n || "").replace(/\D/g, "");
const title = (s:string) => String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function escCSV(v:any){ const s = String(v ?? ""); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
function toCSV(rows:any[], headers:{key:string,label:string}[]){
  const head = headers.map(h => escCSV(h.label)).join(",");
  const body = rows.map(r => headers.map(h => escCSV(r[h.key])).join(",")).join("\n");
  return head + "\n" + body;
}
function downloadCSV(name:string, csv:string){
  try{
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  }catch{
    const href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const a = document.createElement('a');
    a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
}
async function fetchJSON(url:string, ms=8000){
  const c = new AbortController();
  const to = setTimeout(()=>c.abort(), ms);
  try{
    const r = await fetch(url, { signal: c.signal });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{ clearTimeout(to); }
}

// Matching helpers
function scoreCandidate(norm:any, row:any){
  let s = 0;
  const L = (row.Rndrng_Prvdr_Last_Org_Name||"").toUpperCase();
  const F = (row.Rndrng_Prvdr_First_Name||"").toUpperCase();
  const ST = (row.Rndrng_Prvdr_State_Abrvtn||"").toUpperCase();
  if(norm.mode === 'npi') s += 0.7;
  if(norm.last && norm.last.toUpperCase() === L) s += 0.3;
  if(norm.first && norm.first.toUpperCase() === F) s += 0.2;
  if(norm.state && norm.state.toUpperCase() === ST) s += 0.2;
  return Math.max(0, Math.min(1, s));
}
function computeRow(r:any, a:any){
  const cms = num(r.tot_benes);
  const adjFFS = cms * (a.beneScaleDown ?? 1);
  const ma = Math.max(0, cms * (a.maBeneFactor ?? 0));
  const total = adjFFS + ma;
  const obs = num(r.pay_amt);
  return { adjFFS, maBenes: ma, totalMed: total, ffsRevObserved: obs };
}

// Enrollment curve
const clamp01 = (x:number)=>Math.max(0, Math.min(1, x));
const smoothstep = (x:number)=> x<=0?0 : x>=1?1 : (3*x*x - 2*x*x*x);
const pct = (x:number|string)=> `${Math.round(clamp01(Number(x)) * 100)}%`;
function dayPct(d:number, a:any){
  const s   = clamp01(a.enrollStartPct ?? 0.02);
  const p60 = clamp01(a.enrollDay60Pct ?? 0.30);
  const pM  = clamp01(a.enrollMaxPct   ?? 0.60);
  const full = Math.max(61, Math.min(365, Math.floor(a.enrollFullDays ?? 180)));
  if(d <= 60){ const x = d/60; return s + (p60 - s) * (x*x); }
  if(d >= full) return pM;
  const x = (d - 60) / (full - 60);
  return p60 + (pM - p60) * smoothstep(x);
}
function monthlyRamp(a:any){
  const out:any[] = [];
  for(let i=0;i<12;i++){ const d = 15 + i*30; out.push({ month: MONTHS[i], EnrolledPct: Math.round(dayPct(d,a)*100) }); }
  return out;
}

// -------------------- Small UI Components (new Phamily styling) --------------------
// Palette (approx Phamily): indigo primary, slate neutrals, emerald profit accent
function BigStat({icon,label,primary,secondary}:{icon:any,label:string,primary:any,secondary?:any}){
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm h-full">
      <div className="flex items-center gap-2 text-slate-500 text-[11px] mb-1">{icon}<span className="tracking-wide">{label}</span></div>
      <div className="text-2xl font-semibold tracking-tight leading-none text-slate-900">{primary}</div>
      {secondary && <div className="text-[11px] text-slate-500 mt-1">{secondary}</div>}
    </div>
  );
}
function StatCard({label,value,sub}:{label:string,value:any,sub?:any}){
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
const VerifyRow = ({row,onChange}:{row:any,onChange:(r:any)=>void}) => (
  <tr className="border-b last:border-0">
    <td className="py-1">
      <select value={row.mode} onChange={e=>onChange({...row,mode:e.target.value})} className="rounded border-slate-300 border px-2 py-1 text-xs">
        <option value="name">Name</option>
        <option value="npi">NPI</option>
      </select>
    </td>
    <td className="py-1"><input value={row.first||""} onChange={e=>onChange({...row,first:e.target.value})} className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" placeholder="First" disabled={row.mode==='npi'} /></td>
    <td className="py-1"><input value={row.last ||""} onChange={e=>onChange({...row,last:e.target.value})}  className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" placeholder="Last"  disabled={row.mode==='npi'} /></td>
    <td className="py-1"><input value={row.npi  ||""} onChange={e=>onChange({...row,npi:e.target.value})}    className="w-36 rounded border border-slate-300 px-2 py-1 text-xs font-mono" placeholder="NPI" disabled={row.mode!=='npi'} /></td>
    <td className="py-1"><input value={row.state||""} onChange={e=>onChange({...row,state:e.target.value.toUpperCase()})} className="w-14 rounded border border-slate-300 px-2 py-1 text-xs" placeholder="ST" /></td>
    <td className="py-1 text-center"><input type="checkbox" checked={!!row.confirmed} onChange={e=>onChange({...row,confirmed:e.target.checked})} /></td>
  </tr>
);

// -------------------- App --------------------
export default function App(){
  // Steps & inputs
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'csv'|'names'|'npis'>('names');
  const [targets, setTargets] = useState<any[]>(MOCK_TARGETS);
  const [verified, setVerified] = useState<any[]>(MOCK_TARGETS.map(t=>({...t,confirmed:true})));
  const [matches, setMatches] = useState<any[]>(MOCK_MATCHES);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [requestedCount, setRequested] = useState(0);
  const [chartMode, setChartMode] = useState<'financials'|'events'>('financials');
  const [a, setA] = useState<any>({
    year:"latest", beneScaleDown:.9, maBeneFactor:.85, maRateFactor:1,
    ccm99490:62, qualificationRate:1, collectionRate:1,
    variableCostPerEvent:32, fixedAnnualOverhead:0,
    enrollStartPct:.02, enrollDay60Pct:.3, enrollMaxPct:.6, enrollFullDays:180
  });
  const [lastCsv, setLastCsv] = useState<string>("");

  // Derived
  const rows = useMemo(()=> matches.map(m=>({...m, calc: computeRow(m,a)})), [matches, a]);
  const S = useMemo(()=> rows.reduce((x:any,r:any)=>{ x.adjFFS+=r.calc.adjFFS; x.maBenes+=r.calc.maBenes; x.totalMed+=r.calc.totalMed; x.obs+=r.calc.ffsRevObserved; return x; }, {adjFFS:0,maBenes:0,totalMed:0,obs:0}), [rows]);

  const monthlyAt = (f:number)=>{
    const enrolled = S.totalMed * f;
    const ffs = S.totalMed>0 ? S.adjFFS / S.totalMed : 0;
    const ma  = S.totalMed>0 ? S.maBenes / S.totalMed : 0;
    const events = enrolled * a.qualificationRate;
    const revenue = (enrolled*ffs + enrolled*ma*a.maRateFactor) * a.ccm99490 * a.collectionRate;
    const varCost = events * a.variableCostPerEvent;
    return { enrolled, events, revenue, varCost };
  };
  const cap = clamp01(a.enrollMaxPct || 0);
  const full = monthlyAt(cap);
  const revAnn = full.revenue * 12;
  const varAnn = full.varCost * 12;
  const profitAnn = revAnn - varAnn;
  const profitMo = full.revenue - full.varCost;

  const monthlySeries = useMemo(()=> monthlyRamp(a).map(p=>{
    const m = monthlyAt(p.EnrolledPct/100);
    const profit = m.revenue - m.varCost;
    return { month:p.month, EnrolledPct:p.EnrolledPct, EnrolledPatients:Math.round(m.enrolled), Events:Math.round(m.events), Revenue:m.revenue, VarCost:m.varCost, Profit:profit };
  }), [a, S.totalMed, S.adjFFS, S.maBenes]);

  const m1 = monthlySeries[0] || { Revenue:0, Profit:0, EnrolledPatients:0, Events:0 };
  const enrolledFull = Math.round(S.totalMed * cap);
  const eligibleTotal = Math.round(S.totalMed);
  const totalEventsYear1 = useMemo(()=> monthlySeries.reduce((acc:any,m:any)=> acc + (m.Events||0), 0), [monthlySeries]);
  const totalEventsAnnualized = Math.round(full.events * 12);

  // Parsers for step 1
  const parseNames = (t:string)=>{
    const out = lines(t).map((ln,i)=>{ const p = ln.split(',').map(s=>s.trim()); const nameBits = (p[0]||'').split(' '); const first = nameBits.shift()||''; const last = nameBits.pop()||''; return { id:`n${i+1}`, mode:'name', first, last, state:p[1]||'' }; });
    setTargets(out); setVerified(out.map(t=>({...t,confirmed:true})));
  };
  const parseNPIs = (t:string)=>{
    const out = lines(t).map((ln,i)=>{ const p = ln.split(',').map(s=>s.trim()); return { id:`p${i+1}`, mode:'npi', npi:p[0], state:p[1]||'' }; });
    setTargets(out); setVerified(out.map(t=>({...t,confirmed:true})));
  };

  // CMS query
  const buildURL = (f:any)=>{ const u = new URL(CMS_ENDPOINT); Object.entries(f).forEach(([k,v]:any)=>{ if(v!=null && String(v).trim()!==''){ u.searchParams.set(`filter[${k}]`, String(v)); } }); u.searchParams.set('limit','50'); return u.toString(); };
  async function queryCMS(t:any){
    const st = (t.state||'').toUpperCase().slice(0,2);
    if(t.mode==='npi' && t.npi){ const d = await fetchJSON(buildURL({ Rndrng_NPI: npi(t.npi) }), 8000); return Array.isArray(d)?d:[]; }
    const last = (t.last||'').toUpperCase();
    const first = (t.first||'').toUpperCase();
    const d = await fetchJSON(buildURL({ Rndrng_Prvdr_Last_Org_Name: last||undefined, Rndrng_Prvdr_First_Name: first||undefined, Rndrng_Prvdr_State_Abrvtn: st||undefined }), 8000);
    return Array.isArray(d)?d:[];
  }
  function normalize(t:any,row:any){
    return {
      id: t.id || String(row.Rndrng_NPI || ''),
      npi: row.Rndrng_NPI || '',
      name: `${row.Rndrng_Prvdr_Last_Org_Name||''} ${row.Rndrng_Prvdr_First_Name||''}`.trim(),
      state: row.Rndrng_Prvdr_State_Abrvtn || '',
      city: row.Rndrng_Prvdr_City || '',
      tot_benes: num(row.Tot_Benes || row.Tot_benes),
      tot_srvcs: num(row.Tot_Srvcs || row.Tot_srvcs),
      pay_amt:  num(row.Tot_Mdcr_Pymt_Amt || row.Tot_Mdcr_Pymt_Amt_CY),
      score: scoreCandidate(t, row)
    };
  }
  async function runMatch(){
    setErr(""); setLoading(true);
    try{
      const conf = verified.filter(v=>v.confirmed);
      const out:any[] = []; let fails = 0; setRequested(conf.length);
      for(const t of conf){
        try{
          const rs = await queryCMS(t);
          if(!rs.length){
            out.push(t.mode==='npi' ?
              { id:t.id, npi:npi(t.npi||""), name:`NPI ${npi(t.npi||"")}`, state:t.state||"", city:"", tot_benes:0, tot_srvcs:0, pay_amt:0, score:.5 } :
              { id:t.id, npi:"", name:`${(t.last||'').toUpperCase()} ${(t.first||'').toUpperCase()}`.trim(), state:t.state||"", city:"", tot_benes:0, tot_srvcs:0, pay_amt:0, score:.5 }
            );
            continue;
          }
          const best = rs.map((r:any)=>({ r, s:scoreCandidate(t,r) })).sort((a:any,b:any)=> b.s - a.s)[0];
          out.push(normalize(t, best.r));
        }catch{
          out.push(t.mode==='npi' ?
            { id:t.id, npi:npi(t.npi||""), name:`NPI ${npi(t.npi||"")}`, state:t.state||"", city:"", tot_benes:0, tot_srvcs:0, pay_amt:0, score:.3 } :
            { id:t.id, npi:"", name:`${(t.last||'').toUpperCase()} ${(t.first||'').toUpperCase()}`.trim(), state:t.state||"", city:"", tot_benes:0, tot_srvcs:0, pay_amt:0, score:.3 }
          );
          fails++;
        }
      }
      if(!out.length || fails===conf.length){ setErr('CMS API unreachable in this preview (CORS/timeout). Showing mock matches.'); setMatches(MOCK_MATCHES); }
      else setMatches(out);
      setStep(3);
    }catch(e:any){ setErr(e.message||'Lookup error'); }
    finally{ setLoading(false); }
  }

  // CSV exports
  function exportPhysiciansCSV(){
    const headers = [
      {key:'Physician',label:'Physician'}, {key:'NPI',label:'NPI'}, {key:'State',label:'State'}, {key:'City',label:'City'},
      {key:'Adj_FFS_Medicare_Benes',label:'Adj_FFS_Medicare_Benes'}, {key:'Est_MA_Benes',label:'Est_MA_Benes'}, {key:'Total_Eligible',label:'Total_Eligible'},
      {key:'Monthly_Enrolled_at_Full_Scale',label:'Monthly_Enrolled_at_Full_Scale'}, {key:'Monthly_Events',label:'Monthly_Events'},
      {key:'Monthly_Revenue',label:'Monthly_Revenue'}, {key:'Monthly_Var_Cost',label:'Monthly_Var_Cost'}, {key:'Monthly_Net_before_Fixed',label:'Monthly_Net_before_Fixed'},
      {key:'Annual_Revenue_at_Full_Scale',label:'Annual_Revenue_at_Full_Scale'}, {key:'Annual_Net_before_Fixed',label:'Annual_Net_before_Fixed'}
    ];
    const rowsOut = rows.map((r:any)=>{
      const c = r.calc; const frac = clamp01(a.enrollMaxPct||0);
      const total = c.totalMed; const ffs = total>0? c.adjFFS/total : 0; const ma = total>0? c.maBenes/total : 0;
      const enrolled = total * frac; const events = enrolled * a.qualificationRate;
      const monthlyRev = (enrolled*ffs*a.ccm99490*a.collectionRate) + (enrolled*ma*a.maRateFactor*a.ccm99490*a.collectionRate);
      const monthlyVar = events * a.variableCostPerEvent; const monthlyNet = monthlyRev - monthlyVar;
      const annualRev = monthlyRev * 12; const annualNet = monthlyNet * 12;
      return {
        Physician:title(r.name), NPI:r.npi, State:r.state, City:r.city,
        Adj_FFS_Medicare_Benes:Math.round(c.adjFFS), Est_MA_Benes:Math.round(c.maBenes), Total_Eligible:Math.round(total),
        Monthly_Enrolled_at_Full_Scale:Math.round(enrolled), Monthly_Events:Math.round(events),
        Monthly_Revenue:Math.round(monthlyRev), Monthly_Var_Cost:Math.round(monthlyVar), Monthly_Net_before_Fixed:Math.round(monthlyNet),
        Annual_Revenue_at_Full_Scale:Math.round(annualRev), Annual_Net_before_Fixed:Math.round(annualNet)
      };
    });
    const csv = toCSV(rowsOut, headers);
    const name = `physicians_${new Date().toISOString().slice(0,10)}.csv`;
    setLastCsv(csv); downloadCSV(name, csv);
  }
  function exportProFormaCSV(){
    const rowsOut = [
      {Label:'Adj_FFS_Medicare_Benes',Value:Math.round(S.adjFFS)},
      {Label:'Est_MA_Benes',Value:Math.round(S.maBenes)},
      {Label:'Total_Eligible_Patients',Value:Math.round(S.totalMed)},
      {Label:'Monthly_Revenue_at_Full_Scale',Value:Math.round(full.revenue)},
      {Label:'Monthly_Events_at_Full_Scale',Value:Math.round(full.events)},
      {Label:'Monthly_Variable_Cost_at_Full_Scale',Value:Math.round(full.varCost)},
      {Label:'Annual_Revenue_at_Full_Scale',Value:Math.round(revAnn)},
      {Label:'Annual_Variable_Costs_at_Full_Scale',Value:Math.round(full.varCost*12)},
      {Label:'Annual_Profit_at_Full_Scale',Value:Math.round(profitAnn)},
      {Label:'Enrolled_Patients_Full_Scale',Value:enrolledFull},
      {Label:'Medicare_Patients_per_MD',Value:Math.round(S.adjFFS/(rows.length||1))},
      {Label:'Total_Billable_Events_Year1',Value:Math.round(totalEventsYear1)},
      {Label:'Total_Billable_Events_Annualized_Full_Scale',Value:Math.round(totalEventsAnnualized)},
      {Label:'',Value:''},
      {Label:'Assumption_Bene_Scale_Down',Value:a.beneScaleDown},
      {Label:'Assumption_MA_Bene_Factor',Value:a.maBeneFactor},
      {Label:'Assumption_Qualification_Rate',Value:a.qualificationRate},
      {Label:'Assumption_MA_Rate_Factor',Value:a.maRateFactor},
      {Label:'Assumption_Collection_Rate',Value:a.collectionRate},
      {Label:'Assumption_99490_Reimbursement',Value:a.ccm99490},
      {Label:'Assumption_Variable_Cost_per_Event',Value:a.variableCostPerEvent},
      {Label:'Assumption_Fixed_Annual_Overhead',Value:a.fixedAnnualOverhead},
      {Label:'Assumption_Enroll_Start_%',Value:a.enrollStartPct},
      {Label:'Assumption_Enroll_Day60_%',Value:a.enrollDay60Pct},
      {Label:'Assumption_Enroll_Max_%',Value:a.enrollMaxPct},
      {Label:'Assumption_Enroll_Full_Days',Value:a.enrollFullDays},
    ];
    const headers = [{key:'Label',label:'Label'},{key:'Value',label:'Value'}];
    const csv = toCSV(rowsOut, headers);
    const name = `pro_forma_${new Date().toISOString().slice(0,10)}.csv`;
    setLastCsv(csv); downloadCSV(name, csv);
  }

  // -------------------- Render --------------------
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 grid place-items-center text-white text-sm font-bold">PH</div>
            <div className="font-semibold tracking-tight text-slate-900">Phamily — Physician Matcher & Pro Forma</div>
          </div>
          <button type="button" onClick={()=> step!==5 ? setStep(5) : exportProFormaCSV()} className="rounded-lg px-3 py-2 bg-indigo-600 text-white hover:bg-indigo-500 text-sm flex items-center gap-1 shadow-sm">
            <Wand2 className="h-4 w-4"/>Export Pro Forma
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <div className="text-[11px] text-slate-500 uppercase tracking-widest">Step {step} / 5</div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <BigStat icon={<DollarSign className="h-4 w-4 text-indigo-600"/>} label="Revenue (annual)" primary={money(Math.round(revAnn))} secondary={`Monthly ${money(Math.round(full.revenue))} @ ${pct(cap)} enrolled`} />
          </div>
          <div className="md:col-span-2">
            <BigStat icon={<TrendingUp className="h-4 w-4 text-emerald-600"/>} label="Profit (annualized)" primary={<span className="text-emerald-700">{money(Math.round(profitAnn))}</span>} secondary={`Monthly ${money(Math.round(profitMo))} · Margin ${(revAnn?(profitAnn/revAnn)*100:0).toFixed(1)}%`} />
          </div>
          <div className="md:col-span-1 grid grid-rows-3 gap-3">
            <StatCard label="Eligible Patients (total)" value={fmt(eligibleTotal)} sub={`FFS ${fmt(Math.round(S.adjFFS))} · MA ${fmt(Math.round(S.maBenes))}`} />
            <StatCard label="Enrolled Patients" value={fmt(m1.EnrolledPatients)} sub={`Month 1 · Full-scale ${fmt(enrolledFull)} (${pct(cap)})`} />
            <StatCard label="Medicare Patients / MD" value={fmt(Math.round(S.adjFFS/(rows.length||1)))} sub={`${rows.length} physician${rows.length>1?'s':''}`} />
          </div>
        </div>

        {err && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs">CMS lookup error: {err}</div>
        )}

        {/* Step 1: Inputs */}
        {step===1 && (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-slate-900">1) Inputs</div>
              <div className="flex gap-2">
                {['csv','names','npis'].map(m => (
                  <button key={m} type="button" onClick={()=>setMode(m as any)} className={`px-2.5 py-1.5 rounded-lg border text-xs ${mode===m?"bg-indigo-600 text-white border-indigo-600":"bg-white border-slate-300"}`}>
                    {m==='csv' ? "Upload CSV" : m==='names' ? "Type Names" : "Type NPIs"}
                  </button>
                ))}
              </div>
            </div>

            {mode==='csv' && (
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-600">CSV columns: first,last,state,npi?</div>
                <button type="button" onClick={()=>alert('CSV upload coming soon')} className="rounded-lg px-2.5 py-1.5 bg-slate-900 text-white text-xs">Upload</button>
              </div>
            )}
            {mode==='names' && (
              <div className="space-y-1">
                <div className="text-xs text-slate-600">One per line: <span className="font-mono">First Last, ST</span></div>
                <textarea onChange={e=>parseNames(e.target.value)} className="w-full h-24 rounded-lg border border-slate-300 p-2 font-mono text-xs" placeholder={`Jane Doe, TX\nJohn Smith, FL`} />
              </div>
            )}
            {mode==='npis' && (
              <div className="space-y-1">
                <div className="text-xs text-slate-600">One per line: <span className="font-mono">NPI, ST</span></div>
                <textarea onChange={e=>parseNPIs(e.target.value)} className="w-full h-24 rounded-lg border border-slate-300 p-2 font-mono text-xs" placeholder={`1234567890, TX\n1098765432, FL`} />
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <button type="button" onClick={()=>setStep(2)} className="rounded-lg px-3 py-2 bg-indigo-600 text-white text-sm flex items-center gap-1 shadow-sm"><ArrowRight className="h-4 w-4"/>Verify</button>
            </div>
          </div>
        )}

        {/* Step 2: Verify */}
        {step===2 && (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-slate-900">2) Verify</div>
              <div className="text-[11px] text-slate-500">Confirm each row</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1">Mode</th><th className="py-1">First</th><th className="py-1">Last</th><th className="py-1">NPI</th><th className="py-1">ST</th><th className="py-1 text-center">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {verified.map((row,i)=> (<VerifyRow key={row.id||i} row={row} onChange={nr=>setVerified(v=>v.map(x=>x.id===row.id?nr:x))} />))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={()=>setStep(1)} className="rounded-lg px-3 py-2 border border-slate-300 text-sm flex items-center gap-1"><Edit3 className="h-4 w-4"/>Back</button>
              <button type="button" onClick={runMatch} disabled={loading} className={`rounded-lg px-3 py-2 text-white text-sm flex items-center gap-1 shadow-sm ${loading?"bg-indigo-300":"bg-indigo-600 hover:bg-indigo-500"}`}>
                {loading ? "Matching…" : (<><Check className="h-4 w-4"/>Confirm & Match</>)}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Matches */}
        {step===3 && (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="font-medium mb-3 text-slate-900">3) Matches <span className="text-xs text-slate-500 ml-2">(showing {rows.length} of {requestedCount})</span></div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1">Physician</th><th className="py-1">NPI</th><th className="py-1">ST</th><th className="py-1">Adj FFS</th><th className="py-1">MA Benes</th><th className="py-1">Total</th><th className="py-1">Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r=> (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-1">{title(r.name)}</td>
                      <td className="py-1 font-mono text-slate-700">{r.npi}</td>
                      <td className="py-1">{r.state}</td>
                      <td className="py-1">{fmt(Math.round(r.calc.adjFFS))}</td>
                      <td className="py-1">{fmt(Math.round(r.calc.maBenes))}</td>
                      <td className="py-1">{fmt(Math.round(r.calc.totalMed))}</td>
                      <td className="py-1">{r.score>=.9?"High":r.score>=.8?"Med":"Review"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={()=>setStep(4)} className="rounded-lg px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1 shadow-sm"><ArrowRight className="h-4 w-4"/>Assumptions</button>
            </div>
          </div>
        )}

        {/* Step 4: Assumptions */}
        {step===4 && (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3"><div className="font-medium text-slate-900">4) Assumptions</div><Settings className="h-4 w-4 text-slate-400"/></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Beneficiary Scale-Down</label>
                <div className="flex items-center gap-2"><input type="range" min={.6} max={1} step={.01} value={a.beneScaleDown} onChange={e=>setA((x:any)=>({...x,beneScaleDown:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-12 text-right text-xs">{a.beneScaleDown.toFixed(2)}</div></div>
                <label className="text-xs text-slate-600">Qualification Rate</label>
                <div className="flex items-center gap-2"><input type="range" min={0} max={1} step={.01} value={a.qualificationRate} onChange={e=>setA((x:any)=>({...x,qualificationRate:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-12 text-right text-xs">{a.qualificationRate.toFixed(2)}</div></div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">MA Beneficiary Factor (0–1.2)</label>
                <div className="flex items-center gap-2"><input type="range" min={0} max={1.2} step={.01} value={a.maBeneFactor} onChange={e=>setA((x:any)=>({...x,maBeneFactor:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-12 text-right text-xs">{a.maBeneFactor.toFixed(2)}</div></div>
                <label className="text-xs text-slate-600">MA Rate Factor (0–1)</label>
                <div className="flex items-center gap-2"><input type="range" min={0} max={1} step={.01} value={a.maRateFactor} onChange={e=>setA((x:any)=>({...x,maRateFactor:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-12 text-right text-xs">{a.maRateFactor.toFixed(2)}</div></div>
                <label className="text-xs text-slate-600">Collection Rate</label>
                <div className="flex items-center gap-2"><input type="range" min={.7} max={1} step={.01} value={a.collectionRate} onChange={e=>setA((x:any)=>({...x,collectionRate:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-12 text-right text-xs">{a.collectionRate.toFixed(2)}</div></div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Avg 99490 Reimbursement ($)</label>
                <input type="number" step={1} min={0} value={a.ccm99490} onChange={e=>setA((x:any)=>({...x,ccm99490:parseFloat((e.target as any).value)||0}))} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"/>
                <label className="text-xs text-slate-600">Variable Cost / Event</label>
                <input type="number" step={1} min={0} value={a.variableCostPerEvent} onChange={e=>setA((x:any)=>({...x,variableCostPerEvent:parseFloat((e.target as any).value)||0}))} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"/>
                <label className="text-xs text-slate-600">Fixed Annual Overhead</label>
                <input type="number" step={1000} min={0} value={a.fixedAnnualOverhead} onChange={e=>setA((x:any)=>({...x,fixedAnnualOverhead:parseFloat((e.target as any).value)||0}))} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"/>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-600 mb-2">Enrollment ramp assumptions (penetration of eligible patients)</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-slate-600">Start % (day 0)</label>
                  <div className="flex items-center gap-2"><input type="range" min={0} max={.2} step={.005} value={a.enrollStartPct} onChange={e=>setA((x:any)=>({...x,enrollStartPct:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-10 text-right text-xs">{pct(a.enrollStartPct)}</div></div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">Target % by Day 60</label>
                  <div className="flex items-center gap-2"><input type="range" min={0} max={1} step={.01} value={a.enrollDay60Pct} onChange={e=>setA((x:any)=>({...x,enrollDay60Pct:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-10 text-right text-xs">{pct(a.enrollDay60Pct)}</div></div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">Full-Scale Cap %</label>
                  <div className="flex items-center gap-2"><input type="range" min={0} max={1} step={.01} value={a.enrollMaxPct} onChange={e=>setA((x:any)=>({...x,enrollMaxPct:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-10 text-right text-xs">{pct(a.enrollMaxPct)}</div></div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">Days to Full Scale</label>
                  <div className="flex items-center gap-2"><input type="range" min={61} max={360} step={1} value={a.enrollFullDays} onChange={e=>setA((x:any)=>({...x,enrollFullDays:parseFloat((e.target as any).value)}))} className="w-full"/><div className="w-16 text-right text-xs">{a.enrollFullDays}d</div></div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={()=>setStep(3)} className="rounded-lg px-3 py-2 border border-slate-300 text-sm flex items-center gap-1"><Edit3 className="h-4 w-4"/>Back</button>
              <button type="button" onClick={()=>setStep(5)} className="rounded-lg px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1 shadow-sm"><ArrowRight className="h-4 w-4"/>Preview</button>
            </div>
          </div>
        )}

        {/* Step 5: Pro Forma */}
        {step===5 && (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-slate-900">5) Pro Forma Preview</div>
              <div className="flex items-center gap-2 relative z-10">
                <button type="button" onClick={exportPhysiciansCSV} className="rounded-lg px-3 py-2 bg-slate-900 text-white text-sm shadow-sm">Export Physicians CSV</button>
                <button type="button" onClick={exportProFormaCSV} className="rounded-lg px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm shadow-sm">Export Pro Forma CSV</button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3">
              <div className="text-xs text-slate-600 mb-2">Physicians in this pro forma</div>
              <div className="flex flex-wrap gap-2">
                {rows.map(r => (
                  <div key={r.id} className="px-2 py-1 rounded-full bg-white border border-slate-200 text-xs shadow-sm flex items-center gap-2">
                    <span className="font-medium text-slate-900">{title(r.name)}</span>
                    <span className="font-mono text-slate-600">NPI {r.npi||'—'}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5">Elig {fmt(Math.round(r.calc.totalMed))}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <StatCard label="Billable Events (full-scale)" value={fmt(Math.round(S.totalMed*cap*a.qualificationRate))} sub={`Month 1 ${fmt(m1.Events)}`} />
              <StatCard label="Qualification Rate" value={`${(a.qualificationRate*100).toFixed(0)}%`} sub="Per enrolled patient per month" />
              <StatCard label="Total Billable Events — Year 1" value={fmt(totalEventsYear1)} sub="Sum of monthly events (12 months)" />
              <StatCard label="Annualized Billable Events (Full-Scale)" value={fmt(totalEventsAnnualized)} sub={`${fmt(Math.round(full.events))} × 12`} />
            </div>

            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-500 flex items-center gap-1"><BarChart2 className="h-4 w-4"/> Chart Mode</div>
              <div className="inline-flex rounded-xl border border-slate-300 overflow-hidden">
                <button type="button" onClick={()=>setChartMode('financials')} className={`px-3 py-1 text-sm ${chartMode==='financials'?'bg-indigo-600 text-white':'bg-white'}`}>Financials</button>
                <button type="button" onClick={()=>setChartMode('events')} className={`px-3 py-1 text-sm ${chartMode==='events'?'bg-indigo-600 text-white':'bg-white'}`}>Billable Events</button>
              </div>
            </div>

            <div className="h-64 rounded-2xl border border-slate-200 bg-white">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode==='financials' ? (
                  <AreaChart data={monthlySeries} margin={{top:12,right:16,left:0,bottom:0}}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05}/>
                      </linearGradient>
                      <linearGradient id="profG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#065f46" stopOpacity={0.28}/>
                        <stop offset="95%" stopColor="#065f46" stopOpacity={0.04}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey="month" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip formatter={(v:any,n:any)=> n==='Events'? fmt(v) : money(Math.round(v))} labelFormatter={(l:any)=>`Month: ${l}`}/>
                    <Legend/>
                    <Area type="monotone" dataKey="Revenue" stroke="#4f46e5" fill="url(#rev)" name="Revenue (monthly)"/>
                    <Area type="monotone" dataKey="Profit"  stroke="#065f46" fill="url(#profG)" name="Profit (monthly)"/>
                    <Line type="monotone" dataKey="VarCost" stroke="#94a3b8" strokeDasharray="5 5" name="Variable Cost (monthly)"/>
                  </AreaChart>
                ) : (
                  <LineChart data={monthlySeries} margin={{top:12,right:16,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey="month" tick={{fontSize:11}}/>
                    <YAxis tickFormatter={(v:any)=>fmt(v)} tick={{fontSize:11}}/>
                    <Tooltip formatter={(v:any)=>fmt(v)} labelFormatter={(l:any)=>`Month: ${l}`}/>
                    <Legend/>
                    <Line type="monotone" dataKey="Events" stroke="#2563eb" strokeWidth={2} dot={false} name="Billable Events (monthly)"/>
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="mt-4 h-56 rounded-2xl border border-slate-200 bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlySeries} margin={{top:12,right:16,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3"/>
                  <XAxis dataKey="month" tick={{fontSize:11}}/>
                  <YAxis yAxisId="left" domain={[0,100]} tickFormatter={(v:any)=>`${v}%`} tick={{fontSize:11}}/>
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v:any)=>fmt(v)} tick={{fontSize:11}}/>
                  <Tooltip formatter={(v:any,n:any)=> n==='EnrolledPct'? `${v}%` : fmt(v)}/>
                  <Legend/>
                  <Line yAxisId="left"  type="monotone" dataKey="EnrolledPct"     name="Enrollment %"     stroke="#065f46" strokeWidth={2} dot={false}/>
                  <Line yAxisId="right" type="monotone" dataKey="EnrolledPatients" name="Enrolled Patients" stroke="#4f46e5" strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="text-[11px] text-slate-500 mt-2">Reference: Observed FFS revenue total = {money(Math.round(S.obs))}</div>
          </div>
        )}
      </div>
    </div>
  );
}
