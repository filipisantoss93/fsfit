# FS Fit Android

O aplicativo Android do FS Fit usa Trusted Web Activity (TWA) sobre a PWA publicada em `https://fit.fssolucoes.tech`.

## Identidade do aplicativo

- Nome: `FS Fit`
- Application ID: `tech.fssolucoes.fit`
- URL inicial do app: `https://fit.fssolucoes.tech/`
- Manifest PWA: `https://fit.fssolucoes.tech/manifest.webmanifest`
- Configuração TWA: `android/twa-manifest.json`

A URL inicial do Android é `/`, para que a abertura do aplicativo mostre a entrada principal do FS Fit, com acesso do personal trainer e acesso à Área do Aluno. O `start_url` do PWA web pode continuar apontando para o portal do aluno sem alterar o comportamento do app Android.

## Build de teste

O workflow `.github/workflows/android-twa-build.yml` gera um APK de teste (`app-debug.apk`) automaticamente. Esse APK é instalável em Android, mas a validação de domínio TWA em produção depende da assinatura definitiva do aplicativo.

## Build de produção

Para gerar APK/AAB assinados, configure estes GitHub Actions Secrets:

- `FSFIT_ANDROID_KEYSTORE_BASE64`: conteúdo Base64 do arquivo JKS.
- `FSFIT_ANDROID_KEYSTORE_PASSWORD`: senha do keystore.
- `FSFIT_ANDROID_KEY_PASSWORD`: senha da chave.

O alias esperado é `fsfit`.

Depois dos secrets configurados, o workflow executa o build assinado do Bubblewrap e publica os artefatos de release.

## Digital Asset Links

Antes da publicação definitiva, obtenha o fingerprint SHA-256 do certificado de assinatura do aplicativo e publique `/.well-known/assetlinks.json` em `fit.fssolucoes.tech` para a relação:

- `delegate_permission/common.handle_all_urls`
- package: `tech.fssolucoes.fit`

Se o Google Play App Signing estiver habilitado, o fingerprint que precisa estar no `assetlinks.json` é o certificado de assinatura fornecido pelo Play Console para o aplicativo distribuído. O certificado do upload pode ser mantido adicionalmente para builds instalados fora da Play Store.

## Atualizações

Como o Android usa TWA, alterações normais no HTML/CSS/JS do FS Fit entram no aplicativo assim que forem publicadas no domínio, sem exigir um novo APK/AAB. Uma nova versão Android é necessária quando houver mudança de package, ícones nativos, configuração TWA, permissões/delegações ou requisitos da Play Store.
