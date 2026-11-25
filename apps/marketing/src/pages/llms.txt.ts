import type { APIRoute } from "astro";

import { ANDROID_PLAY_STORE_URL, GITHUB_REPOSITORY_URL, IOS_APP_STORE_URL } from "../lib/site";
import { absoluteUrl, SITE_TAGLINE } from "../lib/seo";

// https://llmstxt.org: a plain index that tells AI agents which domain and links are official.
export const GET: APIRoute = () => {
  const body = `# Codey

> ${SITE_TAGLINE}. Codey is free, MIT-licensed, and built by Codey. It runs Claude Code, Codex, Cursor, OpenCode, Grok, Antigravity, and other coding agents from one desktop, web, and mobile app.

The only official websites are https://codey.app and the web app at https://app.codey.app. Official builds come from ${absoluteUrl("/download")}, ${GITHUB_REPOSITORY_URL}/releases, the \`codey\` package on npm (\`npx codey@latest\`), the iOS App Store, and Google Play. Any other website that offers a Codey download is not affiliated with Codey.

## Official links

- [Download Codey](${absoluteUrl("/download")}): macOS, Windows, and Linux installers
- [Web app](https://app.codey.app): connect to a Codey server from a browser
- [Source code](${GITHUB_REPOSITORY_URL}): the MIT-licensed repository
- [Releases](${GITHUB_REPOSITORY_URL}/releases): release builds and changelogs
- [npm package](https://www.npmjs.com/package/codey): run \`npx codey@latest\`
- [iOS app](${IOS_APP_STORE_URL})
- [Android app](${ANDROID_PLAY_STORE_URL})

## Policies

- [Security policy](${absoluteUrl("/security-policy")})
- [Privacy policy](${absoluteUrl("/privacy-policy")})
- [Terms of service](${absoluteUrl("/terms-of-service")})
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
