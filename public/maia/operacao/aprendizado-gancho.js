/* Maia: o gancho do aprendizado no painel da equipe (13/11). Arquivo à parte (o painel principal só carrega este script):
   1) quando a equipe DESCARTA ou PEDE AJUSTE de uma peça, abre a pergunta "por quê?" (motivos rápidos + campo livre)
   2) na conversa com cliente, cada mensagem da Maia ganha "isso está errado" → motivo + "o certo seria:"
   3) a aba "Aprendizado" no menu (regras propostas, acerto de primeira, análise da manhã)
   Tudo vai pra /api/maia/aprendizado (mesma senha). Se der erro aqui, o painel segue funcionando igual. */
(function(){
'use strict';
var API='/api/maia/aprendizado', CHAVE='maia_op_senha';
var MOTIVOS=null, EQUIPE=['Guto','Mateus','Nando'];
function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){ return null; } }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function senha(){ return ls(CHAVE)||''; }
var fetchOriginal=window.fetch.bind(window);
function api(arg){
  var o={headers:{'x-senha':senha()}}, url=API;
  if(typeof arg==='string') url+='?'+arg; else { o.method='POST'; o.headers['content-type']='application/json'; o.body=JSON.stringify(arg); }
  return fetchOriginal(url,o).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error((j&&j.erro)||('erro '+r.status)); return j; }); });
}
function carregaMotivos(){
  if(MOTIVOS) return Promise.resolve(MOTIVOS);
  return api('acao=motivos').then(function(r){ MOTIVOS=r.motivos||[]; if(r.equipe&&r.equipe.length) EQUIPE=r.equipe; return MOTIVOS; });
}

/* ---------- estilo (as cores vêm das variáveis do painel) ---------- */
var css=document.createElement('style');
css.textContent=
'.apr-fundo{position:fixed;inset:0;background:rgba(20,14,40,.42);display:flex;align-items:flex-end;justify-content:center;z-index:9999;padding:16px}'+
'@media(min-width:700px){.apr-fundo{align-items:center}}'+
'.apr-caixa{background:var(--surface,#fff);color:var(--text,#1b1530);border-radius:18px;max-width:520px;width:100%;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.2);max-height:90vh;overflow:auto}'+
'.apr-caixa h2{font:800 18px/1.3 "Bricolage Grotesque",Manrope,sans-serif;margin:0 0 4px}'+
'.apr-caixa p.mu{color:var(--text-muted,#6b6485);font-size:13px;margin:0 0 12px}'+
'.apr-orig{background:var(--surface-2,#f3f0fa);border-radius:12px;padding:8px 11px;font-size:13px;margin:0 0 12px;white-space:pre-wrap;max-height:120px;overflow:auto}'+
'.apr-chips{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}'+
'.apr-chip{border:1.5px solid var(--border-strong,#dcd5ec);background:var(--surface,#fff);color:var(--text-2,#423a5c);border-radius:999px;padding:6px 12px;font:700 13px Manrope,sans-serif;cursor:pointer}'+
'.apr-chip[aria-pressed="true"]{background:var(--accent,#7c3aed);border-color:var(--accent,#7c3aed);color:#fff}'+
'.apr-caixa label{display:block;font:700 13px Manrope,sans-serif;margin:0 0 4px;color:var(--text-2,#423a5c)}'+
'.apr-caixa textarea,.apr-caixa select{width:100%;box-sizing:border-box;border:1.5px solid var(--border-strong,#dcd5ec);border-radius:12px;padding:8px 10px;font:14px Manrope,sans-serif;background:var(--surface,#fff);color:var(--text,#1b1530);margin:0 0 10px}'+
'.apr-caixa textarea{min-height:60px;resize:vertical}'+
'.apr-bts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:4px}'+
'.apr-bt{border:1.5px solid var(--border-strong,#dcd5ec);background:var(--surface,#fff);color:var(--text,#1b1530);border-radius:12px;padding:9px 16px;font:700 14px Manrope,sans-serif;cursor:pointer;min-height:40px}'+
'.apr-bt.ok{background:var(--accent,#7c3aed);border-color:var(--accent,#7c3aed);color:#fff}'+
'.apr-bt:disabled{opacity:.55;cursor:wait}'+
'.apr-erro{color:var(--red,#b91c1c);font-size:13px;margin:0 0 8px}'+
'.apr-errado{display:block;margin-top:4px;border:0;background:none;color:var(--text-faint,#77708f);font:700 11.5px Manrope,sans-serif;cursor:pointer;padding:2px 0;text-decoration:underline}'+
'.apr-errado:hover{color:var(--red,#b91c1c)}'+
'.apr-errado.feito{color:var(--amber,#b45309);text-decoration:none;cursor:default}';
document.head.appendChild(css);

