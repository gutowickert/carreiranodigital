# Lançamento da Maia: os textos dos modelos (WhatsApp da escola, 51 99505-4548)

Os modelos de abertura foram enviados pra Meta em 15/11/2026 (status: em análise). O texto final é o que foi aprovado na Meta; este arquivo guarda a cópia.

Cabeçalho de imagem dos dois (o encarte):
https://rwyrtnxvqlvpcimnvqhb.supabase.co/storage/v1/object/public/estudio/maia-lancamento/encarte-maia-invadiu-a-escola.jpg

Botões (resposta rápida), exatamente assim: **Quero ver** e **Agora não**. O clique volta no webhook com esse texto, e a Maia reconhece os dois.

Na tela de Disparos, a variável 1 do corpo é o primeiro nome: escreve `{nome}` no campo da variável 1.

## 1. `maia_invadiu_aluno` (ex-alunos)

Categoria MARKETING · pt_BR · id 1599840808123793

```
(o texto final aprovado entra aqui)
```

## 2. `maia_invadiu_contato` (os demais contatos)

Categoria MARKETING · pt_BR · id 1453622693610991

```
(o texto final aprovado entra aqui)
```

## Modelos opcionais (fora da janela de 24 h)

Sem eles, o sistema funciona: o que precisaria de modelo vai pra fila "Retomada à mão" na tela do lançamento, e a amostra sai por texto quando a janela está aberta (ou antes da hora combinada, se a janela for fechar antes). Se forem aprovados, põe o nome na variável da Vercel.

| Pra quê | Variável na Vercel | Sugestão de texto ({{1}} = primeiro nome) |
|---|---|---|
| Amostra pronta, janela fechada | `MAIA_LANC_MODELO_ENTREGA` (e `MAIA_LANC_MODELO_ENTREGA_BOTAO=1` se tiver botão de link `https://www.carreiranodigital.com/maia/amostra/{{1}}`) | Oi, {{1}}! Aqui é a Maia. A tua amostra grátis ficou pronta: 2 anúncios e 1 vídeo com as tuas fotos. Quer ver? |
| Retomada de 3 dias | `MAIA_LANC_MODELO_RETOMADA` | Oi, {{1}}! Aqui é a Maia de novo. A tua amostra grátis continua guardada aqui. Quer seguir? |
| Despedida de 6 dias | `MAIA_LANC_MODELO_DESPEDIDA` | Oi, {{1}}! Tentei falar contigo, entendo a correria. Vou parar por aqui e fico à disposição. |
