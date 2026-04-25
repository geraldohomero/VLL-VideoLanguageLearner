# VLL — Modelo ER do Banco de Dados (IndexedDB)

**Database:** `VLL_DB` · **Version:** `2`

## Diagrama ER

```mermaid
erDiagram
    VLL_DB ||--o{ words : contains
    VLL_DB ||--o{ translations : contains

    words {
        string word PK "Caractere/palavra (ex: 你好)"
        string pinyin "Romanização (ex: nǐ hǎo)"
        string meaning "Significado original (dicionário/Google)"
        string meaningPt "Tradução automática para idioma-alvo"
        string customMeaning "Significado editado pelo usuário ✏️"
        string wordLang "Idioma da palavra (ex: zh, ja, ko)"
        string color "Nível de conhecimento (red, orange, green, white)"
        string dateAdded "ISO 8601 — data de criação"
        string lastSeen "ISO 8601 — último acesso"
        string context "Frase de contexto da legenda"
    }

    translations {
        string key PK "sourceLang::targetLang::text"
        string translatedText "Texto traduzido"
        string romanizedText "Romanização (pinyin etc.)"
        string sourceLang "Idioma de origem"
        string targetLang "Idioma de destino"
        number updatedAt "Timestamp ms — última atualização"
        number expiresAt "Timestamp ms — expiração do cache"
    }
```

## Detalhes dos Object Stores

### `words` — Vocabulário do Usuário

| Campo | Tipo | Key/Index | Descrição |
|-------|------|-----------|-----------|
| `word` | string | 🔑 **keyPath** | Caractere ou palavra no idioma original |
| `pinyin` | string | — | Romanização (pinyin, romaji, etc.) |
| `meaning` | string | — | Significado do dicionário local ou Google |
| `meaningPt` | string | — | Tradução automática para o idioma-alvo |
| `customMeaning` | string | — | **Significado editado manualmente** pelo usuário (prioridade máxima) |
| `wordLang` | string | — | Idioma da palavra salva (ex: `zh`, `ja`, `ko`) |
| `color` | string | 📇 **index** | Nível de conhecimento: `red` / `orange` / `green` / `white` |
| `dateAdded` | string | 📇 **index** | Data de adição (ISO 8601) |
| `lastSeen` | string | 📇 **index** | Último acesso ou atualização (ISO 8601) |
| `context` | string | — | Frase da legenda onde a palavra foi encontrada |

### `translations` — Cache de Traduções

| Campo | Tipo | Key/Index | Descrição |
|-------|------|-----------|-----------|
| `key` | string | 🔑 **keyPath** | Chave composta: `sourceLang::targetLang::text` |
| `translatedText` | string | — | Resultado da tradução |
| `romanizedText` | string | — | Romanização retornada pela API |
| `sourceLang` | string | — | Idioma de origem (ex: `zh-CN`, `auto`) |
| `targetLang` | string | — | Idioma de destino (ex: `pt`, `en`) |
| `updatedAt` | number | 📇 **index** | Timestamp da última atualização |
| `expiresAt` | number | 📇 **index** | Timestamp de expiração (TTL: 30 dias) |

## Prioridade de Significados

```mermaid
flowchart LR
    A["customMeaning ✏️"] --> B{"Vazio?"}
    B -- Não --> Z["Exibir customMeaning"]
    B -- Sim --> C["meaningPt"]
    C --> D{"Vazio?"}
    D -- Não --> Z2["Exibir meaningPt"]
    D -- Sim --> E["meaning"]
    E --> F{"Vazio?"}
    F -- Não --> Z3["Exibir meaning"]
    F -- Sim --> Z4["(sem definição)"]

    style A fill:#7c6cf0,color:#fff
    style Z fill:#44dd88,color:#000
    style Z2 fill:#44dd88,color:#000
    style Z3 fill:#44dd88,color:#000
    style Z4 fill:#ff4466,color:#fff
```

## Operações CRUD

| Operação | Função | Store |
|----------|--------|-------|
| Criar/Atualizar palavra | `vllSaveWord(entry)` | words |
| Criar lote | `vllSaveWordsBatch(entries)` | words |
| Buscar palavra | `vllGetWord(word)` | words |
| Listar todas | `vllGetAllWords()` | words |
| Filtrar por cor | `vllGetWordsByColor(color)` | words |
| Buscar cores em lote | `vllGetWordColors(wordList)` | words |
| Atualizar cor | `vllUpdateColor(word, color)` | words |
| Atualizar significado | `vllUpdateMeaning(word, customMeaning)` | words |
| Deletar palavra | `vllDeleteWord(word)` | words |
| Ler cache tradução | `vllGetTranslationCache(key)` | translations |
| Salvar cache tradução | `vllSetTranslationCache(entry)` | translations |
| Limpar cache expirado | `vllPruneExpiredTranslationCache(limit)` | translations |
