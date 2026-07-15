# FS Fit MVP

Plataforma da FS Soluções para personal trainers administrarem alunos, treinos, orientações e acesso individual dos alunos.

## Configuração

1. Crie ou abra o projeto no Supabase.
2. Execute `schema.sql` no SQL Editor.
3. Em `js/supabase.js`, substitua a URL e a chave `anon` pelas credenciais do projeto.
4. No Supabase Authentication, configure a URL do site e as URLs de redirecionamento.
5. A Vercel publica automaticamente a branch `main` quando o projeto está conectado ao repositório.

## Páginas

- `index.html`: login e cadastro do personal.
- `painel.html`: resumo da consultoria.
- `alunos.html`: cadastro, edição, exclusão e publicação de planos.
- `perfil.html`: nome e WhatsApp do personal.
- `aluno.html?id=TOKEN`: portal público individual do aluno.

## Estrutura visual

Todo o tema está consolidado em `css/style.css`. Não são usados arquivos CSS paralelos nem camadas de override.

## Observação

Não abra os arquivos diretamente por `file://`. Use a Vercel, Live Server ou outro servidor HTTP.
