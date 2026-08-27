[Português (Brasil)](README.md) | [English](README.en.md)

# ClickTrail JS

[![CI](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml/badge.svg)](https://github.com/vizuh/clicktrail-js/actions/workflows/ci.yml)

![ClickTrail](https://ps.w.org/click-trail-handler/assets/icon-256x256.png)

Motor determinístico de atribuição first-party. Captura a jornada desde o clique no anúncio até a conversão.

Parte do [ClickTrail](https://wordpress.org/plugins/click-trail-handler/) da Vizuh. O FunnelSheet é a frente de consultoria da Vizuh. O plugin WordPress (`click-trail-handler`) é a distribuição para WordPress; este repositório contém o motor compartilhado.

> **Status da versão:** `0.1.0-rc.4` é a candidata a lançamento preparada neste branch. A publicação no npm ainda depende das atestações de proveniência, do bootstrap 2FA dos novos nomes e da configuração de trusted publishers. O tag do GitHub dispara o workflow que publica no npm com OIDC e o dist-tag `next`.

## Por que o ClickTrail

A maioria das ferramentas de analytics responde "quantas conversões aconteceram?". O ClickTrail responde "qual clique gerou esta conversão?" e permite verificar o caminho até ela.

- **Determinístico e reproduzível.** O motor principal é puro: as mesmas entradas produzem a mesma saída. Tempo, IDs, armazenamento, consentimento e rede são injetados por quem chama o motor. Fixtures douradas capturadas do plugin WordPress funcionam como especificação executável e são reproduzidas no CI para confirmar a paridade.
- **Cookies first-party sob seu controle.** O contexto de atribuição fica no armazenamento first-party do seu próprio domínio. Não há cookies de terceiros nem identificadores controlados por um fornecedor.
- **Consentimento integrado ao fluxo.** Nada começa nem é persistido antes de o gate de consentimento do host permitir. O chamador fornece o estado de consentimento; quando o consentimento é negado ou retirado, os payloads armazenados são limpos.
- **Payload canônico plano.** Cada evento é um registro plano com campos `ft_*` (primeiro toque) e `lt_*` (último toque), além de `schema_version` e `classifier_version`. Isso facilita salvar os dados no seu banco, mapeá-los para um CRM ou encaminhá-los pelo `dataLayer` do GTM.

## Início rápido

Instale o motor:

```bash
pnpm add @vizuh/clicktrail
# or: npm install @vizuh/clicktrail
```

Para testar a candidata depois da publicação, use o dist-tag RC:

```bash
npm install @vizuh/clicktrail@next
```

Faça o parsing determinístico de uma URL de chegada com clique de anúncio em Node, em um worker ou em um teste:

```ts
import {
  emptyAttribution,
  mergeAttributionTouch,
  parseAttributionUrl,
  stampVersions,
} from '@vizuh/clicktrail';

const result = parseAttributionUrl({
  url: 'https://example.com/?utm_source=google&utm_medium=cpc&gclid=test',
  referrer: 'https://www.google.com/',
  currentHost: 'example.com',
  now: '2026-08-24T10:00:00.000Z', // caller owns the clock
});

if (result.kind === 'touch') {
  const payload = stampVersions(
    mergeAttributionTouch(emptyAttribution(), result.touch),
  );
  console.log(payload.ft_source, payload.ft_medium);
}
```

O resultado traz UTMs, IDs de clique de anúncios (`gclid`, `fbclid`, `ttclid`, ...), classificação do referenciador e rótulos de canal em campos planos `ft_*` e `lt_*`.

Consulte [docs/TUTORIALS.md](docs/TUTORIALS.md) para captura no navegador, preenchimento de formulários, continuidade entre domínios e integração com o `dataLayer`.

### Captura no navegador

No navegador, o adapter persiste o contexto observado e envia eventos canônicos para um `dataLayer` do próprio site:

```ts
import {
  createClickTrail,
  dataLayerDestination,
} from '@vizuh/clicktrail/browser';

const clickTrail = createClickTrail({
  destinations: [dataLayerDestination()],
  consentGate: () => hasMarketingConsent(), // replace with your real consent source
  storage: {
    cookieAttrs: { path: '/', sameSite: 'Lax', secure: true },
  },
  forms: {},
});

clickTrail.start();
```

Teste a integração com consentimento concedido, negado e retirado. Inclua também uma página em cache e um formulário adicionado depois do carregamento.

### Pontos de entrada (`@vizuh/clicktrail`)

| Import | Status | Uso |
|---|---|---|
| `@vizuh/clicktrail` | Stable | Motor puro de parsing e merge, constantes e tipos |
| `@vizuh/clicktrail/browser` | Stable adapter | Ciclo de vida no navegador, armazenamento, formulários, `dataLayer` e HTTP |
| `@vizuh/clicktrail/conversation` | Incubating | Metadados de jornada e conversa |
| `@vizuh/clicktrail/agent` | Incubating | Metadados de execuções de agentes e resumos de ferramentas |
| `@vizuh/clicktrail/otel` | Incubating | Helpers e destino para contexto de trace |
| `@vizuh/clicktrail/apointoo` | Incubating | Entrega de resultados do Apointoo |

Os pontos de entrada Incubating podem mudar entre versões menores. Mantenha-os atrás de um adapter do host até que seus contratos estejam estáveis.

## Pacotes

| Pacote | Status |
|---|---|
| [`@vizuh/clicktrail`](packages/clicktrail/) | Subpaths estáveis `.` e `/browser`; `/conversation`, `/agent`, `/otel` e `/apointoo` em incubação |
| [`@vizuh/clicktrail-astro`](integrations/astro/) | Integração Astro: gate de consentimento, page views com view transitions, proxy first-party e helpers de servidor |
| [`@vizuh/clicktrail-nuxt`](integrations/nuxt/) | Módulo Nuxt: gate de consentimento, page views com router, proxy Nitro first-party e helpers de servidor |
| [`n8n-nodes-clicktrail`](integrations/n8n/) | Node comunitário para n8n: operações de lead, conversão e consentimento; conversões offline; triggers de webhooks de saída ainda adiados |
| [`@vizuh/clicktrail-piece`](integrations/activepieces/) | Piece do Activepieces: oito ações, incluindo sale, refund e consent; triggers ainda adiados |
| [`@vizuh/clicktrail-typebot`](integrations/typebot/) | Lógica de bloco Typebot e rascunho de issue upstream: mapeamento de variáveis e garantia de envio sem exceções |
| [`@vizuh/clicktrail-formbricks`](integrations/formbricks/) | Mapeamento de URLs de link-survey do Formbricks, allowlist de respostas e verificação de webhooks assinados |
| [`directus-extension-clicktrail`](integrations/directus/) | Extensão Directus: operação de Flow, hook de atribuição, painel de funil e módulo de configurações |
| [`@vizuh/clicktrail-core`](packages/core/) | Motor determinístico, contrato canônico de eventos e IDs idempotentes |
| [`@vizuh/clicktrail-browser`](packages/browser/) | SDK de navegador com captura, armazenamento, formulários e destinos cientes de consentimento |
| [`@vizuh/clicktrail-consent`](packages/consent/) | Tipos de estado de consentimento, gates e hub de listeners |
| [`@vizuh/clicktrail-server`](packages/server/) | Cliente de ingestão no servidor e builders de conversão |
| [`@vizuh/clicktrail-qwik`](integrations/qwik/) | Integração Qwik/Qwik City: middleware compatível com resumability e zero JavaScript eager no cliente |
| [`@vizuh/clicktrail-sveltekit`](integrations/sveltekit/) | Handle e componente SvelteKit: captura SSR, deduplicação de navegação e conversões no servidor |
| [`@vizuh/clicktrail-sv`](integrations/sv/) | Add-on comunitário experimental para Svelte CLI: configuração em um comando |
| Pacotes Python (`python/`) | SDK `clicktrail` e adapters Django, Wagtail, ASGI, Jinja e Flask: eventos canônicos e idempotência bit a bit compatível com JS |
| [Exemplos](./examples) | Exemplos executáveis de integração |
| [Site](./site) | Site do projeto |

## Comparação

O ClickTrail é um motor de atribuição que você hospeda, não um serviço de analytics hospedado. A tabela resume diferenças de arquitetura em relação a duas alternativas comuns:

| | ClickTrail | GA4 (client-side) | Server-side tagging |
|---|---|---|---|
| Controle dos dados | Armazenamento first-party no seu domínio; os payloads chegam aos sistemas que você controla | Coletados pelo Google e processados conforme os termos do Google | O seu tag server mantém os dados em trânsito, mas a maioria das configurações ainda os encaminha a fornecedores |
| Determinismo e testes | Funções puras com replay de fixtures douradas no CI; mudanças no classificador são semver major | Pipeline de processamento do fornecedor; não é reproduzível | A configuração de tags pode ser testada, mas a lógica de atribuição continua no fornecedor |
| Consentimento | O host injeta o gate de consentimento; nada começa nem persiste sem ele; a recusa limpa os payloads | Sinais do Consent Mode; o comportamento de coleta é definido pelo Google | Configurado por tag e fornecedor; cada encaminhamento exige sua própria configuração de consentimento |
| Resistência a bloqueadores | Sem endpoints de terceiros; um proxy first-party opcional mantém a coleta no mesmo domínio | Bloqueado por listas de filtros comuns | O proxy first-party reduz bloqueios, mas os destinos dos fornecedores continuam expostos |
| Custo | Open source (MIT), self-hosted e sem cobrança por evento do fornecedor | Tier gratuito; GA360 tem preço por escala | Infraestrutura do tag server e custos de encaminhamento para cada fornecedor |

A tabela descreve diferenças arquiteturais, não um benchmark. Compare com os requisitos do seu projeto antes de escolher.

## Arquitetura em uma linha

```
conventions (meaning)  ->  core engine (pure functions)  ->  adapters (browser / server / destinations)
```

Regras de design, em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

1. O motor principal é **determinístico**: as mesmas entradas produzem a mesma saída. Tempo, IDs, armazenamento, consentimento e rede são injetados por quem chama o motor.
2. As fixtures douradas são a especificação executável. Quando uma fixture diverge da documentação, a fixture vence e a documentação é corrigida.
3. Cada payload carrega `schema_version` e `classifier_version`.
4. Mudanças no comportamento do classificador são semver major, por definição.

Atalho para desenvolvimento:

```bash
pnpm install
pnpm typecheck
pnpm -r test        # vitest, replays golden fixtures
pnpm -r build       # tsc per package
pnpm probe          # ESM + global bundle + fixture browser probe
```

## Casos de uso

- parsing determinístico de atribuição e merge de primeiro/último toque em aplicações Node ou TypeScript;
- captura no navegador que mantém o contexto observado em páginas armazenadas em cache e formulários dinâmicos;
- sites Astro que precisam de page views seguros com view transitions atrás de um gate de consentimento;
- integrações com GTM ou analytics por meio do destino browser `dataLayer`;
- testes reproduzíveis por fixtures para uma integração WordPress ou uma aplicação.

Comece pelos [tutoriais](docs/TUTORIALS.md). Os pacotes não configuram contas de fornecedores nem certificam a entrega aos destinos. A continuidade entre domínios exige estado de assinatura persistido ou assinatura e verificação fornecidas explicitamente pelo host.

## Limites da versão

As superfícies core e browser estão em desenvolvimento público. As superfícies `/conversation` e `/agent` devem permanecer limitadas a metadados e exigem os gates de privacidade documentados antes do uso com conversas, prompts, conclusões ou transcrições reais.

## Processo de release

1. As versões dos pacotes e o tag do GitHub devem ser iguais.
2. O branch de release passa por CI, typecheck, testes, build, probe e smoke de tarball em clean room.
3. Antes de criar qualquer tag, conclua o bootstrap único dos novos nomes em `tools/release/bootstrap-new-packages.sh` e configure os trusted publishers no npmjs.com.
4. Com esses pré-requisitos, a revisão do PR concluída e o SHA do `master` verificado, crie o tag `v<versão>`; isso dispara `.github/workflows/publish.yml`.
5. O workflow repete os gates e publica o primeiro wave no npm com provenance OIDC e o dist-tag `next` para versões RC.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md), [FIRST-PUBLICATION-CHECKLIST.md](docs/internal/FIRST-PUBLICATION-CHECKLIST.md) e [RELEASE-READINESS-REVIEW.md](docs/internal/RELEASE-READINESS-REVIEW.md). Não coloque tokens npm no repositório ou nos workflows.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md): regras de design, formatos congelados e decisões de paridade com WordPress
- [Tutoriais](docs/TUTORIALS.md): replay determinístico, captura no navegador, formulários e `dataLayer`
- [`README` do pacote @vizuh/clicktrail](packages/clicktrail/README.md): pontos de entrada, uso e convenções
- [`README` da integração Astro](integrations/astro/README.md): configuração e opções da integração
- [Contribuição](CONTRIBUTING.md) · [Política de segurança](SECURITY.md)

## Licença

MIT, consulte [LICENSE](LICENSE). O plugin WordPress continua sob GPL-2.0-or-later; MIT pode ser incorporada ao GPL sem conflito.