/* ---------- a caixa do "por quê" ---------- */
// o: { titulo, frase, original, livre, certo: true|false, alvo, envio: {...campos pra API} }
function perguntaPorque(o){
  return carregaMotivos().then(function(motivos){
    return new Promise(function(fim){
      var quem=ls('maia_op_quem')||'';
      var f=document.createElement('div'); f.className='apr-fundo';
      var lista=motivos.filter(function(m){ return m.id!=='outro' && (o.alvo==='resposta' ? m.area!=='criacao' : true); });
      f.innerHTML='<div class="apr-caixa" role="dialog" aria-modal="true" aria-labelledby="apr-t">'+
        '<h2 id="apr-t">'+esc(o.titulo||'Por quê?')+'</h2><p class="mu">'+esc(o.frase||'Uma linha basta: é com isso que a Maia aprende.')+'</p>'+
        (o.original?'<div class="apr-orig">'+esc(o.original)+'</div>':'')+
        '<div class="apr-chips">'+lista.map(function(m){ return '<button type="button" class="apr-chip" aria-pressed="false" data-m="'+esc(m.id)+'">'+esc(m.rotulo)+'</button>'; }).join('')+'</div>'+
        '<label for="apr-livre">Outro motivo (opcional)</label><textarea id="apr-livre" maxlength="300" placeholder="ex.: falou de entrega no domingo, e eles não abrem">'+esc(o.livre||'')+'</textarea>'+
        (o.certo?'<label for="apr-certo">O certo seria:</label><textarea id="apr-certo" maxlength="800" placeholder="como a Maia devia ter respondido"></textarea>':'')+
        '<label for="apr-quem">Quem corrigiu</label><select id="apr-quem"><option value="">equipe</option>'+EQUIPE.map(function(n){ return '<option'+(n===quem?' selected':'')+'>'+esc(n)+'</option>'; }).join('')+'</select>'+
        '<div class="apr-erro" hidden></div>'+
        '<div class="apr-bts"><button type="button" class="apr-bt" data-x="pular">Pular</button><button type="button" class="apr-bt ok" data-x="ok">Guardar</button></div></div>';
      document.body.appendChild(f);
      var caixa=f.firstChild, erro=caixa.querySelector('.apr-erro');
      function fecha(r){ f.remove(); document.removeEventListener('keydown',tecla); fim(r); }
      function tecla(e){ if(e.key==='Escape') fecha(null); }
      document.addEventListener('keydown',tecla);
      Array.prototype.forEach.call(caixa.querySelectorAll('.apr-chip'),function(b){ b.onclick=function(){ b.setAttribute('aria-pressed', b.getAttribute('aria-pressed')==='true'?'false':'true'); }; });
      caixa.querySelector('[data-x="pular"]').onclick=function(){ fecha(null); };
      caixa.querySelector('[data-x="ok"]').onclick=function(){
        var bt=this, motivos=Array.prototype.map.call(caixa.querySelectorAll('.apr-chip[aria-pressed="true"]'),function(b){ return b.dataset.m; });
        var livre=caixa.querySelector('#apr-livre').value.trim(), certo=o.certo?caixa.querySelector('#apr-certo').value.trim():'';
        var q=caixa.querySelector('#apr-quem').value; ls('maia_op_quem',q||null);
        if(!motivos.length && !livre){ erro.hidden=false; erro.textContent='Escolhe um motivo ou escreve o porquê.'; return; }
        bt.disabled=true; bt.textContent='guardando…';
        var corpo={acao:'corrigir',motivos:motivos,livre:livre,certo:certo,por:q||'equipe'};
        for(var k in o.envio) corpo[k]=o.envio[k];
        api(corpo).then(function(r){ fecha(r); }).catch(function(e){ bt.disabled=false; bt.textContent='Guardar'; erro.hidden=false; erro.textContent='Não deu: '+e.message; });
      };
      var primeiro=caixa.querySelector('.apr-chip'); if(primeiro) primeiro.focus();
    });
  }).catch(function(){ return null; });
}
window.maiaPerguntaPorque=perguntaPorque;

