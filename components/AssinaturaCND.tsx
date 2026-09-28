// A ASSINATURA DISCRETA da CarreiraNoDigital (a mesma peça dos sistemas dos clientes), aqui na tela
// da chamada da própria escola — pedido do Nando em 28/09/2026. Leva pra página do Sistema CND.
const SITE = 'https://carreiranodigital.vercel.app/sistema-cnd.html?utm_source=assinatura'

export default function AssinaturaCND({ escuro = false }: { escuro?: boolean }) {
  return (
    <a href={SITE} target="_blank" rel="noopener"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, margin: '28px auto 0', width: 'fit-content',
        fontSize: 11.5, color: escuro ? 'rgba(255,255,255,.55)' : 'rgba(42,32,35,.5)', textDecoration: 'none', fontFamily: 'inherit' }}>
      <img src="/cnd-marca.png" alt="" width={18} height={18} style={{ borderRadius: 5, display: 'block' }} />
      desenvolvido por <b style={{ fontWeight: 700 }}>CarreiraNoDigital</b>
    </a>
  )
}
