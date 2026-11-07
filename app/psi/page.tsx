import App from './_app/App'

// Tudo do consultório roda no aparelho (o login dela + a RLS do banco). As telas trocam pelo # do
// endereço (#/agenda, #/paciente/...), então o botão "voltar" do celular funciona.
export default function Page() {
  return <App />
}
