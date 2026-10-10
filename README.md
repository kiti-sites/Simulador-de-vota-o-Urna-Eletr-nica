\# Simulador de Votação — Reconstrução Experimental



Projeto de recuperação e execução local de uma versão web do simulador de votação da Justiça Eleitoral brasileira.



O objetivo é estudar o funcionamento do simulador, recuperar recursos ausentes e documentar os resultados de testes realizados em ambiente local.



> \*\*Aviso:\*\* este projeto é independente e não é um produto oficial do Tribunal Superior Eleitoral (TSE). A publicação deste código não implica endosso ou afiliação à Justiça Eleitoral.



\## Funcionalidades



\- Interface web para selecionar cenários de votação.

\- Carregamento do motor WebAssembly (WASM).

\- Execução local dos fluxos de treinamento disponíveis.

\- Simulação de votos nominais e em branco.

\- Navegação entre cargos e conclusão do treinamento.

\- Verificação automatizada da integridade dos arquivos.

\- Validação dos pacotes de dados e de suas dependências.



\## Cenários disponíveis



A implementação foi testada com oito cenários:



\- `municipal-t1` — eleições municipais, primeiro turno.

\- `municipal-t2` — eleições municipais, segundo turno.

\- `geral-t1` — eleições gerais, primeiro turno.

\- `geral-t2` — eleições gerais, segundo turno.

\- `geral-df-t1` — eleições gerais no Distrito Federal, primeiro turno.

\- `geral-df-t2` — eleições gerais no Distrito Federal, segundo turno.

\- `geral-zz-t1` — cenário de eleições gerais identificado como `geral-zz-t1`.

\- Um cenário adicional conforme identificado no manifesto original.



Os cenários e seus metadados devem ser conferidos em `wasm/bases/manifest.json`.



\## Requisitos



\- Python 3 instalado para executar um servidor HTTP local.

\- Node.js instalado para executar o verificador de integridade.

\- Navegador moderno com suporte a WebAssembly.



\## Como executar



Abra um terminal nesta pasta e inicie o servidor:



```bash

python -m http.server 8080

```



No Windows, também é possível utilizar:



```bat

py -m http.server 8080

```



Abra no navegador:



http://localhost:8080



Selecione um cenário disponível e inicie o treinamento.



Para encerrar o servidor, pressione `Ctrl+C` no terminal.



> Não abra o HTML diretamente com `file://`. O servidor HTTP local é necessário para carregar corretamente os módulos e os recursos do simulador.



\## Verificação de integridade



Na raiz desta pasta, execute:



```bash

node tools/verificar-recuperacao.js

```



O verificador examina os hashes registrados, os pacotes de cenários, os metadados e componentes do motor WebAssembly.



Um resultado positivo indica que as verificações implementadas passaram. Isso não equivale a uma auditoria completa de segurança nem garante o funcionamento em todos os ambientes.



\## Estrutura do projeto



```text

recuperado/

├── index.html

├── vota-wasm.html

├── COMO-EXECUTAR.md

├── css/

├── js/

├── fonts/

├── images/

├── wasm/

│   └── bases/

└── tools/

&#x20;   └── verificar-recuperacao.js

```



A estrutura acima é ilustrativa. Os nomes e diretórios devem corresponder aos arquivos presentes na versão publicada.



\## Limitações conhecidas



\- A interface reproduz somente os fluxos que foram efetivamente testados.

\- Funcionalidades internas identificadas no WASM podem não ser acessíveis pela interface web.

\- Recursos de áudio e acessibilidade podem depender de arquivos adicionais.

\- A compatibilidade pode variar conforme o navegador e o ambiente de execução.



Não se deve presumir que encontrar uma função ou um estado interno no binário significa que a funcionalidade esteja operacional ou possa ser ativada diretamente.



\## Integridade e procedência



Este projeto foi montado a partir de arquivos recuperados e de componentes auxiliares reconstruídos para permitir a execução local.



Os arquivos binários, loaders reconstruídos e demais recursos podem ter origens e condições de licenciamento diferentes. Antes de redistribuir o repositório, verifique se os direitos e as licenças aplicáveis permitem publicar cada componente.



Os hashes SHA-256 registrados pelo projeto podem ser utilizados para verificar a integridade dos arquivos, mas não comprovam, por si só, sua autenticidade ou autorização de redistribuição.



\## Uso responsável



Este projeto destina-se a estudo, preservação técnica e experimentação em ambiente local.



Não representa uma urna eletrônica real, não transmite votos e não deve ser utilizado para interferir em sistemas eleitorais ou induzir terceiros a acreditar que estão participando de uma votação oficial.



\## Créditos



O simulador de origem é associado à Justiça Eleitoral brasileira. Os direitos sobre os componentes originais pertencem aos respectivos titulares.



A documentação da recuperação, os testes e as ferramentas auxiliares devem ser identificados conforme sua autoria e suas licenças específicas.

