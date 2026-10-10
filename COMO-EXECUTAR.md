# Recuperação do Simulador de Votação VOTA — como executar localmente

## Origem dos arquivos (somente leitura, sem reescrita do original)

- `simulador/` — snapshot "Salvar página" quebrado (HTML com sufixos `.download`,
  caminhos `./Simulador de votação_files/...`, scripts/blob injetados por extensões).
  Preservado intacto; nada foi apagado ou sobrescrito.
- `Arquivos achados/` — artefatos avulsos do build ao vivo:
  `vota_web_wasm.js/.wasm/.data/.version` + `votaWasmAdapter.js` +
  `municipal-t1.data` (782.119 bytes, SHA-256 `0e8ab495…cf30d5f3`, integrado em
  10/10/2026 após a reconstrução inicial).
- `outras data/` — 7 binários `*.data` dos demais cenários (geral-t1/t2,
  geral-df-t1/t2, geral-zz-t1/t2, municipal-t2), **sem** os loaders `*.data.js`.
  Os loaders foram reconstruídos por engenharia reversa do formato (DER + pid com
  `<stem>.jez` + alias `t00000br-pu` duplicado + nomes fixos com turno) e validados
  pelo autoteste byte-idêntico do `municipal-t1.data.js` + boot real de cada cenário.
- Wayback Machine (web.archive.org, capturas 2026-10-04/07, URLs
  `https://www.justicaeleitoral.jus.br/simulador-votacao/...`): fonte do
  `vota-wasm.html` limpo, `manifest.json`, `images/*.svg` (14) e `fonts/*.woff2` (4),
  além de confirmação byte-a-byte (SHA-256) de `votaWasmAdapter.js`,
  `progress-navigation.js`, `vota_web_wasm.js` e dos CSS.
  O acesso direto ao site oficial retornou `403 Access Denied` (Akamai) tanto via
  `curl` quanto via `Invoke-WebRequest`; nada foi baixado do site ao vivo além das
  tentativas que falharam e ficaram registradas.

## Layout reconstruído (pasta `recuperado/`)

```
recuperado/
  index.html                # menu de cenários (padrão: municipal-t1)
  vota-wasm.html            # HTML ao vivo + link "Trocar cenário" no cabeçalho
  css/vota-wasm.css
  css/eleitor-escolhas.css
  js/votaWasmAdapter.js
  js/progress-navigation.js
  wasm/vota_web_wasm.js
  wasm/vota_web_wasm.wasm
  wasm/vota_web_wasm.data
  wasm/vota_web_wasm.version   # "416ed3182ba38be0"
  wasm/bases/manifest.json     # 8 cenários, gerado em 2026-09-10 (inalterado)
  wasm/bases/municipal-t1.data(.js)  # original recuperado (69 arquivos)
  wasm/bases/geral-t1.data(.js)      # loader reconstruído (90 arquivos)
  wasm/bases/geral-t2.data(.js)      # loader reconstruído (90 arquivos)
  wasm/bases/geral-df-t1.data(.js)   # loader reconstruído (90 arquivos)
  wasm/bases/geral-df-t2.data(.js)   # loader reconstruído (90 arquivos)
  wasm/bases/geral-zz-t1.data(.js)   # loader reconstruído (69 arquivos)
  wasm/bases/geral-zz-t2.data(.js)   # loader reconstruído (69 arquivos)
  wasm/bases/municipal-t2.data(.js)  # loader reconstruído (69 arquivos)
  images/*.svg                 # 14 (urna + botões), via Wayback
  fonts/*.woff2                # 4 (Atkinson + Inter), via Wayback
  tools/verificar-recuperacao.js
```

## Menu de cenários

Abra `http://localhost:8080/index.html`: os 8 cenários do manifesto aparecem com
rótulo, tipo/turno/UF/fase e pílula **disponível** (pacote presente) ou
**pacote ausente**. `municipal-t1` vem pré-selecionado; **Iniciar votação** grava
`vota-wasm-cenario` (+ rótulo) no `localStorage` — o mesmo mecanismo que o
adaptador original já usava (`js/votaWasmAdapter.js`, `selectScenario`) — e abre
`vota-wasm.html`. O link **Trocar cenário** no cabeçalho volta ao menu sem
reinicializar nada à força (o WASM sempre reinicia limpo por navegação; não há
troca de pacote com o módulo já inicializado). Para adicionar um cenário novo:
deposite `<id>.data` + `<id>.data.js` em `wasm/bases/` e registre-o no
`manifest.json` com os mesmos campos dos demais.

## Estado atual: 8/8 cenários funcionais (verificado em navegador real, 10/10/2026)

- `municipal-t1` (regressão OK): Vereador (15) + Prefeito (5) → conclusão.
- `municipal-t2`: Prefeito (2) → conclusão.
- `geral-t1`: Dep. Federal (12) + Dep. Estadual (13) + Senador ×2 (5) + Governador (5) + Presidente (5) → conclusão.
- `geral-t2`: Governador (2) + Presidente (2) → conclusão.
- `geral-df-t1`: como o geral-t1, com Dep. Distrital no lugar do Estadual → conclusão.
- `geral-df-t2`: Governador (2) + Presidente (2) → conclusão.
- `geral-zz-t1`: Presidente (5) → conclusão. `geral-zz-t2`: Presidente (2) → conclusão.
- Zero `pageerror` em todos; todos via voto em branco + confirma por cargo.
- Voz opcional `wasm/rhvoice-leticia.data.js` só é exigida com acessibilidade "sim".

## Servir e testar (somente local, dados fictícios de treino)

```powershell
cd "C:\Users\rafae\Downloads\scrr\recuperado"
node tools/verificar-recuperacao.js
node --check js/votaWasmAdapter.js
node --check js/progress-navigation.js
node --check wasm/vota_web_wasm.js
python -m http.server 8080
# abrir http://localhost:8080/index.html  (menu; padrão: municipal-t1)
```

O que esperar hoje: página, CSS, imagens e fontes carregam; `wasm/*.js|wasm|data|
version`, `wasm/bases/manifest.json`, `municipal-t1.data.js` e `municipal-t1.data`
retornam 200; o módulo WASM instancia (`WebAssembly.validate: true`, símbolos
`_votaInit/_votaPressKey/_votaTick/_votaSetAudioEnabled/_votaGetStateJson`
presentes no glue) e a votação de treino funciona de ponta a ponta — não conecte
a nada de produção.
