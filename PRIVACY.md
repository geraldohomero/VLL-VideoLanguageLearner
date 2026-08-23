# Política de Privacidade — VLL (Video Language Learner)

> **Última atualização:** 23 de Agosto de 2026

O **VLL (Video Language Learner)** é uma extensão de navegador para aprendizado de idiomas que valoriza e respeita integralmente a sua privacidade. Esta política descreve de forma clara e transparente como seus dados são tratados.

---

### 1. Coleta de Informações Pessoais

**O VLL NÃO coleta, armazena, monitora nem transmite nenhuma informação pessoal identificável.**

Especificamente:
* **Sem Contas ou Cadastros:** Você não precisa criar uma conta, fornecer nome, e-mail ou senha para usar o VLL.
* **Sem Rastreamento ou Telemetria:** Não utilizamos Google Analytics, cookies de terceiros, rastreadores de publicidade ou ferramentas de perfil comportamental.
* **Sem Histórico de Navegação:** A extensão não registra nem envia para nenhum servidor os vídeos que você assiste ou seu histórico de navegação.

---

### 2. Armazenamento Local de Dados

Todos os dados gerados durante o uso do VLL são mantidos **exclusivamente no armazenamento local do seu próprio navegador**:
* **Banco de Vocabulário:** Palavras salvas, notas de estudo, níveis de cor (vermelho, laranja, verde) e frases de exemplo são armazenadas via `IndexedDB` e `chrome.storage.local`.
* **Configurações de Exibição:** Suas preferências (idioma de destino, tamanho da fonte das legendas, posição do overlay) são salvas em `chrome.storage.local`.

Você tem controle total sobre esses dados: pode exportá-los para backup em formato JSON/CSV ou excluí-los a qualquer momento pelas opções do painel lateral ou desinstalando a extensão.

---

### 3. Comunicação de Rede e Serviços de Terceiros

Para fornecer recursos específicos de aprendizado, o VLL realiza as seguintes chamadas de rede diretas quando solicitado pelo usuário:
* **YouTube (`*.youtube.com`):** Para carregar os dados de legendas (closed captions) disponibilizados no vídeo que você está assistindo.
* **Google Tradutor / TTS (`translate.google.com`, `translate.googleapis.com`):** Utilizado sob demanda quando você solicita a pronúncia em áudio de um caractere ou tradução de uma frase que não conste no dicionário local offline (CEDICT). Nenhuma informação de identificação pessoal é transmitida nestas requisições.

---

### 4. Compartilhamento de Dados com Terceiros

O VLL:
* **NÃO** vende, aluga ou compartilha dados de usuários com empresas de publicidade ou corretores de dados.
* **NÃO** utiliza dados de usuários para finalidades não relacionadas à função central de aprendizado de idiomas.
* **NÃO** transfere dados para avaliação de crédito ou serviços financeiros.

---

### 5. Conformidade com as Políticas do Google Chrome Web Store

O VLL cumpre integralmente a **Política de Dados do Usuário da Chrome Web Store**, incluindo os princípios de Privilégio Mínimo e Finalidade Única (Single Purpose).

---

### 6. Contato e Código Aberto

O VLL é um projeto de código aberto. Você pode inspecionar todo o código-fonte, reportar problemas ou entrar em contato através do nosso repositório oficial no GitHub:
* **Repositório:** [https://github.com/geraldohomero/VLL-VideoLanguageLearner](https://github.com/geraldohomero/VLL-VideoLanguageLearner)
* **Issues:** [https://github.com/geraldohomero/VLL-VideoLanguageLearner/issues](https://github.com/geraldohomero/VLL-VideoLanguageLearner/issues)
