# FREQsys

Sistema de gestão e automação para processos técnicos e operacionais, desenvolvido para Mariana.

## 🚀 Estrutura do Projeto

O projeto é uma Single Page Application (SPA) organizada da seguinte forma:

- **`/`**: Arquivo principal `index.html` e configurações do sistema.
- **`css/`**: Estilos visuais do site (CSS vanilla).
- **`js/`**: Lógica do sistema modularizada:
  - `firebase-init.js`: Coração do sistema, gerencia a autenticação e conexão com o banco de dados.
  - Outros módulos (`match-system`, `profile-edit`, etc.) lidam com funcionalidades específicas.
- **`docs/`**: Relatórios e documentos técnicos.
- **`backups/`**: Cópias de segurança de versões anteriores.

## 🛠️ Tecnologias e Infraestrutura

- **Banco de Dados**: Google Firestore (NoSQL em tempo real) para persistência de dados de usuários, equipes e matches.
- **Autenticação**: Firebase Auth.
- **Hospedagem**: Publicado via **GitHub Pages** (o deploy ocorre automaticamente ao enviar alterações para o repositório).

## 🛠️ Como Desenvolver e Testar

Para garantir que o site funcione exatamente como no GitHub Pages, use os comandos abaixo:

1.  **Rodar Localmente**:
    ```bash
    npm start
    ```
    Isso abrirá um servidor de teste no seu computador (geralmente em `http://localhost:3000` ou `5000`). É a forma recomendada para testar mudanças em arquivos JavaScript e CSS antes de publicar.

2.  **Conferência Visual**:
    ```bash
    npm run verify
    ```
    Este comando utiliza o script `verify.ps1` para filtrar e listar no terminal as linhas do `index.html` que contêm tags de script e o CSS principal. 
    > [!IMPORTANT]
    > O script serve apenas para **facilitar a conferência visual** da ordem de carregamento e não valida se os arquivos existem no disco ou se os caminhos estão corretos.

## 📦 Publicação

Sempre que você faz um "Push" (envia suas alterações) para o GitHub, o **GitHub Pages** atualiza o site automaticamente em alguns minutos.
