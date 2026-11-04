# Oficina da Maia

É o "braço" que faz os arquivos dos anúncios. Quando a Maia cria um anúncio, ela grava uma tarefa numa fila do sistema. A oficina fica perguntando essa fila a cada 5 segundos. Quando aparece uma tarefa, ela baixa a foto ou o vídeo do dono, faz o arquivo e devolve pro sistema. Depois a peça vai pra revisão da equipe.

- **Arte** (anúncio em imagem ou post): imagem 1080x1350 (formato do feed). A foto do dono ocupa a arte, o gancho vai em letra grande e embaixo fica uma barra com o nome do negócio (e o logo, se tiver) e o botão do CTA. São 3 layouts (base, faixa e cabeçalho), e cada peça cai sempre no mesmo. Quando a equipe pede ajuste, a versão nova troca de layout. O texto é só o que veio da peça: gancho, CTA e nome. Nenhum texto é inventado.
- **Vídeo** (anúncio em vídeo): vídeo vertical 1080x1920. Fica na ordem em que foi gravado, sem cortar o meio e sem reordenar. Só sai o silêncio do começo e do fim. Tem legenda no tempo da fala (na parte de baixo, com a palavra falada em destaque) e um cartão final de 2,5 s com o gancho, o CTA e o nome, nas cores da marca. Vídeo gravado deitado ganha fundo desfocado. Vídeo sem fala sai sem legenda. A trilha só entra se tiver uma música na pasta `trilhas/`. O vídeo pronto sai em MP4 e fica com até ~60 s.

## Variáveis (no arquivo `.env` desta pasta, ou no painel da Railway)

| Variável | Pra quê |
|---|---|
| `MAIA_URL` | endereço do sistema (ex.: `https://...vercel.app`) |
| `MAIA_OFICINA_CHAVE` | a mesma chave que está no sistema (é a senha da fila) |
| `DEEPGRAM_API_KEY` | chave da transcrição (sem ela o vídeo sai sem legenda) |
| `CHROME_PATH` | só se o Chrome estiver em outro lugar. Padrão: `C:\Program Files\Google\Chrome\Application\chrome.exe` no Windows e `/usr/bin/chromium` no Linux |
| `FFMPEG` | só se o ffmpeg não estiver no caminho padrão. Padrão: `ffmpeg` |
| `OFICINA_MAX_MB` | opcional: tamanho máximo do envio. Se o vídeo passar disso, a oficina comprime de novo pra caber (ver "Cuidados") |

Tem um modelo em `.env.exemplo`.

## Rodar no computador

Precisa de Node 20 ou mais novo, do Chrome e do ffmpeg instalados.

```
cd C:\maia-v1\maia-oficina
npm install
node oficina.js              (fica rodando e pega as tarefas)
node oficina.js --uma-vez    (pega uma tarefa só e sai)
```

Testes que não mexem na fila (o resultado vai pra pasta `saida/`):

```
node oficina.js --teste-arte  foto.jpg  "Gravataí e região: óculos de grau em até 24x" "Chama no WhatsApp" "Ótica Tempo de Visão"
node oficina.js --teste-video video.mov "Gravataí e região: óculos de grau em até 24x" "Chama no WhatsApp" "Ótica Tempo de Visão"
```

Opções do teste: `--marca '{"cores":{"primaria":"#5b3a1e","secundaria":"#f0b429"}}'`, `--logo logo.png`, `--id qualquer-coisa` (troca o layout) e `--saida nome-do-arquivo`.

## Subir na Railway (ainda não foi feito)

1. Na Railway: New Project → Deploy from GitHub repo → escolhe o repositório. Em Settings → Root Directory, põe `maia-oficina`. Ela acha o `Dockerfile` sozinha. Dentro dele já vêm o Node 22, o Chromium, o ffmpeg e as fontes.
2. Em Variables, põe `MAIA_URL`, `MAIA_OFICINA_CHAVE` e `DEEPGRAM_API_KEY` (e `OFICINA_MAX_MB=4.5` se o sistema estiver na Vercel).
3. Não precisa de domínio nem de porta, porque a oficina não recebe visita, só pergunta a fila. Uma máquina de 1 GB de memória dá conta. Vídeo pesa mais, então se travar, sobe pra 2 GB.
4. Pra ver se está funcionando, abre os Logs: tem que aparecer "oficina ligada" e, a cada tarefa, "entregue ✔".

## Cuidados

- **Tamanho do envio:** um vídeo de 20 s fica com ~10 MB, e a entrega vai em base64 dentro do JSON (fica ~33% maior). A Vercel recusa pedido com mais de ~4,5 MB. Por isso, com `OFICINA_MAX_MB=4.5` a oficina comprime o vídeo pra caber, só que a qualidade cai. O certo é o sistema dar um link de upload direto pro armazenamento.
- **Rosto:** a oficina não detecta rosto. Os layouts deixam o terço de cima da foto livre e a legenda fica sempre embaixo, que é onde funciona na maioria das fotos e vídeos de celular. Foto com o rosto embaixo pode ficar com texto em cima.
- **Transcrição:** a legenda é o que a Deepgram ouviu (o nome do negócio vai como dica pra ela escrever certo). Se ela errar uma palavra, o erro aparece na legenda, porque a oficina não corrige nem inventa.
