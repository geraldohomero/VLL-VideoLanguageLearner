# VLL — Video Language Learner

O **Video Language Learner (VLL)** é uma extensão para Google Chrome (Manifest V3) desenvolvida para ajudar estudantes de mandarim a aprenderem o idioma enquanto assistem a vídeos no YouTube. 

A extensão aprimora a experiência de visualização adicionando legendas interativas e personalizadas que facilitam a compreensão e a retenção de novo vocabulário.

## Principais Recursos

- **Legendas Multi-camadas:** Exibe simultaneamente os caracteres chineses originais (Hanzi), o Pinyin (romanização) e a tradução para o Português diretamente no vídeo do YouTube.
- **Dicionário Offline Integrado:** Traduções rápidas e instantâneas sem depender de conexões de rede ou APIs instáveis.
- **Tooltip e Inspeção de Palavras:** Passe o mouse sobre os caracteres nas legendas para obter traduções, definições e detalhes do vocabulário em tempo real (Hover Tooltip).
- **Sistema de Cores para Níveis de Conhecimento:** Identifique e marque visualmente o seu nível de domínio das palavras usando um sistema prático de cores.
- **Exportação para o Anki:** Salve rapidamente novas palavras e frases que você aprendeu para revisá-las e memorizá-las de forma espaçada criando cards no Anki.
- **Painel Lateral (Side Panel) / HUD:** Uma interface amigável para gerenciar o vocabulário, preferências de exibição e interagir com o conteúdo do vídeo de modo lado-a-lado.

## Tecnologias Utilizadas

- **HTML, CSS e JavaScript (Vanilla)**
- **Chrome Extensions API:** Manipulação do DOM (`content_scripts`), processos em segundo plano (`service_worker`) e painel lateral (`side_panel`).

## Como Instalar (Modo Desenvolvedor)

Como a extensão ainda está em desenvolvimento, você pode instalá-la manualmente no seu navegador:

1. Faça o clone deste repositório na sua máquina:
   ```bash
   git clone https://github.com/geraldohomero/VLL.git
   ```
   *(Ou faça o download do arquivo ZIP e extraia-o).*

2. Abra o Google Chrome e acesse a página de extensões através do endereço:
   ```text
   chrome://extensions/
   ```
3. Ative a opção **Modo do desenvolvedor** (chave no canto superior direito).
4. Clique no botão **Carregar sem compactação** (ou *Load unpacked*).
5. Selecione a pasta raiz do projeto `VLL` no seu computador.
6. Pronto! A extensão estará instalada. Fixe-a na barra de extensões para facilitar o acesso.

## Como Usar

1. Acesse o **YouTube** e abra um vídeo que possua legendas em chinês.
2. A extensão processará as legendas originais e renderizará automaticamente a interface multi-camadas (Hanzi, Pinyin e Tradução).
3. **Passe o mouse** sobre os caracteres para abrir o dicionário pop-up.
4. Clique no ícone da extensão para abrir o painel lateral e gerenciar suas palavras salvas e exportar o seu progresso para o Anki.

## Contribuição

Contribuições são muito bem-vindas! Se você encontrar algum problema ou tiver uma ideia de nova funcionalidade:

1. Faça um Fork do projeto
2. Crie uma Branch para sua Feature (`git checkout -b feature/NovaFeature`)
3. Faça o Commit de suas mudanças (`git commit -m 'Adiciona Nova Feature'`)
4. Faça o Push para a Branch (`git push origin feature/NovaFeature`)
5. Abra um Pull Request