/* ---------- 1) descartar / pedir ajuste de peça: o porquê depois que deu certo ---------- */
window.fetch=function(url,init){
  var p=fetchOriginal(url,init);
  try{
    var u=typeof url==='string'?url:(url&&url.url)||'';
    if(/\/api\/maia\/operacao(\?|$)/.test(u) && init && init.method==='POST' && typeof init.body==='string'){
      var b=JSON.parse(init.body);
      if(b && (b.acao==='descartar_peca'||b.acao==='ajustar_peca') && b.peca_id){
        // o texto da peça é lido AGORA: depois da resposta o painel recarrega e o cartão some
        var card=document.querySelector('[data-peca="'+(window.CSS&&CSS.escape?CSS.escape(b.peca_id):b.peca_id)+'"]');
        var orig=card?[(card.querySelector('.gancho')||{}).textContent,(card.querySelector('.texto')||{}).textContent].filter(Boolean).join(' · '):'';
        p.then(function(r){ if(r.ok) setTimeout(function(){
          perguntaPorque({ alvo:'peca', titulo:b.acao==='descartar_peca'?'Por que descartou?':'Por que pediu ajuste?', original:orig||'', livre:b.acao==='ajustar_peca'?(b.nota||''):'',
            envio:{peca_id:b.peca_id, acao_original:b.acao==='descartar_peca'?'descartar':'ajustar'} }).then(function(r){ if(r&&r.ok) avisa('Guardado. A Maia aprende com isso.'); });
        },350); }).catch(function(){});
      }
    }
  }catch(e){}
  return p;
};
function avisa(t){ var d=document.createElement('div'); d.setAttribute('role','status'); d.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text,#1b1530);color:var(--bg,#fff);padding:10px 16px;border-radius:12px;font:700 14px Manrope,sans-serif;z-index:9999'; d.textContent=t; document.body.appendChild(d); setTimeout(function(){ d.remove(); },2600); }

/* ---------- 3) a aba no menu ---------- */
var ICONE='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>';
function poeAba(){
  var nav=document.getElementById('abas');
  if(!nav || nav.querySelector('[data-aprendizado]')) return;
  var a=document.createElement('a'); a.className='ab'; a.href='/maia/operacao/aprendizado.html'; a.setAttribute('data-aprendizado','1');
  a.innerHTML=ICONE+'<span>Aprendizado</span>'; nav.appendChild(a);
}

/* ---------- 2) "isso está errado" nas mensagens da Maia (conversa com cliente) ---------- */
var marcando=null;
function marcaConversa(){
  var chat=document.getElementById('chat'); if(!chat) return;
  var sel=document.querySelector('.cv-it.on[data-cv]'); if(!sel) return;
  var cvId=sel.getAttribute('data-cv'); if(!cvId || cvId==='__dono' || sel.querySelector('.av.dono')) return;
  var baloes=chat.querySelectorAll('.bal'); if(!baloes.length) return;
  if(chat.getAttribute('data-apr')===cvId+':'+baloes.length) return;
  if(marcando===cvId+':'+baloes.length) return;
  marcando=cvId+':'+baloes.length;
  api('acao=conversa&id='+encodeURIComponent(cvId)).then(function(r){
    marcando=null;
    var agora=document.getElementById('chat'); if(!agora) return;
    var bs=agora.querySelectorAll('.bal');
    if(bs.length!==r.msgs.length) return;   // a tela mudou no meio: tenta de novo na próxima mudança
    var feitas={}; (r.correcoes||[]).forEach(function(c){ if(c.msg_id!=null) feitas[String(c.msg_id)]=1; });
    r.msgs.forEach(function(m,i){
      var b=bs[i]; if(m.autor!=='maia' || !b.classList.contains('maia') || b.querySelector('.apr-errado')) return;
      var bt=document.createElement('button'); bt.type='button'; bt.className='apr-errado'+(feitas[String(m.id)]?' feito':'');
      bt.textContent=feitas[String(m.id)]?'corrigida pela equipe':'isso está errado';
      if(!feitas[String(m.id)]) bt.onclick=function(){
        perguntaPorque({ alvo:'resposta', titulo:'O que está errado nessa resposta?', original:m.texto, certo:true, envio:{conversa_id:cvId, msg_id:m.id, acao_original:'resposta_errada'} })
          .then(function(x){ if(x&&x.ok){ bt.textContent='corrigida pela equipe'; bt.className='apr-errado feito'; bt.onclick=null; avisa('Correção guardada.'); } });
      };
      var hora=b.querySelector('.hora'); if(hora) b.insertBefore(bt,hora); else b.appendChild(bt);
    });
    agora.setAttribute('data-apr',cvId+':'+bs.length);
  }).catch(function(){ marcando=null; });
}

var pendente=false;
new MutationObserver(function(){ if(pendente) return; pendente=true; setTimeout(function(){ pendente=false; try{ poeAba(); marcaConversa(); }catch(e){} },120); })
  .observe(document.body,{childList:true,subtree:true});
poeAba();
})();
