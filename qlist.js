const { Client } = require('pg')
const c = new Client({ connectionString: process.env.DB, ssl: { rejectUnauthorized: false } })
const ORG='00000000-0000-0000-0000-0000000000cd'
const fam=(cod)=>{const s=(cod||'').toLowerCase(); return s.startsWith('fc')?'FC':s.startsWith('anl')?'ANL':null}
const digits=(w)=>(w||'').replace(/\D/g,'')
const norm=(w)=>{let d=digits(w); if(d.length===10||d.length===11) d='55'+d; return d}
const suf=(w)=>digits(w).slice(-8)
const ok=(w)=>{const d=digits(w); return d.length>=10 && d.length<=13}
;(async()=>{await c.connect()
  await c.query(`alter table wa_contatos add column if not exists produto text`)
  // mapa da base atual por sufixo -> {id, categoria}
  const base=(await c.query(`select id, telefone, categoria from wa_contatos where org_id=$1`,[ORG])).rows
  const map=new Map(); for(const b of base){ const s=suf(b.telefone); if(s.length===8 && !map.has(s)) map.set(s,{id:b.id,cat:b.categoria}) }

  let novoComp=0,updComp=0,novoPerd=0,updPerd=0,skipComp=0,ruins=0
  // 1) COMPRADORES (prioridade)
  const comp=(await c.query(`select al.nome, al.whatsapp, ci.nome cidade, t.codigo, m.lead_id from matriculas m join alunos al on al.id=m.aluno_id left join turmas t on t.id=m.turma_id left join cidades ci on ci.id=t.cidade_id where m.org_id=$1`,[ORG])).rows
  for(const r of comp){ if(!ok(r.whatsapp)){ruins++; continue}
    const s=suf(r.whatsapp), prod=fam(r.codigo), cid=r.cidade||null, ex=map.get(s)
    if(ex){ await c.query(`update wa_contatos set categoria='comprador', produto=coalesce($1,produto), cidade=coalesce(cidade,$2), atualizado_em=now() where id=$3`,[prod,cid,ex.id]); ex.cat='comprador'; updComp++ }
    else{ const ins=await c.query(`insert into wa_contatos (org_id,nome,telefone,cidade,categoria,produto,origem,status,lead_id) values ($1,$2,$3,$4,'comprador',$5,'crm_comprador','novo',$6) returning id`,[ORG,r.nome,norm(r.whatsapp),cid,prod,r.lead_id||null]); map.set(s,{id:ins.rows[0].id,cat:'comprador'}); novoComp++ } }

  // 2) PERDIDOS (não rebaixa comprador)
  const perda=(await c.query(`select l.id lead_id, l.nome, l.whatsapp, l.codigo_turma, ci.nome cidade from leads l left join turmas t on t.id=l.turma_id left join cidades ci on ci.id=t.cidade_id where l.org_id=$1 and l.etapa='perda'`,[ORG])).rows
  for(const r of perda){ if(!ok(r.whatsapp)){ruins++; continue}
    const s=suf(r.whatsapp), prod=fam(r.codigo_turma), cid=r.cidade||null, ex=map.get(s)
    if(ex && ex.cat==='comprador'){ skipComp++; continue }
    if(ex){ await c.query(`update wa_contatos set categoria='perdido', produto=coalesce($1,produto), cidade=coalesce(cidade,$2), lead_id=coalesce(lead_id,$3), atualizado_em=now() where id=$4`,[prod,cid,r.lead_id,ex.id]); ex.cat='perdido'; updPerd++ }
    else{ const ins=await c.query(`insert into wa_contatos (org_id,nome,telefone,cidade,categoria,produto,origem,status,lead_id) values ($1,$2,$3,$4,'perdido',$5,'crm_perda','novo',$6) returning id`,[ORG,r.nome,norm(r.whatsapp),cid,prod,r.lead_id]); map.set(s,{id:ins.rows[0].id,cat:'perdido'}); novoPerd++ } }

  console.log('COMPRADORES: novos',novoComp,'| atualizados',updComp)
  console.log('PERDIDOS: novos',novoPerd,'| atualizados',updPerd,'| pulados (já compradores)',skipComp)
  console.log('números ruins excluídos:',ruins)
  console.log('\n=== LISTAS AGORA (categoria × produto × cidade) ===')
  ;(await c.query(`select categoria, coalesce(produto,'?') prod, coalesce(cidade,'(sem cidade)') cidade, count(*) n from wa_contatos where org_id=$1 and categoria in ('perdido','comprador') group by 1,2,3 order by 1,2,n desc`,[ORG])).rows.forEach(r=>console.log(`  ${r.categoria} · ${r.prod} · ${r.cidade}: ${r.n}`))
  console.log('\n=== TOTAIS por categoria ===')
  ;(await c.query(`select categoria, count(*) n from wa_contatos where org_id=$1 group by 1 order by n desc`,[ORG])).rows.forEach(r=>console.log(`  ${r.categoria}: ${r.n}`))
  await c.end()})().catch(e=>{console.log('ERRO',e.message);process.exit(1)})
