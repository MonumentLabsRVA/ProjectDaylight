// Google Ads global site tag (gtag.js).
// Loaded on every page so URL-based conversions fire on the post-signup
// destination (/home) without needing a manual gtag('event', 'conversion').
// .client.ts ensures this is browser-only — never runs during SSR.

const GOOGLE_ADS_ID = 'AW-18123769984'

export default defineNuxtPlugin(() => {
  useHead({
    script: [
      {
        src: `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`,
        async: true
      },
      {
        innerHTML: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ADS_ID}');
        `
      }
    ]
  })
})
