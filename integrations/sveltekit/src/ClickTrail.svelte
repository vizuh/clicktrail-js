<!--
  @clicktrail/sveltekit — minimal browser boot component.

  Thin wrapper around bootClickTrailClient(): derives seams from the browser
  environment, prefers SvelteKit's afterNavigate seam when available, and
  defers start() until consent allows when consentRequired is configured.

  Usage in src/routes/+layout.svelte:
    <ClickTrail siteId="..." />
-->
<script lang="ts">
  import { bootClickTrailClient } from './client.js';
  import type { BootedClient } from './client.js';

  export let consent: 'auto' | 'granted' | 'denied' = 'auto';
  export let trackNavigation = true;

  let booted: BootedClient | null = null;

  function configFor(mode: 'auto' | 'granted' | 'denied'): Parameters<typeof bootClickTrailClient>[0] {
    return {
      endpoint: '/api/clicktrail',
      consentRequired: mode === 'auto',
      trackPageViews: trackNavigation,
      debug: false,
    };
  }

  async function boot(mode: 'auto' | 'granted' | 'denied'): Promise<void> {
    if (mode === 'denied' || typeof document === 'undefined') return;
    let navigationSeam = undefined;
    try {
      // SvelteKit resolves this at build time; outside SvelteKit the import
      // fails and we fall back to the history/popstate seam.
      const kit = await import('$app/navigation');
      const { afterNavigate } = kit;
      navigationSeam = {
        href: () => window.location.href,
        referrer: () => document.referrer,
        host: () => window.location.host,
        afterNavigate: (callback: () => void) => afterNavigate(callback),
      };
    } catch {
      navigationSeam = undefined; // bootClickTrailClient applies its default seam
    }
    booted = bootClickTrailClient(configFor(mode), navigationSeam ? { navigationSeam } : {});
  }

  // Svelte 4/5-compatible reactive boot: runs once per mount, client-side.
  $: boot(consent);
</script>
