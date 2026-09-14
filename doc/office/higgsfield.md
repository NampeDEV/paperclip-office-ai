# Higgsfield connection

Use Paperclip's existing **Apps → Connect an app → Connect your own MCP server** with `https://mcp.higgsfield.ai/mcp`. No provider-specific execution service or separate credential store is required.

## Verified discovery — 13 September 2026

- The official [Higgsfield connection guide](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent) identifies this endpoint and requires a paid account for generation.
- An unauthenticated MCP initialize returned HTTP 401 and advertised `https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp`.
- The protected resource advertises `openid email offline_access` and the authorization server `https://clerk.higgsfield.ai`.
- That server advertises authorization-code/refresh-token grants, PKCE-compatible browser login, a registration endpoint, and client metadata support. On this loopback instance, Paperclip must use its native dynamic registration fallback rather than public client metadata.
- Provider authorization and a real generation have **not** been verified by discovery alone.

## Live setup result

The automatic registration attempt failed closed with `oauth_dcr_response_invalid` on `grant_types`: the provider advertises refresh tokens but registers only `authorization_code`. Paperclip's validator was preserved. A public authorization-code client was registered explicitly, its returned redirect/grant/auth-method binding was checked, and its public client ID was supplied through the existing advanced OAuth client fields on the same draft connection. No provider secret was copied or exposed.

The actual native callback for this instance is `http://localhost:3100/api/tools/oauth/callback` (not the numeric-loopback spelling). Registration must match the URI returned by the native OAuth start flow. After the user completed browser login, the callback was rejected with `oauth_issuer_mismatch`. The issuer check remains intact; the connection is still disabled and has no verified access token or tool catalog. Refresh-token support and generation are unverified. Reconcile the provider's callback issuer against its advertised issuer before another authorization attempt; do not bypass the check.

## Callback diagnosis — 14 September 2026

The existing signed-in session reached consent successfully. The callback again failed before token exchange. A temporary local diagnostic recorded only the two origins: the advertised and bound issuer was `https://clerk.higgsfield.ai`, while the callback returned `https://higgsfield.ai`. The provider's authorization-server metadata still advertises the Clerk issuer. The main-site metadata path did not return an authorization-server document. The temporary diagnostic was removed from source after capture; no code or token was logged.

This is a provider metadata/callback inconsistency, not missing user login. Keep the connection disabled until the provider aligns the callback issuer with its metadata or documents a compatible configuration. Do not override the expected issuer or weaken the mix-up protection to make this attempt pass.

## Native setup

POST `/api/companies/{companyId}/tools/apps/connect` with:

```json
{"link":"https://mcp.higgsfield.ai/mcp","name":"Higgsfield","authMode":"oauth"}
```

Inspect the existing company connections before creating another draft. Continue the returned connection with POST `/api/tools/oauth/{connectionId}/start`, then complete browser sign-in. Keep durable tokens in the native vault. Do not copy credentials from another client or into the repository.

Review the discovered catalog and native access profile before enabling generation. Unknown state-changing actions start disabled/quarantined. Grant only the intended agent and operation through Paperclip's normal controls.

## Bounded Content Factory acceptance

1. Read the actual account balance and current model/cost information through the connected tools.
2. Submit one small office-themed media job. Save its provider job ID in the source task before polling.
3. If submission has an ambiguous outcome, reconcile existing jobs; do not resubmit automatically.
4. Poll the same job and record actual status. Cancel only if the discovered provider tool supports that job state.
5. Attach the returned media to the task through native artifacts/work products; verify it can be opened. Record provider-reported cost or `unknown`.
6. Retrying artifact delivery must reuse the same provider job and must not create another generation.

Publishing to external social accounts is a separate action and is not enabled by this connection setup. A plugin connected to Codex does not prove Paperclip's own instance is authenticated.
