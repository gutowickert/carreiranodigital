import Script from 'next/script'
import { PIXEL_ESCOLA } from '@/lib/maia/quiz/quiz'
import './quiz.css'
import './nicho-visual.css'

// Quiz de diagnóstico da Maia (páginas públicas, sem login). Claro, no padrão das páginas da Maia.
// O pixel da escola entra aqui (PageView); ViewContent, Lead e InitiateCheckout saem da página do quiz.
const pixel = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ESCOLA}');fbq('track','PageView');`

export default function LayoutQuizMaia({ children }: { children: React.ReactNode }) {
  return (
    <div className="mq">
      <Script id="pixel-maia-quiz" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: pixel }} />
      {children}
    </div>
  )
}
